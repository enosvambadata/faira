-- AlterTable
ALTER TABLE "collect_uk_drivers" ADD COLUMN     "driving_licence_url" TEXT;

-- CreateTable
CREATE TABLE "collect_uk_driver_vehicles" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "make_model" TEXT NOT NULL,
    "registration_plate" TEXT NOT NULL,
    "capacity_parcels" INTEGER NOT NULL DEFAULT 20,
    "photo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collect_uk_driver_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collect_uk_driver_vehicles_driver_id_idx" ON "collect_uk_driver_vehicles"("driver_id");

-- AddForeignKey
ALTER TABLE "collect_uk_driver_vehicles" ADD CONSTRAINT "collect_uk_driver_vehicles_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "collect_uk_drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

