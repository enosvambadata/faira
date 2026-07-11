-- CreateEnum
CREATE TYPE "SellerOnboardingStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "FulfilmentSellerType" AS ENUM ('INDIVIDUAL', 'REGISTERED_BUSINESS');

-- CreateEnum
CREATE TYPE "FulfilmentVerificationStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'MORE_INFO_REQUIRED', 'APPROVED', 'REJECTED', 'SUSPENDED', 'EXPIRED');

-- CreateTable
CREATE TABLE "fulfilment_seller_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" TEXT,
    "mobile_number" TEXT,
    "seller_type" "FulfilmentSellerType",
    "business_name" TEXT,
    "product_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "has_physical_shop" BOOLEAN,
    "shop_address" TEXT,
    "city" TEXT,
    "preferred_hub_id" UUID,
    "national_id_number" TEXT,
    "agreed_to_terms_at" TIMESTAMP(3),
    "status" "SellerOnboardingStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfilment_seller_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_verification_requests" (
    "id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "status" "FulfilmentVerificationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "id_document_url" TEXT,
    "business_document_url" TEXT,
    "shop_photo_url" TEXT,
    "review_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "fulfilment_verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fulfilment_seller_profiles_user_id_key" ON "fulfilment_seller_profiles"("user_id");

-- CreateIndex
CREATE INDEX "fulfilment_verification_requests_seller_id_idx" ON "fulfilment_verification_requests"("seller_id");

-- CreateIndex
CREATE INDEX "fulfilment_verification_requests_status_idx" ON "fulfilment_verification_requests"("status");

-- AddForeignKey
ALTER TABLE "fulfilment_seller_profiles" ADD CONSTRAINT "fulfilment_seller_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_seller_profiles" ADD CONSTRAINT "fulfilment_seller_profiles_preferred_hub_id_fkey" FOREIGN KEY ("preferred_hub_id") REFERENCES "fulfilment_hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_verification_requests" ADD CONSTRAINT "fulfilment_verification_requests_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

