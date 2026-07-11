import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { ApiError } from '../errors/ApiError';
import { createVerificationUploadUrl, getVerificationViewUrl, VerificationDocType } from '../lib/supabaseStorage';
import { recordAuditLog } from '../services/fulfilmentAuditLog';

const router = Router();

// Every field optional — a DRAFT can be partially filled as the wizard's
// steps are completed one at a time (save-and-resume). Completeness is
// only enforced at /submit.
const onboardingDraftSchema = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  mobileNumber: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, 'Phone must be in E.164 format, e.g. +263771234567').optional(),
  sellerType: z.enum(['INDIVIDUAL', 'REGISTERED_BUSINESS']).optional(),
  businessName: z.string().trim().max(200).optional(),
  productCategories: z.array(z.string().trim().min(1)).max(20).optional(),
  hasPhysicalShop: z.boolean().optional(),
  shopAddress: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  preferredHubId: z.string().uuid().optional(),
  nationalIdNumber: z.string().trim().max(50).optional(),
  agreeToTerms: z.boolean().optional(),
});

function draftResponse(profile: {
  id: string;
  fullName: string | null;
  mobileNumber: string | null;
  sellerType: string | null;
  businessName: string | null;
  productCategories: string[];
  hasPhysicalShop: boolean | null;
  shopAddress: string | null;
  city: string | null;
  preferredHubId: string | null;
  nationalIdNumber: string | null;
  agreedToTermsAt: Date | null;
  status: string;
  submittedAt: Date | null;
}) {
  return {
    id: profile.id,
    fullName: profile.fullName,
    mobileNumber: profile.mobileNumber,
    sellerType: profile.sellerType,
    businessName: profile.businessName,
    productCategories: profile.productCategories,
    hasPhysicalShop: profile.hasPhysicalShop,
    shopAddress: profile.shopAddress,
    city: profile.city,
    preferredHubId: profile.preferredHubId,
    nationalIdNumber: profile.nationalIdNumber,
    agreedToTerms: !!profile.agreedToTermsAt,
    status: profile.status,
    submittedAt: profile.submittedAt,
  };
}

router.get('/me/onboarding', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const profile = await prisma.fulfilmentSellerProfile.upsert({
    where: { userId: req.userId! },
    update: {},
    create: { userId: req.userId! },
  });

  res.status(200).json({ data: draftResponse(profile) });
});

router.patch('/me/onboarding', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = onboardingDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
    return;
  }

  const existing = await prisma.fulfilmentSellerProfile.findUnique({ where: { userId: req.userId! } });
  if (existing?.status === 'SUBMITTED') {
    next(new ApiError('INVALID_STATE', 'Registration has already been submitted', 409));
    return;
  }

  if (parsed.data.preferredHubId) {
    const hub = await prisma.hub.findUnique({ where: { id: parsed.data.preferredHubId } });
    if (!hub) {
      next(new ApiError('NOT_FOUND', 'Hub not found', 404));
      return;
    }
  }

  const { agreeToTerms, ...rest } = parsed.data;
  const data = {
    ...rest,
    ...(agreeToTerms !== undefined ? { agreedToTermsAt: agreeToTerms ? new Date() : null } : {}),
  };

  const profile = await prisma.fulfilmentSellerProfile.upsert({
    where: { userId: req.userId! },
    update: data,
    create: { userId: req.userId!, ...data },
  });

  res.status(200).json({ data: draftResponse(profile) });
});

const REQUIRED_ONBOARDING_FIELDS = ['fullName', 'mobileNumber', 'sellerType', 'city', 'preferredHubId'] as const;

router.post('/me/onboarding/submit', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const profile = await prisma.fulfilmentSellerProfile.findUnique({ where: { userId: req.userId! } });
  if (!profile) {
    next(new ApiError('NOT_FOUND', 'No registration draft found', 404));
    return;
  }
  if (profile.status === 'SUBMITTED') {
    next(new ApiError('INVALID_STATE', 'Registration has already been submitted', 409));
    return;
  }

  const missing = REQUIRED_ONBOARDING_FIELDS.filter(field => !profile[field]);
  if (!profile.agreedToTermsAt) missing.push('agreeToTerms' as (typeof REQUIRED_ONBOARDING_FIELDS)[number]);

  if (missing.length > 0) {
    next(new ApiError('VALIDATION_ERROR', 'Registration is missing required fields', 400, { missing }));
    return;
  }

  const updated = await prisma.$transaction(async tx => {
    const result = await tx.fulfilmentSellerProfile.update({
      where: { userId: req.userId! },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });

    // Prisma's compound-unique input for userId_role_hubId doesn't accept
    // an explicit null for the nullable hubId column, so this can't be a
    // single upsert — find-then-create instead.
    const existingSellerRole = await tx.userRole.findFirst({
      where: { userId: req.userId!, role: 'SELLER', hubId: null },
    });
    if (!existingSellerRole) {
      await tx.userRole.create({ data: { userId: req.userId!, role: 'SELLER' } });
    }

    return result;
  });

  await recordAuditLog(req.userId!, 'FULFILMENT_SELLER_REGISTERED', { sellerProfileId: updated.id });

  res.status(200).json({ data: draftResponse(updated) });
});

const VERIFICATION_DOC_TYPES: VerificationDocType[] = ['ID', 'BUSINESS', 'SHOP_PHOTO'];
const uploadUrlSchema = z.object({ docType: z.enum(['ID', 'BUSINESS', 'SHOP_PHOTO']) });

router.post('/me/verification/upload-url', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = uploadUrlSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
    return;
  }
  if (!VERIFICATION_DOC_TYPES.includes(parsed.data.docType)) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid document type', 400));
    return;
  }

  const upload = await createVerificationUploadUrl(req.userId!, parsed.data.docType);
  res.status(200).json({ data: upload });
});

async function verificationResponse(sellerId: string) {
  const verification = await prisma.fulfilmentVerificationRequest.findFirst({
    where: { sellerId },
    orderBy: { createdAt: 'desc' },
  });

  if (!verification) {
    return { status: 'NOT_STARTED', idDocumentUrl: null, businessDocumentUrl: null, shopPhotoUrl: null, reviewNotes: null };
  }

  const [idDocumentUrl, businessDocumentUrl, shopPhotoUrl] = await Promise.all([
    verification.idDocumentUrl ? getVerificationViewUrl(verification.idDocumentUrl) : null,
    verification.businessDocumentUrl ? getVerificationViewUrl(verification.businessDocumentUrl) : null,
    verification.shopPhotoUrl ? getVerificationViewUrl(verification.shopPhotoUrl) : null,
  ]);

  return {
    id: verification.id,
    status: verification.status,
    idDocumentUrl,
    businessDocumentUrl,
    shopPhotoUrl,
    reviewNotes: verification.reviewNotes,
    submittedAt: verification.createdAt,
    reviewedAt: verification.reviewedAt,
  };
}

router.get('/me/verification', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  res.status(200).json({ data: await verificationResponse(req.userId!) });
});

const submitVerificationSchema = z.object({
  idDocumentPath: z.string().min(1),
  businessDocumentPath: z.string().min(1).optional(),
  shopPhotoPath: z.string().min(1).optional(),
});

router.post('/me/verification/submit', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = submitVerificationSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid request body', 400, z.flattenError(parsed.error)));
    return;
  }

  const existing = await prisma.fulfilmentVerificationRequest.findFirst({
    where: { sellerId: req.userId!, status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'] } },
  });
  if (existing) {
    next(new ApiError('INVALID_STATE', 'A verification request is already in progress or approved', 409));
    return;
  }

  const verification = await prisma.fulfilmentVerificationRequest.create({
    data: {
      sellerId: req.userId!,
      status: 'SUBMITTED',
      idDocumentUrl: parsed.data.idDocumentPath,
      businessDocumentUrl: parsed.data.businessDocumentPath ?? null,
      shopPhotoUrl: parsed.data.shopPhotoPath ?? null,
    },
  });

  await recordAuditLog(req.userId!, 'FULFILMENT_VERIFICATION_SUBMITTED', { verificationId: verification.id });

  res.status(201).json({ data: await verificationResponse(req.userId!) });
});

export default router;
