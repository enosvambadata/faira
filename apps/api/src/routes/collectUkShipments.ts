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

// A manifest line item. The receiver/consignee phone is a destination number
// (not UK) so it is NOT normalised the way sender contacts are. sender comes
// from a shipment recipient (copied) or is typed directly.
const parcelSchema = z
  .object({
    recipientId: z.uuid().optional(),
    senderName: z.string().trim().min(1).max(200).optional(),
    receiverName: z.string().trim().min(1).max(200),
    receiverContact: z.string().trim().max(40).optional(),
    receiverAddress: z.string().trim().max(300).optional(),
    receiverCity: z.string().trim().max(120).optional(),
    description: z.string().trim().min(1).max(500),
    category: z.string().trim().max(120).optional(),
    pieces: z.number().int().min(1).max(1000).optional().default(1),
    weightKg: z.number().positive().max(100000).optional(),
    declaredValuePence: z.number().int().min(0).max(100000000).optional(),
  })
  .superRefine((d, ctx) => {
    if (!d.recipientId && !d.senderName) {
      ctx.addIssue({ code: 'custom', path: ['senderName'], message: 'Provide a recipientId or a senderName' });
    }
  });

const patchParcelSchema = z.object({
  senderName: z.string().trim().min(1).max(200).optional(),
  receiverName: z.string().trim().min(1).max(200).optional(),
  receiverContact: z.string().trim().max(40).nullable().optional(),
  receiverAddress: z.string().trim().max(300).nullable().optional(),
  receiverCity: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().min(1).max(500).optional(),
  category: z.string().trim().max(120).nullable().optional(),
  pieces: z.number().int().min(1).max(1000).optional(),
  weightKg: z.number().positive().max(100000).nullable().optional(),
  declaredValuePence: z.number().int().min(0).max(100000000).nullable().optional(),
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

interface ParcelRow {
  id: string;
  recipientId: string | null;
  senderName: string;
  receiverName: string;
  receiverContact: string | null;
  receiverAddress: string | null;
  receiverCity: string | null;
  description: string;
  category: string | null;
  pieces: number;
  // Prisma Decimal (or null) -- normalised to a number for the client.
  weightKg: unknown;
  declaredValuePence: number | null;
  loadedAt: Date | null;
  createdAt: Date;
}

function parcelResponse(p: ParcelRow) {
  return {
    id: p.id,
    recipientId: p.recipientId,
    senderName: p.senderName,
    receiverName: p.receiverName,
    receiverContact: p.receiverContact,
    receiverAddress: p.receiverAddress,
    receiverCity: p.receiverCity,
    description: p.description,
    category: p.category,
    pieces: p.pieces,
    weightKg: p.weightKg == null ? null : Number(p.weightKg),
    declaredValuePence: p.declaredValuePence,
    loadedAt: p.loadedAt,
    createdAt: p.createdAt,
  };
}

function manifestSummary(parcels: ParcelRow[], finalizedAt: Date | null) {
  return {
    finalizedAt,
    parcelCount: parcels.length,
    loadedCount: parcels.reduce((s, p) => s + (p.loadedAt ? 1 : 0), 0),
    totalPieces: parcels.reduce((s, p) => s + p.pieces, 0),
    totalWeightKg: parcels.reduce((s, p) => s + (p.weightKg == null ? 0 : Number(p.weightKg)), 0),
    totalDeclaredValuePence: parcels.reduce((s, p) => s + (p.declaredValuePence ?? 0), 0),
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
        parcels: { orderBy: { createdAt: 'asc' } },
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
        manifestFinalizedAt: shipment.manifestFinalizedAt,
        createdAt: shipment.createdAt,
        recipients: shipment.recipients.map(recipientResponse),
        milestones: shipment.milestones.map(milestoneResponse),
        parcels: shipment.parcels.map(parcelResponse),
        manifest: manifestSummary(shipment.parcels, shipment.manifestFinalizedAt),
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

// --- Manifest: parcel line items -------------------------------------------

router.post(
  '/:id/shipments/:shipmentId/parcels',
  requireAuth,
  requireCompanyRole(...ROLES),
  async (req: CompanyRequest & { params: { id: string; shipmentId: string } }, res: Response, next: NextFunction) => {
    const parsed = parcelSchema.safeParse(req.body);
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
    if (shipment.manifestFinalizedAt) {
      next(new ApiError('INVALID_STATE', 'This manifest is finalized and can no longer be changed', 409));
      return;
    }

    let recipientId: string | null = null;
    let senderName = parsed.data.senderName;
    if (parsed.data.recipientId) {
      const recipient = await prisma.collectUkShipmentRecipient.findUnique({ where: { id: parsed.data.recipientId } });
      if (!recipient || recipient.shipmentId !== shipment.id) {
        next(new ApiError('NOT_FOUND', 'No such recipient on this shipment', 404));
        return;
      }
      recipientId = recipient.id;
      senderName = senderName || recipient.customerName;
    }

    const parcel = await prisma.collectUkShipmentParcel.create({
      data: {
        shipmentId: shipment.id,
        recipientId,
        // superRefine guarantees senderName is set when there's no recipient.
        senderName: senderName!,
        receiverName: parsed.data.receiverName,
        receiverContact: parsed.data.receiverContact,
        receiverAddress: parsed.data.receiverAddress,
        receiverCity: parsed.data.receiverCity,
        description: parsed.data.description,
        category: parsed.data.category,
        pieces: parsed.data.pieces,
        weightKg: parsed.data.weightKg,
        declaredValuePence: parsed.data.declaredValuePence,
      },
    });
    await recordAuditLog(req.userId!, 'COLLECT_UK_SHIPMENT_PARCEL_ADDED', {
      companyId: req.params.id,
      shipmentId: shipment.id,
      parcelId: parcel.id,
    });

    res.status(201).json({ data: parcelResponse(parcel) });
  },
);

router.patch(
  '/:id/shipments/:shipmentId/parcels/:parcelId',
  requireAuth,
  requireCompanyRole(...ROLES),
  async (
    req: CompanyRequest & { params: { id: string; shipmentId: string; parcelId: string } },
    res: Response,
    next: NextFunction,
  ) => {
    const parsed = patchParcelSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    const parcel = await prisma.collectUkShipmentParcel.findUnique({
      where: { id: req.params.parcelId },
      include: { shipment: true },
    });
    if (!parcel || parcel.shipmentId !== req.params.shipmentId || parcel.shipment.companyId !== req.params.id) {
      next(new ApiError('NOT_FOUND', 'No such parcel', 404));
      return;
    }
    if (parcel.shipment.manifestFinalizedAt) {
      next(new ApiError('INVALID_STATE', 'This manifest is finalized and can no longer be changed', 409));
      return;
    }

    // undefined fields are skipped by Prisma; explicit null clears an optional.
    const updated = await prisma.collectUkShipmentParcel.update({
      where: { id: parcel.id },
      data: {
        senderName: parsed.data.senderName,
        receiverName: parsed.data.receiverName,
        receiverContact: parsed.data.receiverContact,
        receiverAddress: parsed.data.receiverAddress,
        receiverCity: parsed.data.receiverCity,
        description: parsed.data.description,
        category: parsed.data.category,
        pieces: parsed.data.pieces,
        weightKg: parsed.data.weightKg,
        declaredValuePence: parsed.data.declaredValuePence,
      },
    });

    res.status(200).json({ data: parcelResponse(updated) });
  },
);

router.delete(
  '/:id/shipments/:shipmentId/parcels/:parcelId',
  requireAuth,
  requireCompanyRole(...ROLES),
  async (
    req: CompanyRequest & { params: { id: string; shipmentId: string; parcelId: string } },
    res: Response,
    next: NextFunction,
  ) => {
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    const parcel = await prisma.collectUkShipmentParcel.findUnique({
      where: { id: req.params.parcelId },
      include: { shipment: true },
    });
    if (!parcel || parcel.shipmentId !== req.params.shipmentId || parcel.shipment.companyId !== req.params.id) {
      next(new ApiError('NOT_FOUND', 'No such parcel', 404));
      return;
    }
    if (parcel.shipment.manifestFinalizedAt) {
      next(new ApiError('INVALID_STATE', 'This manifest is finalized and can no longer be changed', 409));
      return;
    }

    await prisma.collectUkShipmentParcel.delete({ where: { id: parcel.id } });
    res.status(200).json({ data: { id: parcel.id, deleted: true } });
  },
);

// Seal the manifest: once finalized it's the official cargo list, so parcels
// can no longer change. Requires at least one parcel.
router.post(
  '/:id/shipments/:shipmentId/manifest/finalize',
  requireAuth,
  requireCompanyRole(...ROLES),
  async (req: CompanyRequest & { params: { id: string; shipmentId: string } }, res: Response, next: NextFunction) => {
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    const shipment = await prisma.collectUkShipment.findUnique({
      where: { id: req.params.shipmentId },
      include: { parcels: true },
    });
    if (!shipment || shipment.companyId !== req.params.id) {
      next(new ApiError('NOT_FOUND', 'No such shipment', 404));
      return;
    }
    if (shipment.manifestFinalizedAt) {
      next(new ApiError('INVALID_STATE', 'This manifest is already finalized', 409));
      return;
    }
    if (shipment.parcels.length === 0) {
      next(new ApiError('INVALID_STATE', 'Add at least one parcel before finalizing the manifest', 409));
      return;
    }

    const updated = await prisma.collectUkShipment.update({
      where: { id: shipment.id },
      data: { manifestFinalizedAt: new Date() },
    });
    await recordAuditLog(req.userId!, 'COLLECT_UK_SHIPMENT_MANIFEST_FINALIZED', {
      companyId: req.params.id,
      shipmentId: shipment.id,
    });

    res.status(200).json({ data: { finalizedAt: updated.manifestFinalizedAt } });
  },
);

// --- Load-out: scan parcels onto the container ------------------------------

router.post(
  '/:id/shipments/:shipmentId/parcels/:parcelId/load',
  requireAuth,
  requireCompanyRole(...ROLES),
  async (
    req: CompanyRequest & { params: { id: string; shipmentId: string; parcelId: string } },
    res: Response,
    next: NextFunction,
  ) => {
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    const parcel = await prisma.collectUkShipmentParcel.findUnique({
      where: { id: req.params.parcelId },
      include: { shipment: true },
    });
    if (!parcel || parcel.shipmentId !== req.params.shipmentId || parcel.shipment.companyId !== req.params.id) {
      next(new ApiError('NOT_FOUND', 'No parcel with that code on this shipment', 404));
      return;
    }

    // Idempotent: a re-scan of an already-loaded parcel just says so.
    if (parcel.loadedAt) {
      res.status(200).json({ data: { ...parcelResponse(parcel), alreadyLoaded: true } });
      return;
    }

    const updated = await prisma.collectUkShipmentParcel.update({
      where: { id: parcel.id },
      data: { loadedAt: new Date() },
    });
    await recordAuditLog(req.userId!, 'COLLECT_UK_SHIPMENT_PARCEL_LOADED', {
      companyId: req.params.id,
      shipmentId: req.params.shipmentId,
      parcelId: parcel.id,
    });

    res.status(200).json({ data: { ...parcelResponse(updated), alreadyLoaded: false } });
  },
);

router.post(
  '/:id/shipments/:shipmentId/parcels/:parcelId/unload',
  requireAuth,
  requireCompanyRole(...ROLES),
  async (
    req: CompanyRequest & { params: { id: string; shipmentId: string; parcelId: string } },
    res: Response,
    next: NextFunction,
  ) => {
    if (await denyIfNotAssigned(req, req.params.id, next)) return;

    const parcel = await prisma.collectUkShipmentParcel.findUnique({
      where: { id: req.params.parcelId },
      include: { shipment: true },
    });
    if (!parcel || parcel.shipmentId !== req.params.shipmentId || parcel.shipment.companyId !== req.params.id) {
      next(new ApiError('NOT_FOUND', 'No parcel with that code on this shipment', 404));
      return;
    }

    const updated = await prisma.collectUkShipmentParcel.update({ where: { id: parcel.id }, data: { loadedAt: null } });
    res.status(200).json({ data: parcelResponse(updated) });
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
