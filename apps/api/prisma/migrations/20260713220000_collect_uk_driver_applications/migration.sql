-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CollectUkDriverStatus" ADD VALUE 'APPLIED';
ALTER TYPE "CollectUkDriverStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "collect_uk_drivers" ADD COLUMN     "applied_at" TIMESTAMP(3),
ADD COLUMN     "base_postcode" TEXT,
ADD COLUMN     "county" TEXT,
ADD COLUMN     "full_name" TEXT,
ADD COLUMN     "git_insurance_url" TEXT,
ADD COLUMN     "liability_url" TEXT,
ADD COLUMN     "motor_insurance_url" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "review_notes" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "van_photo_url" TEXT,
ADD COLUMN     "vehicle_make_model" TEXT;

