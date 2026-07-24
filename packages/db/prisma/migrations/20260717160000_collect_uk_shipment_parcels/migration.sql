-- AlterTable
ALTER TABLE "collect_uk_shipments" ADD COLUMN     "manifest_finalized_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "collect_uk_shipment_parcels" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "recipient_id" UUID,
    "sender_name" TEXT NOT NULL,
    "receiver_name" TEXT NOT NULL,
    "receiver_contact" TEXT,
    "receiver_address" TEXT,
    "receiver_city" TEXT,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "pieces" INTEGER NOT NULL DEFAULT 1,
    "weight_kg" DECIMAL(6,2),
    "declared_value_pence" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collect_uk_shipment_parcels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collect_uk_shipment_parcels_shipment_id_idx" ON "collect_uk_shipment_parcels"("shipment_id");

-- CreateIndex
CREATE INDEX "collect_uk_shipment_parcels_recipient_id_idx" ON "collect_uk_shipment_parcels"("recipient_id");

-- AddForeignKey
ALTER TABLE "collect_uk_shipment_parcels" ADD CONSTRAINT "collect_uk_shipment_parcels_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "collect_uk_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect_uk_shipment_parcels" ADD CONSTRAINT "collect_uk_shipment_parcels_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "collect_uk_shipment_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
