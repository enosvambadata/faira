import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/requireAuth';
import { requireCompanyRole, CompanyRequest } from '../middleware/requireCompanyRole';
import { isAssignedToCompany } from '../lib/companyAssignment';
import { ApiError } from '../errors/ApiError';
import { recordAuditLog } from '../services/fulfilmentAuditLog';
import { notifyShipmentMilestone } from '../services/collectUkShipmentNotifications';
import { verifyShipmentTrackingToken } from '../lib/collectUkShipmentToken';
import { publicRateLimiter } from './collectUkBookings';
import { phoneSchema } from './auth';

// ---------------------------------------------------------------------------
// Owner router -- mounted at /api/v1/collect-uk/companies, so every path is
// scoped under /:id (the company). Matches collectUkCompanies.ts's three-layer
// auth: requireAuth -> requireCompanyRole -> per-request isAssignedToCompany.
// Managing shipments and posting transit updates is operational work, so both
// COMPANY_ADMIN and DISPATCHER may do it (same as dispatch/handover actions).
// ---------------------------------------------------------------------------
const router = Router();

// UK-domestic customers type their number the national way -- normalise to
// E.164 exactly like the booking form (collectUkBookings.ts) so the stored
// contact is always deliverable by sendSms.
const contactSchema = z
  .string()
  .trim()
  .transform(s => {
    const d = s.replace(/[\s().-]/g, '');
    if (d.startsWith('+')) return d;
    if (d.startsWith('00')) return `+${d.slice(2)}`;
    if (d.startsWith('0')) return `+44${d.slice(1)}`;
    if (d.startsWith('44')) return `+${d}`;
    return d;
  })
  .pipe(phoneSchema);

const createShipmentSchema = z.object({
  reference: z.string().trim().min(1).max(200),
  destinationCountry: z.string().trim().min(1).max(100).optional(),
});

const addRecipientSchema = z
  .object({
    bookingId: z.uuid().optional(),
    customerName: z.string().trim().min(1).max(200).optional(),
    customerContact: contactSchema.optional(),
  })
  .superRefine((d, ctx) => {
    const hasManual = Boolean(d.customerName || d.customerContact);
    if (d.bookingId && hasManual) {
      ctx.addIssue({ code: 'custom', message: 'Provide either a bookingId or customer details, not both' });
    }
    if (!d.bookingId && !(d.customerName && d.customerContact)) {
      ctx.addIssue({ code: 'custom', message: 'Provide a bookingId, or both customerName and customerContact' });
    }
  });

const SHIPMENT_STATUSES = ['PREPARING', 'IN_TRANSIT', 'ARRIVED', 'COMPLETED', 'CANCELLED'] as const;

const milestoneSchema = z.object({
  stage: z.string().trim().min(1).max(120),
  location: z.string().trim().max(200).optional(),
  note: z.string().trim().max(1000).optional(),
  pickupAddress: z.string().trim().max(300).optional(),
  pickupFrom: z.coerce.date().optional(),
  pickupTo: z.coerce.date().optional(),
  setStatus: z.enum(SHIPMENT_STATUSES).optional(),
  notify: z.boolean().optional().default(true),
});

function shipmentSummary(s: {
  id: string;
  reference: string;
  destinationCountry: string | null;
  status: string;
  createdAt: Date;
  _count: { recipients: number; milestones: number };
  milestones: { stage: string; createdAt: Date }[];
}) {
  return {
    id: s.id,
    reference: s.reference,
    destinationCountry: s.destinationCountry,
    status: s.status,
    createdAt: s.createdAt,
    recipientCount: s._count.recipients,
    milestoneCount: s._count.milestones,
    latestStage: s.milestones[0]?.stage ?? null,
  };
}

function recipientResponse(r: {
  id: string;
  customerName: string;
  customerContact: string;
  bookingId: string | null;
  createdAt: Date;
}) {
  return {
    id: r.id,
    customerName: r.customerName,
    customerContact: r.customerContact,
    bookingId: r.bookingId,
    createdAt: r.createdAt,
  };
}

function milestoneResponse(m: {
  id: string;
  stage: string;
  location: string | null;
  note: string | null;
  pickupAddress: string | null;
  pickupFrom: Date | null;
  pickupTo: Date | null;
  notifiedCount: number;
  createdAt: Date;
}) {
  return {
    id: m.id,
    stage: m.stage,
    location: m.location,
    note: m.note,
    pickupAddress: m.pickupAddress,
    pickupFrom: m.pickupFrom,
    pickupTo: m.pickupTo,
    notifiedCount: m.notifiedCount,
    createdAt: m.createdAt,
  };
}

// Mirrors collectUkCompanies.ts's inline assignment guard: prove the caller is
// assigned to THIS company (requireCompanyRole only proves a role somewhere),
// and audit the denial. Returns true when it has already sent the 403.
async function denyIfNotAssigned(req: CompanyRequest, companyId: string, next: NextFunction): Promise<boolean> {
  if (isAssignedToCompany(req, companyId)) return false;
  await recordAuditLog(req.userId!, 'COLLECT_UK_COMPANY_ASSIGNMENT_DENIED', {
    targetCompanyId: companyId,
    actualCompanyAssignments: (req.companyRoles ?? []).map(r => r.companyId),
  });
  next(new ApiError('FORBIDDEN', 'You are not assigned to this company', 403));
  return true;
}

const ROLES = ['COMPANY_ADMIN', 'DISPATCHER'] as const;

router.post(
  '/:id/shipments',
  requireAuth,
  requireCompanyRole(...ROLES),
  async (req: CompanyRequest & { params: { id: string } }, res: Response, next: NextFunction) => {
    const parsed = createShipmentSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    const shipment = await prisma.collectUkShipment.create({
      data: { companyId: req.params.id, reference: parsed.data.reference, destinationCountry: parsed.data.destinationCountry },
    });
    await recordAuditLog(req.userId!, 'COLLECT_UK_SHIPMENT_CREATED', { companyId: req.params.id, shipmentId: shipment.id });

    res.status(201).json({
      data: {
        id: shipment.id,
        reference: shipment.reference,
        destinationCountry: shipment.destinationCountry,
        status: shipment.status,
        createdAt: shipment.createdAt,
      },
    });
  },
);

router.get(
  '/:id/shipments',
  requireAuth,
  requireCompanyRole(...ROLES),
  async (req: CompanyRequest & { params: { id: string } }, res: Response, next: NextFunction) => {
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    const shipments = await prisma.collectUkShipment.findMany({
      where: { companyId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { recipients: true, milestones: true } },
        milestones: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    res.status(200).json({ data: shipments.map(shipmentSummary) });
  },
);

router.get(
  '/:id/shipments/:shipmentId',
  requireAuth,
  requireCompanyRole(...ROLES),
  async (req: CompanyRequest & { params: { id: string; shipmentId: string } }, res: Response, next: NextFunction) => {
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    const shipment = await prisma.collectUkShipment.findUnique({
      where: { id: req.params.shipmentId },
      include: {
        recipients: { orderBy: { createdAt: 'asc' } },
        milestones: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!shipment || shipment.companyId !== req.params.id) {
      next(new ApiError('NOT_FOUND', 'No such shipment', 404));
      return;
    }

    res.status(200).json({
      data: {
        id: shipment.id,
        reference: shipment.reference,
        destinationCountry: shipment.destinationCountry,
        status: shipment.status,
        createdAt: shipment.createdAt,
        recipients: shipment.recipients.map(recipientResponse),
        milestones: shipment.milestones.map(milestoneResponse),
      },
    });
  },
);

router.post(
  '/:id/shipments/:shipmentId/recipients',
  requireAuth,
  requireCompanyRole(...ROLES),
  async (req: CompanyRequest & { params: { id: string; shipmentId: string } }, res: Response, next: NextFunction) => {
    const parsed = addRecipientSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    const shipment = await prisma.collectUkShipment.findUnique({ where: { id: req.params.shipmentId } });
    if (!shipment || shipment.companyId !== req.params.id) {
      next(new ApiError('NOT_FOUND', 'No such shipment', 404));
      return;
    }

    let customerName: string;
    let customerContact: string;
    let bookingId: string | null = null;

    if (parsed.data.bookingId) {
      const booking = await prisma.collectUkCollectionBooking.findUnique({ where: { id: parsed.data.bookingId } });
      if (!booking || booking.companyId !== req.params.id) {
        next(new ApiError('NOT_FOUND', 'No such booking for this company', 404));
        return;
      }
      customerName = booking.customerName;
      customerContact = booking.customerContact;
      bookingId = booking.id;
    } else {
      // superRefine guarantees both are present in the manual branch.
      customerName = parsed.data.customerName!;
      customerContact = parsed.data.customerContact!;
    }

    const recipient = await prisma.collectUkShipmentRecipient.create({
      data: { shipmentId: shipment.id, bookingId, customerName, customerContact },
    });
    await recordAuditLog(req.userId!, 'COLLECT_UK_SHIPMENT_RECIPIENT_ADDED', {
      companyId: req.params.id,
      shipmentId: shipment.id,
      recipientId: recipient.id,
    });

    res.status(201).json({ data: recipientResponse(recipient) });
  },
);

router.delete(
  '/:id/shipments/:shipmentId/recipients/:recipientId',
  requireAuth,
  requireCompanyRole(...ROLES),
  async (
    req: CompanyRequest & { params: { id: string; shipmentId: string; recipientId: string } },
    res: Response,
    next: NextFunction,
  ) => {
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    const recipient = await prisma.collectUkShipmentRecipient.findUnique({
      where: { id: req.params.recipientId },
      include: { shipment: true },
    });
    if (
      !recipient ||
      recipient.shipmentId !== req.params.shipmentId ||
      recipient.shipment.companyId !== req.params.id
    ) {
      next(new ApiError('NOT_FOUND', 'No such recipient', 404));
      return;
    }

    await prisma.collectUkShipmentRecipient.delete({ where: { id: recipient.id } });
    await recordAuditLog(req.userId!, 'COLLECT_UK_SHIPMENT_RECIPIENT_REMOVED', {
      companyId: req.params.id,
      shipmentId: req.params.shipmentId,
      recipientId: recipient.id,
    });

    res.status(200).json({ data: { id: recipient.id, deleted: true } });
  },
);

router.post(
  '/:id/shipments/:shipmentId/milestones',
  requireAuth,
  requireCompanyRole(...ROLES),
  async (req: CompanyRequest & { params: { id: string; shipmentId: string } }, res: Response, next: NextFunction) => {
    const parsed = milestoneSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    const shipment = await prisma.collectUkShipment.findUnique({ where: { id: req.params.shipmentId } });
    if (!shipment || shipment.companyId !== req.params.id) {
      next(new ApiError('NOT_FOUND', 'No such shipment', 404));
      return;
    }

    const milestone = await prisma.collectUkShipmentMilestone.create({
      data: {
        shipmentId: shipment.id,
        stage: parsed.data.stage,
        location: parsed.data.location,
        note: parsed.data.note,
        pickupAddress: parsed.data.pickupAddress,
        pickupFrom: parsed.data.pickupFrom,
        pickupTo: parsed.data.pickupTo,
      },
    });

    if (parsed.data.setStatus) {
      await prisma.collectUkShipment.update({ where: { id: shipment.id }, data: { status: parsed.data.setStatus } });
    }

    // Fan-out is best-effort and never throws; it returns how many recipients
    // were texted so we can stamp the milestone.
    let notifiedCount = 0;
    if (parsed.data.notify) {
      notifiedCount = await notifyShipmentMilestone(shipment.id, milestone.id);
      if (notifiedCount > 0) {
        await prisma.collectUkShipmentMilestone.update({ where: { id: milestone.id }, data: { notifiedCount } });
      }
    }

    await recordAuditLog(req.userId!, 'COLLECT_UK_SHIPMENT_MILESTONE_POSTED', {
      companyId: req.params.id,
      shipmentId: shipment.id,
      milestoneId: milestone.id,
      notifiedCount,
    });

    res.status(201).json({ data: milestoneResponse({ ...milestone, notifiedCount }) });
  },
);

// ---------------------------------------------------------------------------
// Public tracking router -- mounted at /api/v1/collect-uk. A signed recipient
// token is the only thing gating access (manual recipients have no account),
// exactly like booking tracking. Shares the public rate limiter.
// ---------------------------------------------------------------------------
const trackingRouter = Router();

trackingRouter.get(
  '/shipment-tracking/:token',
  publicRateLimiter,
  async (req: Request<{ token: string }>, res: Response, next: NextFunction) => {
    const verified = verifyShipmentTrackingToken(req.params.token);
    if (!verified) {
      next(new ApiError('INVALID_TOKEN', 'This tracking link is invalid or has expired', 404));
      return;
    }

    const recipient = await prisma.collectUkShipmentRecipient.findUnique({
      where: { id: verified.recipientId },
      include: { shipment: { include: { company: true, milestones: { orderBy: { createdAt: 'asc' } } } } },
    });
    if (!recipient) {
      next(new ApiError('INVALID_TOKEN', 'This tracking link is invalid or has expired', 404));
      return;
    }

    res.status(200).json({
      data: {
        reference: recipient.shipment.reference,
        destinationCountry: recipient.shipment.destinationCountry,
        companyName: recipient.shipment.company.name,
        status: recipient.shipment.status,
        customerName: recipient.customerName,
        milestones: recipient.shipment.milestones.map(milestoneResponse),
      },
    });
  },
);

export { trackingRouter as collectUkShipmentTrackingRouter };
export default router;
