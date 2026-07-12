import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/requireAuth';
import { requireCompanyRole, CompanyRequest } from '../middleware/requireCompanyRole';
import { isAssignedToCompany } from '../lib/companyAssignment';
import { ApiError } from '../errors/ApiError';
import { recordAuditLog } from '../services/fulfilmentAuditLog';

const router = Router();

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Appends -2, -3, ... until an unused slug is found -- company names
// aren't expected to collide often at pilot scale, so a simple retry loop
// is enough (no need for a sequence counter like Hub's shipment reference).
async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || 'company';
  let candidate = base;
  let suffix = 2;
  while (await prisma.collectUkCompany.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function companyResponse(company: {
  id: string;
  name: string;
  slug: string;
  countriesServed: string[];
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    countriesServed: company.countriesServed,
    isActive: company.isActive,
    createdAt: company.createdAt,
  };
}

const createCompanySchema = z.object({
  name: z.string().trim().min(1).max(200),
  countriesServed: z.array(z.string().trim().min(1)).min(1),
});

// Self-serve -- any authenticated user can register a company and becomes
// its first COMPANY_ADMIN automatically. Matches Fulfilment's seller
// self-onboarding precedent rather than requiring an admin to provision
// every tenant by hand.
router.post('/', requireAuth, async (req: CompanyRequest, res: Response, next: NextFunction) => {
  const parsed = createCompanySchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
    return;
  }

  const slug = await generateUniqueSlug(parsed.data.name);

  const company = await prisma.$transaction(async tx => {
    const created = await tx.collectUkCompany.create({
      data: { name: parsed.data.name, slug, countriesServed: parsed.data.countriesServed },
    });
    await tx.collectUkCompanyRole.create({
      data: { userId: req.userId!, companyId: created.id, role: 'COMPANY_ADMIN' },
    });
    return created;
  });

  await recordAuditLog(req.userId!, 'COLLECT_UK_COMPANY_CREATED', { companyId: company.id, name: company.name });

  res.status(201).json({ data: companyResponse(company) });
});

// Lets the web app discover which companies the caller belongs to (and
// with what role) without already knowing a company id -- the entry
// point for the Company Portal.
router.get('/mine', requireAuth, async (req: CompanyRequest, res: Response) => {
  const roles = await prisma.collectUkCompanyRole.findMany({
    where: { userId: req.userId! },
    include: { company: true },
  });

  res.status(200).json({
    data: roles.map(r => ({ ...companyResponse(r.company), role: r.role })),
  });
});

router.get(
  '/:id',
  requireAuth,
  requireCompanyRole('COMPANY_ADMIN', 'DISPATCHER'),
  async (req: CompanyRequest & { params: { id: string } }, res: Response, next: NextFunction) => {
    const company = await prisma.collectUkCompany.findUnique({ where: { id: req.params.id } });
    if (!company) {
      next(new ApiError('NOT_FOUND', 'Company not found', 404));
      return;
    }
    if (!isAssignedToCompany(req, company.id)) {
      await recordAuditLog(req.userId!, 'COLLECT_UK_COMPANY_ASSIGNMENT_DENIED', {
        targetCompanyId: company.id,
        actualCompanyAssignments: (req.companyRoles ?? []).map(r => r.companyId),
      });
      next(new ApiError('FORBIDDEN', 'You are not assigned to this company', 403));
      return;
    }

    res.status(200).json({ data: companyResponse(company) });
  },
);

const updateCompanySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  countriesServed: z.array(z.string().trim().min(1)).min(1).optional(),
});

router.patch(
  '/:id',
  requireAuth,
  requireCompanyRole('COMPANY_ADMIN'),
  async (req: CompanyRequest & { params: { id: string } }, res: Response, next: NextFunction) => {
    const parsed = updateCompanySchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const company = await prisma.collectUkCompany.findUnique({ where: { id: req.params.id } });
    if (!company) {
      next(new ApiError('NOT_FOUND', 'Company not found', 404));
      return;
    }
    if (!isAssignedToCompany(req, company.id)) {
      await recordAuditLog(req.userId!, 'COLLECT_UK_COMPANY_ASSIGNMENT_DENIED', {
        targetCompanyId: company.id,
        actualCompanyAssignments: (req.companyRoles ?? []).map(r => r.companyId),
      });
      next(new ApiError('FORBIDDEN', 'You are not assigned to this company', 403));
      return;
    }

    const updated = await prisma.collectUkCompany.update({
      where: { id: company.id },
      data: parsed.data,
    });
    await recordAuditLog(req.userId!, 'COLLECT_UK_COMPANY_UPDATED', { companyId: company.id });

    res.status(200).json({ data: companyResponse(updated) });
  },
);

function warehouseResponse(w: {
  id: string;
  companyId: string;
  name: string;
  address: string;
  city: string;
  postcode: string;
  openingHours: string;
  isActive: boolean;
}) {
  return {
    id: w.id,
    companyId: w.companyId,
    name: w.name,
    address: w.address,
    city: w.city,
    postcode: w.postcode,
    openingHours: w.openingHours,
    isActive: w.isActive,
  };
}

router.get(
  '/:id/warehouses',
  requireAuth,
  requireCompanyRole('COMPANY_ADMIN', 'DISPATCHER'),
  async (req: CompanyRequest & { params: { id: string } }, res: Response, next: NextFunction) => {
    if (!isAssignedToCompany(req, req.params.id)) {
      await recordAuditLog(req.userId!, 'COLLECT_UK_COMPANY_ASSIGNMENT_DENIED', {
        targetCompanyId: req.params.id,
        actualCompanyAssignments: (req.companyRoles ?? []).map(r => r.companyId),
      });
      next(new ApiError('FORBIDDEN', 'You are not assigned to this company', 403));
      return;
    }

    const warehouses = await prisma.collectUkCompanyWarehouse.findMany({
      where: { companyId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    res.status(200).json({ data: warehouses.map(warehouseResponse) });
  },
);

const warehouseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(300),
  city: z.string().trim().min(1).max(100),
  postcode: z.string().trim().min(1).max(20),
  openingHours: z.string().trim().min(1).max(200),
});

router.post(
  '/:id/warehouses',
  requireAuth,
  requireCompanyRole('COMPANY_ADMIN'),
  async (req: CompanyRequest & { params: { id: string } }, res: Response, next: NextFunction) => {
    const parsed = warehouseSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }
    if (!isAssignedToCompany(req, req.params.id)) {
      await recordAuditLog(req.userId!, 'COLLECT_UK_COMPANY_ASSIGNMENT_DENIED', {
        targetCompanyId: req.params.id,
        actualCompanyAssignments: (req.companyRoles ?? []).map(r => r.companyId),
      });
      next(new ApiError('FORBIDDEN', 'You are not assigned to this company', 403));
      return;
    }

    const warehouse = await prisma.collectUkCompanyWarehouse.create({
      data: { companyId: req.params.id, ...parsed.data },
    });
    await recordAuditLog(req.userId!, 'COLLECT_UK_WAREHOUSE_CREATED', { companyId: req.params.id, warehouseId: warehouse.id });

    res.status(201).json({ data: warehouseResponse(warehouse) });
  },
);

const updateWarehouseSchema = warehouseSchema.partial().extend({
  isActive: z.boolean().optional(),
});

router.patch(
  '/:id/warehouses/:warehouseId',
  requireAuth,
  requireCompanyRole('COMPANY_ADMIN'),
  async (req: CompanyRequest & { params: { id: string; warehouseId: string } }, res: Response, next: NextFunction) => {
    const parsed = updateWarehouseSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }
    if (!isAssignedToCompany(req, req.params.id)) {
      await recordAuditLog(req.userId!, 'COLLECT_UK_COMPANY_ASSIGNMENT_DENIED', {
        targetCompanyId: req.params.id,
        actualCompanyAssignments: (req.companyRoles ?? []).map(r => r.companyId),
      });
      next(new ApiError('FORBIDDEN', 'You are not assigned to this company', 403));
      return;
    }

    const warehouse = await prisma.collectUkCompanyWarehouse.findUnique({ where: { id: req.params.warehouseId } });
    if (!warehouse || warehouse.companyId !== req.params.id) {
      next(new ApiError('NOT_FOUND', 'Warehouse not found', 404));
      return;
    }

    const updated = await prisma.collectUkCompanyWarehouse.update({
      where: { id: warehouse.id },
      data: parsed.data,
    });
    await recordAuditLog(req.userId!, 'COLLECT_UK_WAREHOUSE_UPDATED', { companyId: req.params.id, warehouseId: warehouse.id });

    res.status(200).json({ data: warehouseResponse(updated) });
  },
);

export default router;
