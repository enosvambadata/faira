import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/requireAuth';
import { requireCompanyRole, CompanyRequest } from '../middleware/requireCompanyRole';
import { isAssignedToCompany } from '../lib/companyAssignment';
import { ApiError } from '../errors/ApiError';
import { recordAuditLog } from '../services/fulfilmentAuditLog';
import { UK_ZIM_FREIGHT_CATALOGUE } from '../lib/collectUkFreightCatalogue';

// A shipping company's own customer-facing price list (what it charges to ship
// an item to the destination). Mounted at /api/v1/collect-uk/companies, same
// three-layer auth as the rest of the portal. Reads allow both roles (so a
// dispatcher can quote); price changes are COMPANY_ADMIN only.
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

function rateResponse(r: {
  id: string;
  category: string;
  itemName: string;
  pricePence: number;
  sortOrder: number;
  isActive: boolean;
}) {
  return {
    id: r.id,
    category: r.category,
    itemName: r.itemName,
    pricePence: r.pricePence,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
  };
}

const createSchema = z.object({
  category: z.string().trim().min(1).max(120),
  itemName: z.string().trim().min(1).max(200),
  pricePence: z.number().int().min(0).max(100000000),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});

const patchSchema = z.object({
  category: z.string().trim().min(1).max(120).optional(),
  itemName: z.string().trim().min(1).max(200).optional(),
  pricePence: z.number().int().min(0).max(100000000).optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
});

router.get(
  '/:id/freight-rates',
  requireAuth,
  requireCompanyRole('COMPANY_ADMIN', 'DISPATCHER'),
  async (req: CompanyRequest & { params: { id: string } }, res: Response, next: NextFunction) => {
    if (await denyIfNotAssigned(req, req.params.id, next)) return;
    const rates = await prisma.collectUkFreightRate.findMany({
      where: { companyId: req.params.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    res.status(200).json({ data: rates.map(rateResponse) });
  },
);

// Seed the standard UK -> Zimbabwe catalogue. Only when the company has no
// rates yet, so it can't create duplicates on repeat taps.
router.post(
  '/:id/freight-rates/seed',
  requireAuth,
  requireCompanyRole('COMPANY_ADMIN'),
  async (req: CompanyRequest & { params: { id: string } }, res: Response, next: NextFunction) => {
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    const existing = await prisma.collectUkFreightRate.count({ where: { companyId: req.params.id } });
    if (existing > 0) {
      res.status(200).json({ data: { created: 0, alreadyPopulated: true } });
      return;
    }

    await prisma.collectUkFreightRate.createMany({
      data: UK_ZIM_FREIGHT_CATALOGUE.map((item, i) => ({
        companyId: req.params.id,
        category: item.category,
        itemName: item.itemName,
        pricePence: item.pricePence,
        sortOrder: i,
      })),
    });
    await recordAuditLog(req.userId!, 'COLLECT_UK_FREIGHT_RATES_SEEDED', {
      companyId: req.params.id,
      count: UK_ZIM_FREIGHT_CATALOGUE.length,
    });

    res.status(201).json({ data: { created: UK_ZIM_FREIGHT_CATALOGUE.length, alreadyPopulated: false } });
  },
);

router.post(
  '/:id/freight-rates',
  requireAuth,
  requireCompanyRole('COMPANY_ADMIN'),
  async (req: CompanyRequest & { params: { id: string } }, res: Response, next: NextFunction) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    const rate = await prisma.collectUkFreightRate.create({
      data: {
        companyId: req.params.id,
        category: parsed.data.category,
        itemName: parsed.data.itemName,
        pricePence: parsed.data.pricePence,
        sortOrder: parsed.data.sortOrder ?? 0,
      },
    });
    await recordAuditLog(req.userId!, 'COLLECT_UK_FREIGHT_RATE_ADDED', { companyId: req.params.id, rateId: rate.id });
    res.status(201).json({ data: rateResponse(rate) });
  },
);

router.patch(
  '/:id/freight-rates/:rateId',
  requireAuth,
  requireCompanyRole('COMPANY_ADMIN'),
  async (req: CompanyRequest & { params: { id: string; rateId: string } }, res: Response, next: NextFunction) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    const rate = await prisma.collectUkFreightRate.findUnique({ where: { id: req.params.rateId } });
    if (!rate || rate.companyId !== req.params.id) {
      next(new ApiError('NOT_FOUND', 'No such rate', 404));
      return;
    }

    const updated = await prisma.collectUkFreightRate.update({
      where: { id: rate.id },
      data: {
        category: parsed.data.category,
        itemName: parsed.data.itemName,
        pricePence: parsed.data.pricePence,
        sortOrder: parsed.data.sortOrder,
        isActive: parsed.data.isActive,
      },
    });
    res.status(200).json({ data: rateResponse(updated) });
  },
);

router.delete(
  '/:id/freight-rates/:rateId',
  requireAuth,
  requireCompanyRole('COMPANY_ADMIN'),
  async (req: CompanyRequest & { params: { id: string; rateId: string } }, res: Response, next: NextFunction) => {
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    const rate = await prisma.collectUkFreightRate.findUnique({ where: { id: req.params.rateId } });
    if (!rate || rate.companyId !== req.params.id) {
      next(new ApiError('NOT_FOUND', 'No such rate', 404));
      return;
    }

    await prisma.collectUkFreightRate.delete({ where: { id: rate.id } });
    res.status(200).json({ data: { id: rate.id, deleted: true } });
  },
);

export default router;
