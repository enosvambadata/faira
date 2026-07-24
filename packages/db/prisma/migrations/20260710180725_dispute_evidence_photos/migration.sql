-- AlterTable
ALTER TABLE "payment_disputes" ADD COLUMN     "evidence_image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[];

