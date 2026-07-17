import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/requireAuth';
import { requireCompanyRole, CompanyRequest } from '../middleware/requireCompanyRole';
import { isAssignedToCompany } from '../lib/companyAssignment';
import { ApiError } from '../errors/ApiError';
import { recordAuditLog } from '../services/fulfilmentAuditLog';
import { stripeConfigured, createCheckoutSession } from '../lib/collectUkStripe';
import { logger } from '../logger';

// Vamba Shipping customer payments. Company-scoped (runs under the Vamba
// Shipping company), one shared Vamba Stripe account. Taking a payment is
// operational, so COMPANY_ADMIN and DISPATCHER can both create/read.
const router = Router();

async function denyIfNotAssigned(req: CompanyRequest, companyId: string, next: NextFunction): Promise<boolean> {
  if (isAssignedToCompany(req, companyId)) return false;
  await recordAuditLog(req.userId!, 'COLLECT_UK_COMPANY_ASSIGNMENT_DENIED', {
    targetCompanyId: companyId,
    actualCompanyAssignments: (req.companyRoles ?? []).map(r => r.companyId),
  });
  next(new ApiError('FORBIDDEN', 'You are not assigned to this company', 403));
  return true;
}

function paymentResponse(p: {
  id: string;
  customerName: string;
  customerContact: string | null;
  description: string;
  amountPence: number;
  currency: string;
  status: string;
  checkoutUrl: string | null;
  shipmentId: string | null;
  paidAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: p.id,
    customerName: p.customerName,
    customerContact: p.customerContact,
    description: p.description,
    amountPence: p.amountPence,
    currency: p.currency,
    status: p.status,
    checkoutUrl: p.checkoutUrl,
    shipmentId: p.shipmentId,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
  };
}

const createSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
  customerContact: z.string().trim().max(120).optional(),
  description: z.string().trim().min(1).max(1000),
  amountPence: z.number().int().min(100).max(100000000), // >= £1
  shipmentId: z.uuid().optional(),
});

const ROLES = ['COMPANY_ADMIN', 'DISPATCHER'] as const;

router.post(
  '/:id/payments',
  requireAuth,
  requireCompanyRole(...ROLES),
  async (req: CompanyRequest & { params: { id: string } }, res: Response, next: NextFunction) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    if (!stripeConfigured()) {
      next(new ApiError('STRIPE_NOT_CONFIGURED', "Card payments aren't switched on yet", 503));
      return;
    }

    if (parsed.data.shipmentId) {
      const shipment = await prisma.collectUkShipment.findUnique({ where: { id: parsed.data.shipmentId } });
      if (!shipment || shipment.companyId !== req.params.id) {
        next(new ApiError('NOT_FOUND', 'No such shipment', 404));
        return;
      }
    }

    // Create the payment row first so its id is the Stripe metadata reference
    // (mirrors the Paynow initiate flow), then create the Checkout Session.
    const payment = await prisma.collectUkPayment.create({
      data: {
        companyId: req.params.id,
        shipmentId: parsed.data.shipmentId,
        customerName: parsed.data.customerName,
        customerContact: parsed.data.customerContact,
        description: parsed.data.description,
        amountPence: parsed.data.amountPence,
      },
    });

    const webAppUrl = process.env.WEB_APP_URL || 'http://localhost:3100';
    try {
      const session = await createCheckoutSession({
        amountPence: payment.amountPence,
        currency: payment.currency,
        description: payment.description,
        customerName: payment.customerName,
        successUrl: `${webAppUrl}/collect-uk/pay/success?ref=${payment.id}`,
        cancelUrl: `${webAppUrl}/collect-uk/pay/cancelled`,
        metadata: { paymentId: payment.id, companyId: req.params.id },
      });

      const updated = await prisma.collectUkPayment.update({
        where: { id: payment.id },
        data: { stripeSessionId: session.id, checkoutUrl: session.url },
      });
      await recordAuditLog(req.userId!, 'COLLECT_UK_PAYMENT_CREATED', {
        companyId: req.params.id,
        paymentId: payment.id,
        amountPence: payment.amountPence,
      });

      res.status(201).json({ data: paymentResponse(updated) });
    } catch (err) {
      logger.error({ err, paymentId: payment.id }, 'Stripe checkout session creation failed');
      await prisma.collectUkPayment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      next(new ApiError('STRIPE_ERROR', 'Could not create the payment link right now', 502));
    }
  },
);

router.get(
  '/:id/payments',
  requireAuth,
  requireCompanyRole(...ROLES),
  async (req: CompanyRequest & { params: { id: string } }, res: Response, next: NextFunction) => {
    if (await denyIfNotAssigned(req, req.params.id, next)) return;
    const payments = await prisma.collectUkPayment.findMany({
      where: { companyId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ data: payments.map(paymentResponse) });
  },
);

router.get(
  '/:id/payments/:paymentId',
  requireAuth,
  requireCompanyRole(...ROLES),
  async (req: CompanyRequest & { params: { id: string; paymentId: string } }, res: Response, next: NextFunction) => {
    if (await denyIfNotAssigned(req, req.params.id, next)) return;
    const payment = await prisma.collectUkPayment.findUnique({ where: { id: req.params.paymentId } });
    if (!payment || payment.companyId !== req.params.id) {
      next(new ApiError('NOT_FOUND', 'No such payment', 404));
      return;
    }
    res.status(200).json({ data: paymentResponse(payment) });
  },
);

export default router;
