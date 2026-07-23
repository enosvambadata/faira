-- AlterTable
ALTER TABLE "fulfilment_hubs" ADD COLUMN "code" TEXT;
ALTER TABLE "fulfilment_hubs" ADD COLUMN "next_shipment_sequence" INTEGER NOT NULL DEFAULT 1;

-- Backfill codes for the pilot's two existing hubs before enforcing NOT NULL.
UPDATE "fulfilment_hubs" SET "code" = 'HRE' WHERE "name" = 'Faira Harare Hub';
UPDATE "fulfilment_hubs" SET "code" = 'BUL' WHERE "name" = 'Faira Bulawayo Hub';

-- AlterTable
ALTER TABLE "fulfilment_hubs" ALTER COLUMN "code" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "fulfilment_hubs_code_key" ON "fulfilment_hubs"("code");
