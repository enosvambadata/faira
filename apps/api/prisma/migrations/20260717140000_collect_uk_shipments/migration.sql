-- CreateEnum
CREATE TYPE "CollectUkShipmentStatus" AS ENUM ('PREPARING', 'IN_TRANSIT', 'ARRIVED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "collect_uk_shipments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "destination_country" TEXT,
    "status" "CollectUkShipmentStatus" NOT NULL DEFAULT 'PREPARING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collect_uk_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collect_uk_shipment_recipients" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "booking_id" UUID,
    "customer_name" TEXT NOT NULL,
    "customer_contact" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collect_uk_shipment_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collect_uk_shipment_milestones" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "location" TEXT,
    "note" TEXT,
    "pickup_address" TEXT,
    "pickup_from" DATE,
    "pickup_to" DATE,
    "notified_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collect_uk_shipment_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collect_uk_shipments_company_id_idx" ON "collect_uk_shipments"("company_id");

-- CreateIndex
CREATE INDEX "collect_uk_shipment_recipients_shipment_id_idx" ON "collect_uk_shipment_recipients"("shipment_id");

-- CreateIndex
CREATE INDEX "collect_uk_shipment_recipients_booking_id_idx" ON "collect_uk_shipment_recipients"("booking_id");

-- CreateIndex
CREATE INDEX "collect_uk_shipment_milestones_shipment_id_idx" ON "collect_uk_shipment_milestones"("shipment_id");

-- AddForeignKey
ALTER TABLE "collect_uk_shipments" ADD CONSTRAINT "collect_uk_shipments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "collect_uk_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect_uk_shipment_recipients" ADD CONSTRAINT "collect_uk_shipment_recipients_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "collect_uk_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect_uk_shipment_recipients" ADD CONSTRAINT "collect_uk_shipment_recipients_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "collect_uk_collection_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect_uk_shipment_milestones" ADD CONSTRAINT "collect_uk_shipment_milestones_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "collect_uk_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
