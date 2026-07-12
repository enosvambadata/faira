import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/requireAuth';
import { requireFulfilmentRole, FulfilmentRequest } from '../middleware/requireFulfilmentRole';
import { isAssignedToHub } from '../lib/hubAssignment';
import { canTransition } from '../lib/shipmentStateMachine';
import { ApiError } from '../errors/ApiError';
import { recordAuditLog } from '../services/fulfilmentAuditLog';
import { generateCollectionCode } from '../services/collectionCode';
import { notifyBuyerReadyForCollection } from '../services/fulfilmentNotifications';
import { SYSTEM_CONFIG_KEYS } from '../lib/systemConfigKeys';

const router = Router();

// Every write here is Hub-Supervisor-only, scoped to the run's route's
// origin hub -- the ticket only states this explicitly for finalization,
// but the same reasoning (chain-of-custody sensitive) applies to
// assigning/removing parcels too, so it's applied uniformly rather than
// leaving create/add/remove unexpectedly looser than finalize.
class ManifestTransitionConflict extends Error {}

async function loadAssignedManifest(
  req: FulfilmentRequest,
  id: string,
): Promise<
  | {
      manifest: { id: string; runId: string; status: string; finalizedAt: Date | null; finalizedById: string | null; createdAt: Date };
      originHubId: string;
    }
  | { error: ApiError }
> {
  const manifest = await prisma.transportManifest.findUnique({
    where: { id },
    include: { run: { include: { route: true } } },
  });
  if (!manifest) {
    return { error: new ApiError('NOT_FOUND', 'Manifest not found', 404) };
  }
  const originHubId = manifest.run.route.originHubId;
  if (!isAssignedToHub(req, originHubId)) {
    await recordAuditLog(req.userId!, 'FULFILMENT_HUB_ASSIGNMENT_DENIED', { targetHubId: originHubId, manifestId: manifest.id });
    return { error: new ApiError('FORBIDDEN', 'You are not assigned to this hub', 403) };
  }
  return {
    manifest: {
      id: manifest.id,
      runId: manifest.runId,
      status: manifest.status,
      finalizedAt: manifest.finalizedAt,
      finalizedById: manifest.finalizedById,
      createdAt: manifest.createdAt,
    },
    originHubId,
  };
}

function manifestResponse(manifest: {
  id: string;
  runId: string;
  status: string;
  finalizedAt: Date | null;
  finalizedById: string | null;
  createdAt: Date;
}) {
  return {
    id: manifest.id,
    runId: manifest.runId,
    status: manifest.status,
    finalizedAt: manifest.finalizedAt,
    finalizedById: manifest.finalizedById,
    createdAt: manifest.createdAt,
  };
}

const createManifestSchema = z.object({ runId: z.string().uuid() });

router.post(
  '/',
  requireAuth,
  requireFulfilmentRole('HUB_SUPERVISOR'),
  async (req: FulfilmentRequest, res: Response, next: NextFunction) => {
    const parsed = createManifestSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const run = await prisma.transportRun.findUnique({ where: { id: parsed.data.runId }, include: { route: true } });
    if (!run) {
      next(new ApiError('NOT_FOUND', 'Transport run not found', 404));
      return;
    }
    if (!isAssignedToHub(req, run.route.originHubId)) {
      await recordAuditLog(req.userId!, 'FULFILMENT_HUB_ASSIGNMENT_DENIED', { targetHubId: run.route.originHubId, runId: run.id });
      next(new ApiError('FORBIDDEN', 'You are not assigned to this hub', 403));
      return;
    }

    // Checks for a manifest in ANY status, not just OPEN -- a run should
    // only ever have one manifest. Without this, picking an already-
    // finalized run's manifest again (e.g. to scan parcels out) would
    // silently create a second, empty manifest instead of returning the
    // existing one, since the old OPEN-only check no longer matched it.
    const existing = await prisma.transportManifest.findFirst({ where: { runId: run.id } });
    if (existing) {
      next(new ApiError('ALREADY_EXISTS', 'This run already has a manifest', 409, { manifestId: existing.id }));
      return;
    }

    const manifest = await prisma.transportManifest.create({ data: { runId: run.id } });
    await recordAuditLog(req.userId!, 'FULFILMENT_MANIFEST_CREATED', { manifestId: manifest.id, runId: run.id });

    res.status(201).json({ data: manifestResponse(manifest) });
  },
);

// Read access also open to Hub Agents (SCRUM-141) -- they need to see a
// finalized manifest's parcel list and scan progress to do the dispatch
// scan-out, not just supervisors who created/finalized it.
router.get(
  '/:id',
  requireAuth,
  requireFulfilmentRole('HUB_AGENT', 'HUB_SUPERVISOR'),
  async (req: FulfilmentRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const result = await loadAssignedManifest(req, req.params.id);
    if ('error' in result) {
      next(result.error);
      return;
    }

    const parcels = await prisma.manifestParcel.findMany({
      where: { manifestId: result.manifest.id },
      include: { shipment: { select: { reference: true, destinationHubId: true, sizeTier: true, status: true } } },
      orderBy: { createdAt: 'asc' },
    });

    res.status(200).json({
      data: {
        ...manifestResponse(result.manifest),
        parcels: parcels.map(p => ({
          shipmentId: p.shipmentId,
          reference: p.shipment.reference,
          destinationHubId: p.shipment.destinationHubId,
          sizeTier: p.shipment.sizeTier,
          status: p.shipment.status,
          scannedOutAt: p.scannedOutAt,
          scannedInAt: p.scannedInAt,
          shortShipped: p.shortShipped,
        })),
      },
    });
  },
);

const addParcelSchema = z.object({ shipmentId: z.string().uuid() });

// Cascades SEALED -> AWAITING_DISPATCH -> ASSIGNED_TO_RUN atomically --
// both hops happen in the same real-world moment (the supervisor putting
// the parcel on this manifest), but each is still its own canTransition-
// checked, atomically-guarded step with its own TrackingEvent, exactly as
// the state machine spec models them, rather than special-casing a direct
// SEALED -> ASSIGNED_TO_RUN edge that doesn't exist in the documented table.
router.post(
  '/:id/parcels',
  requireAuth,
  requireFulfilmentRole('HUB_SUPERVISOR'),
  async (req: FulfilmentRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = addParcelSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
      return;
    }

    const result = await loadAssignedManifest(req, req.params.id);
    if ('error' in result) {
      next(result.error);
      return;
    }
    const { manifest, originHubId } = result;

    if (manifest.status !== 'OPEN') {
      next(new ApiError('INVALID_STATE', 'This manifest is finalized and can no longer be edited', 409));
      return;
    }

    const run = await prisma.transportRun.findUnique({ where: { id: manifest.runId }, include: { route: true } });
    const shipment = await prisma.shipment.findUnique({ where: { id: parsed.data.shipmentId } });
    if (!shipment) {
      next(new ApiError('NOT_FOUND', 'Shipment not found', 404));
      return;
    }
    if (shipment.originHubId !== originHubId || shipment.destinationHubId !== run!.route.destinationHubId) {
      next(new ApiError('VALIDATION_ERROR', "This shipment's route does not match this run's route", 400));
      return;
    }
    if (!canTransition(shipment.status, 'AWAITING_DISPATCH')) {
      next(new ApiError('INVALID_STATE', 'Only sealed parcels can be assigned to a manifest', 409));
      return;
    }
    const existingAssignment = await prisma.manifestParcel.findUnique({ where: { shipmentId: shipment.id } });
    if (existingAssignment) {
      next(new ApiError('ALREADY_ASSIGNED', 'This shipment is already assigned to a manifest', 409));
      return;
    }

    try {
      await prisma.$transaction(async tx => {
        const firstHop = await tx.shipment.updateMany({
          where: { id: shipment.id, status: shipment.status },
          data: { status: 'AWAITING_DISPATCH' },
        });
        if (firstHop.count === 0) throw new ManifestTransitionConflict();
        await tx.trackingEvent.create({
          data: {
            shipmentId: shipment.id,
            fromStatus: shipment.status,
            toStatus: 'AWAITING_DISPATCH',
            actorUserId: req.userId!,
            hubId: originHubId,
          },
        });

        const secondHop = await tx.shipment.updateMany({
          where: { id: shipment.id, status: 'AWAITING_DISPATCH' },
          data: { status: 'ASSIGNED_TO_RUN' },
        });
        if (secondHop.count === 0) throw new ManifestTransitionConflict();
        await tx.trackingEvent.create({
          data: {
            shipmentId: shipment.id,
            fromStatus: 'AWAITING_DISPATCH',
            toStatus: 'ASSIGNED_TO_RUN',
            actorUserId: req.userId!,
            hubId: originHubId,
          },
        });

        await tx.manifestParcel.create({ data: { manifestId: manifest.id, shipmentId: shipment.id } });
      });
    } catch (err) {
      if (err instanceof ManifestTransitionConflict) {
        next(new ApiError('INVALID_STATE', 'Only sealed parcels can be assigned to a manifest', 409));
        return;
      }
      throw err;
    }

    await recordAuditLog(req.userId!, 'FULFILMENT_MANIFEST_PARCEL_ADDED', { manifestId: manifest.id, shipmentId: shipment.id });

    res.status(201).json({ data: { manifestId: manifest.id, shipmentId: shipment.id, status: 'ASSIGNED_TO_RUN' } });
  },
);

// Reverses the cascade above -- pulling a parcel off a manifest before
// dispatch is a normal operational correction (matches the state
// machine's ASSIGNED_TO_RUN -> AWAITING_DISPATCH transition), not an
// error condition.
router.delete(
  '/:id/parcels/:shipmentId',
  requireAuth,
  requireFulfilmentRole('HUB_SUPERVISOR'),
  async (req: FulfilmentRequest & Request<{ id: string; shipmentId: string }>, res: Response, next: NextFunction) => {
    const result = await loadAssignedManifest(req, req.params.id);
    if ('error' in result) {
      next(result.error);
      return;
    }
    const { manifest, originHubId } = result;

    if (manifest.status !== 'OPEN') {
      next(new ApiError('INVALID_STATE', 'This manifest is finalized and can no longer be edited', 409));
      return;
    }

    const manifestParcel = await prisma.manifestParcel.findFirst({
      where: { manifestId: manifest.id, shipmentId: req.params.shipmentId },
    });
    if (!manifestParcel) {
      next(new ApiError('NOT_FOUND', 'This shipment is not on this manifest', 404));
      return;
    }

    try {
      await prisma.$transaction(async tx => {
        const updateResult = await tx.shipment.updateMany({
          where: { id: req.params.shipmentId, status: 'ASSIGNED_TO_RUN' },
          data: { status: 'AWAITING_DISPATCH' },
        });
        if (updateResult.count === 0) throw new ManifestTransitionConflict();

        await tx.trackingEvent.create({
          data: {
            shipmentId: req.params.shipmentId,
            fromStatus: 'ASSIGNED_TO_RUN',
            toStatus: 'AWAITING_DISPATCH',
            actorUserId: req.userId!,
            hubId: originHubId,
          },
        });

        await tx.manifestParcel.delete({ where: { id: manifestParcel.id } });
      });
    } catch (err) {
      if (err instanceof ManifestTransitionConflict) {
        next(new ApiError('INVALID_STATE', 'This shipment is no longer assigned to a run', 409));
        return;
      }
      throw err;
    }

    await recordAuditLog(req.userId!, 'FULFILMENT_MANIFEST_PARCEL_REMOVED', {
      manifestId: manifest.id,
      shipmentId: req.params.shipmentId,
    });

    res.status(204).send();
  },
);

router.post(
  '/:id/finalize',
  requireAuth,
  requireFulfilmentRole('HUB_SUPERVISOR'),
  async (req: FulfilmentRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const result = await loadAssignedManifest(req, req.params.id);
    if ('error' in result) {
      next(result.error);
      return;
    }
    const { manifest } = result;

    if (manifest.status !== 'OPEN') {
      next(new ApiError('INVALID_STATE', 'This manifest is already finalized', 409));
      return;
    }

    const updated = await prisma.transportManifest.update({
      where: { id: manifest.id },
      data: { status: 'FINALIZED', finalizedAt: new Date(), finalizedById: req.userId! },
    });
    await recordAuditLog(req.userId!, 'FULFILMENT_MANIFEST_FINALIZED', { manifestId: manifest.id });

    res.status(200).json({ data: manifestResponse(updated) });
  },
);

// A simple, plain-text manifest document -- deliberately not the full
// buyer/seller record (name/contact), just what a transport
// provider/driver actually needs to match parcels physically: reference,
// destination, size. Available at any manifest status so a supervisor can
// preview it before finalizing, not only after.
router.get(
  '/:id/document',
  requireAuth,
  requireFulfilmentRole('HUB_SUPERVISOR'),
  async (req: FulfilmentRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const result = await loadAssignedManifest(req, req.params.id);
    if ('error' in result) {
      next(result.error);
      return;
    }
    const { manifest } = result;

    const run = await prisma.transportRun.findUnique({ where: { id: manifest.runId }, include: { route: { include: { originHub: true, destinationHub: true } } } });
    const parcels = await prisma.manifestParcel.findMany({
      where: { manifestId: manifest.id },
      include: { shipment: { select: { reference: true, sizeTier: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const lines = [
      `Faira Fulfilment -- Transport Manifest`,
      `Manifest: ${manifest.id}`,
      `Status: ${manifest.status}${manifest.finalizedAt ? ` (finalized ${manifest.finalizedAt.toISOString()})` : ''}`,
      `Route: ${run?.route.originHub.name ?? 'Unknown'} -> ${run?.route.destinationHub.name ?? 'Unknown'}`,
      `Scheduled departure: ${run?.scheduledDeparture.toISOString() ?? 'Unknown'}`,
      `Vehicle: ${run?.vehicleReference ?? 'Not recorded'}`,
      '',
      `Parcels (${parcels.length}):`,
      ...parcels.map(p => `  - ${p.shipment.reference ?? '(no reference)'} — ${p.shipment.sizeTier}`),
    ];

    await recordAuditLog(req.userId!, 'FULFILMENT_MANIFEST_DOCUMENT_GENERATED', { manifestId: manifest.id });

    res.status(200).type('text/plain').send(lines.join('\n'));
  },
);

const DISPATCH_SCAN_ROLES = ['HUB_AGENT', 'HUB_SUPERVISOR'] as const;

// Once every ManifestParcel on this manifest is either scanned out or
// explicitly short-shipped, the run has fully departed. TransportRunStatus
// has no separate "IN_TRANSIT" value (only SCHEDULED/DEPARTED/ARRIVED/
// DELAYED/CANCELLED) -- the ticket's "run transitions to IN_TRANSIT" maps
// to DEPARTED here, the actual enum value for "the truck has left."
// Individual shipments still track their own IN_TRANSIT status separately
// once DISPATCHED (a later step, not this ticket).
async function maybeMarkRunDeparted(manifestId: string, runId: string): Promise<boolean> {
  const unaccountedFor = await prisma.manifestParcel.count({
    where: { manifestId, scannedOutAt: null, shortShipped: false },
  });
  if (unaccountedFor > 0) return false;

  const result = await prisma.transportRun.updateMany({
    where: { id: runId, status: 'SCHEDULED' },
    data: { status: 'DEPARTED', actualDeparture: new Date() },
  });
  if (result.count === 0) return false;

  // The run departing is the real-world moment every dispatched parcel on
  // it becomes "between hubs" -- system-triggered (actorUserId: null, per
  // the state machine doc's "System (automatic)" framing), not attributed
  // to whichever agent happened to scan the last parcel out.
  const dispatchedParcels = await prisma.manifestParcel.findMany({
    where: { manifestId, scannedOutAt: { not: null } },
    select: { shipmentId: true },
  });
  for (const { shipmentId } of dispatchedParcels) {
    const updateResult = await prisma.shipment.updateMany({
      where: { id: shipmentId, status: 'DISPATCHED' },
      data: { status: 'IN_TRANSIT' },
    });
    if (updateResult.count > 0) {
      await prisma.trackingEvent.create({
        data: { shipmentId, fromStatus: 'DISPATCHED', toStatus: 'IN_TRANSIT', actorUserId: null, hubId: null },
      });
    }
  }

  return true;
}

const scanOutSchema = z.object({ reference: z.string().trim().min(1) });

// Reuses the finalized manifest's locked parcel list as the sole
// validation source for "is this parcel allowed on this run" -- a
// shipment that's SEALED/ASSIGNED_TO_RUN but never made it onto this
// specific manifest's parcel list is rejected, per the ticket's first
// acceptance criterion.
router.post(
  '/:id/scan-out',
  requireAuth,
  requireFulfilmentRole(...DISPATCH_SCAN_ROLES),
  async (req: FulfilmentRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = scanOutSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'A shipment reference is required', 400, z.flattenError(parsed.error)));
      return;
    }

    const result = await loadAssignedManifest(req, req.params.id);
    if ('error' in result) {
      next(result.error);
      return;
    }
    const { manifest, originHubId } = result;

    if (manifest.status !== 'FINALIZED') {
      next(new ApiError('INVALID_STATE', 'This manifest must be finalized before scanning parcels out', 409));
      return;
    }

    const shipment = await prisma.shipment.findUnique({ where: { reference: parsed.data.reference } });
    if (!shipment) {
      next(new ApiError('NOT_FOUND', 'No shipment found for that reference', 404));
      return;
    }

    const manifestParcel = await prisma.manifestParcel.findFirst({ where: { manifestId: manifest.id, shipmentId: shipment.id } });
    if (!manifestParcel) {
      next(new ApiError('NOT_ON_MANIFEST', 'This parcel is not on this manifest and cannot be scanned out on this run', 404));
      return;
    }
    if (manifestParcel.shortShipped) {
      next(new ApiError('INVALID_STATE', 'This parcel was marked short-shipped and cannot be scanned out', 409));
      return;
    }
    if (manifestParcel.scannedOutAt) {
      next(new ApiError('ALREADY_SCANNED', 'This parcel has already been scanned out', 409));
      return;
    }
    if (!canTransition(shipment.status, 'DISPATCHED')) {
      next(new ApiError('INVALID_STATE', 'This parcel is not ready to be scanned out', 409));
      return;
    }

    try {
      await prisma.$transaction(async tx => {
        const updateResult = await tx.shipment.updateMany({
          where: { id: shipment.id, status: shipment.status },
          data: { status: 'DISPATCHED' },
        });
        if (updateResult.count === 0) throw new ManifestTransitionConflict();

        await tx.trackingEvent.create({
          data: {
            shipmentId: shipment.id,
            fromStatus: shipment.status,
            toStatus: 'DISPATCHED',
            actorUserId: req.userId!,
            hubId: originHubId,
          },
        });

        await tx.manifestParcel.update({ where: { id: manifestParcel.id }, data: { scannedOutAt: new Date() } });
      });
    } catch (err) {
      if (err instanceof ManifestTransitionConflict) {
        next(new ApiError('ALREADY_SCANNED', 'This parcel has already been scanned out', 409));
        return;
      }
      throw err;
    }

    await recordAuditLog(req.userId!, 'FULFILMENT_PARCEL_SCANNED_OUT', { manifestId: manifest.id, shipmentId: shipment.id });

    const runDeparted = await maybeMarkRunDeparted(manifest.id, manifest.runId);

    res.status(200).json({ data: { shipmentId: shipment.id, reference: shipment.reference, status: 'DISPATCHED', runDeparted } });
  },
);

const shortShipSchema = z.object({
  reference: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(500),
});

// Records a discrepancy rather than blocking the whole run -- one missing
// parcel shouldn't hold every other already-scanned parcel hostage. The
// shipment's own status is deliberately left unchanged (it's still
// physically sitting at the origin hub; reconciling what actually
// happened to it is a support/ops follow-up, not part of this scan flow).
router.post(
  '/:id/short-ship',
  requireAuth,
  requireFulfilmentRole(...DISPATCH_SCAN_ROLES),
  async (req: FulfilmentRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = shortShipSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'A reference and reason are required', 400, z.flattenError(parsed.error)));
      return;
    }

    const result = await loadAssignedManifest(req, req.params.id);
    if ('error' in result) {
      next(result.error);
      return;
    }
    const { manifest } = result;

    if (manifest.status !== 'FINALIZED') {
      next(new ApiError('INVALID_STATE', 'This manifest must be finalized before recording a short-shipment', 409));
      return;
    }

    const shipment = await prisma.shipment.findUnique({ where: { reference: parsed.data.reference } });
    if (!shipment) {
      next(new ApiError('NOT_FOUND', 'No shipment found for that reference', 404));
      return;
    }

    const manifestParcel = await prisma.manifestParcel.findFirst({ where: { manifestId: manifest.id, shipmentId: shipment.id } });
    if (!manifestParcel) {
      next(new ApiError('NOT_ON_MANIFEST', 'This parcel is not on this manifest', 404));
      return;
    }
    if (manifestParcel.scannedOutAt) {
      next(new ApiError('INVALID_STATE', 'This parcel has already been scanned out and cannot be marked short-shipped', 409));
      return;
    }
    if (manifestParcel.shortShipped) {
      next(new ApiError('ALREADY_SHORT_SHIPPED', 'This parcel is already marked short-shipped', 409));
      return;
    }

    await prisma.manifestParcel.update({ where: { id: manifestParcel.id }, data: { shortShipped: true } });
    await recordAuditLog(req.userId!, 'FULFILMENT_PARCEL_SHORT_SHIPPED', {
      manifestId: manifest.id,
      shipmentId: shipment.id,
      reason: parsed.data.reason,
    });

    const runDeparted = await maybeMarkRunDeparted(manifest.id, manifest.runId);

    res.status(200).json({ data: { shipmentId: shipment.id, reference: shipment.reference, shortShipped: true, runDeparted } });
  },
);

const scanInSchema = z.object({ reference: z.string().trim().min(1) });

// Deliberately not keyed by manifest id in the URL -- a destination-hub
// agent scanning an arriving parcel only has its reference, not the
// manifest it happens to be on. ManifestParcel.shipmentId is unique, so
// the manifest (and therefore the destination hub to check) is derived
// entirely from the shipment. Reuses the finalized manifest's locked
// parcel list as the sole validation source, same as scan-out -- a
// parcel not expected on this run is rejected. Cascades IN_TRANSIT ->
// RECEIVED_AT_DESTINATION -> READY_FOR_COLLECTION in one scan (both hops
// individually canTransition-checked and race-guarded, own TrackingEvents
// each), generating a collection code and notifying the buyer as part of
// the same action -- these all happen at the instant of the arrival scan,
// there's no separate manual "generate code" step.
router.post(
  '/scan-in',
  requireAuth,
  requireFulfilmentRole(...DISPATCH_SCAN_ROLES),
  async (req: FulfilmentRequest, res: Response, next: NextFunction) => {
    const parsed = scanInSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError('VALIDATION_ERROR', 'A shipment reference is required', 400, z.flattenError(parsed.error)));
      return;
    }

    const shipment = await prisma.shipment.findUnique({ where: { reference: parsed.data.reference } });
    if (!shipment) {
      next(new ApiError('NOT_FOUND', 'No shipment found for that reference', 404));
      return;
    }

    const manifestParcel = await prisma.manifestParcel.findUnique({
      where: { shipmentId: shipment.id },
      include: { manifest: { include: { run: { include: { route: true } } } } },
    });
    if (!manifestParcel) {
      next(new ApiError('NOT_ON_MANIFEST', 'This parcel was never assigned to a manifest', 404));
      return;
    }

    const manifest = manifestParcel.manifest;
    const destinationHubId = manifest.run.route.destinationHubId;
    if (!isAssignedToHub(req, destinationHubId)) {
      await recordAuditLog(req.userId!, 'FULFILMENT_HUB_ASSIGNMENT_DENIED', { targetHubId: destinationHubId, manifestId: manifest.id });
      next(new ApiError('FORBIDDEN', 'You are not assigned to this hub', 403));
      return;
    }
    if (manifest.status !== 'FINALIZED') {
      next(new ApiError('INVALID_STATE', 'This manifest must be finalized before scanning parcels in', 409));
      return;
    }
    if (manifestParcel.shortShipped || !manifestParcel.scannedOutAt) {
      next(new ApiError('INVALID_STATE', 'This parcel was never dispatched on this run', 409));
      return;
    }
    if (manifestParcel.scannedInAt) {
      next(new ApiError('ALREADY_SCANNED', 'This parcel has already been scanned in', 409));
      return;
    }
    if (!canTransition(shipment.status, 'RECEIVED_AT_DESTINATION')) {
      next(new ApiError('INVALID_STATE', 'This parcel is not ready to be scanned in', 409));
      return;
    }

    let plaintextCode = '';

    try {
      await prisma.$transaction(async tx => {
        const firstHop = await tx.shipment.updateMany({
          where: { id: shipment.id, status: shipment.status },
          data: { status: 'RECEIVED_AT_DESTINATION' },
        });
        if (firstHop.count === 0) throw new ManifestTransitionConflict();
        await tx.trackingEvent.create({
          data: {
            shipmentId: shipment.id,
            fromStatus: shipment.status,
            toStatus: 'RECEIVED_AT_DESTINATION',
            actorUserId: req.userId!,
            hubId: destinationHubId,
          },
        });

        const secondHop = await tx.shipment.updateMany({
          where: { id: shipment.id, status: 'RECEIVED_AT_DESTINATION' },
          data: { status: 'READY_FOR_COLLECTION' },
        });
        if (secondHop.count === 0) throw new ManifestTransitionConflict();
        await tx.trackingEvent.create({
          data: {
            shipmentId: shipment.id,
            fromStatus: 'RECEIVED_AT_DESTINATION',
            toStatus: 'READY_FOR_COLLECTION',
            actorUserId: req.userId!,
            hubId: destinationHubId,
          },
        });

        await tx.manifestParcel.update({ where: { id: manifestParcel.id }, data: { scannedInAt: new Date() } });

        plaintextCode = await generateCollectionCode(tx, shipment.id);
      });
    } catch (err) {
      if (err instanceof ManifestTransitionConflict) {
        next(new ApiError('ALREADY_SCANNED', 'This parcel has already been scanned in', 409));
        return;
      }
      throw err;
    }

    await recordAuditLog(req.userId!, 'FULFILMENT_PARCEL_SCANNED_IN', { manifestId: manifest.id, shipmentId: shipment.id });

    await notifyBuyerReadyForCollection(shipment.id, plaintextCode);

    res.status(200).json({
      data: { shipmentId: shipment.id, reference: shipment.reference, status: 'READY_FOR_COLLECTION' },
    });
  },
);

const RECONCILIATION_ROLES = ['OPERATIONS_ADMIN', 'SUPER_ADMIN', 'HUB_SUPERVISOR'] as const;
const DEFAULT_RECONCILIATION_THRESHOLD_HOURS = 24;

// Expected (everything actually dispatched on this manifest) vs. actual
// (what's been scanned in) -- missing parcels are surfaced explicitly,
// never silently dropped, per the ticket's acceptance criterion. A
// dispatched-but-not-yet-arrived parcel isn't "missing" until it's been
// overdue past scheduledArrival by the configured threshold; before that
// it's just still in transit.
router.get(
  '/:id/reconciliation',
  requireAuth,
  requireFulfilmentRole(...RECONCILIATION_ROLES),
  async (req: FulfilmentRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
    const manifest = await prisma.transportManifest.findUnique({
      where: { id: req.params.id },
      include: { run: { include: { route: true } } },
    });
    if (!manifest) {
      next(new ApiError('NOT_FOUND', 'Manifest not found', 404));
      return;
    }

    const isAdmin = (req.fulfilmentRoles ?? []).some(r => r.role === 'OPERATIONS_ADMIN' || r.role === 'SUPER_ADMIN');
    if (!isAdmin && !isAssignedToHub(req, manifest.run.route.destinationHubId)) {
      await recordAuditLog(req.userId!, 'FULFILMENT_HUB_ASSIGNMENT_DENIED', {
        targetHubId: manifest.run.route.destinationHubId,
        manifestId: manifest.id,
      });
      next(new ApiError('FORBIDDEN', 'You are not assigned to this hub', 403));
      return;
    }

    const config = await prisma.systemConfiguration.findUnique({
      where: { key: SYSTEM_CONFIG_KEYS.MANIFEST_RECONCILIATION_THRESHOLD_HOURS },
    });
    const thresholdHours = config ? Number(config.value) : DEFAULT_RECONCILIATION_THRESHOLD_HOURS;
    const overdueAt = new Date(manifest.run.scheduledArrival.getTime() + thresholdHours * 60 * 60 * 1000);
    const isOverdue = new Date() > overdueAt;

    const parcels = await prisma.manifestParcel.findMany({
      where: { manifestId: manifest.id },
      include: { shipment: { select: { reference: true, sizeTier: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const dispatched = parcels.filter(p => p.scannedOutAt && !p.shortShipped);
    const arrived = dispatched.filter(p => p.scannedInAt);
    const missing = dispatched.filter(p => !p.scannedInAt && isOverdue);
    const inTransit = dispatched.filter(p => !p.scannedInAt && !isOverdue);
    const shortShipped = parcels.filter(p => p.shortShipped);

    const toSummary = (p: (typeof parcels)[number]) => ({
      shipmentId: p.shipmentId,
      reference: p.shipment.reference,
      sizeTier: p.shipment.sizeTier,
      scannedOutAt: p.scannedOutAt,
      scannedInAt: p.scannedInAt,
    });

    res.status(200).json({
      data: {
        manifestId: manifest.id,
        runId: manifest.runId,
        expectedCount: dispatched.length,
        arrivedCount: arrived.length,
        missingCount: missing.length,
        arrived: arrived.map(toSummary),
        inTransit: inTransit.map(toSummary),
        missing: missing.map(toSummary),
        shortShipped: shortShipped.map(toSummary),
      },
    });
  },
);

export default router;
