-- CreateEnum
CREATE TYPE "CollectUkItemType" AS ENUM ('DRUM', 'SUITCASE', 'FRIDGE', 'STOVE', 'PALLET', 'VEHICLE', 'OTHER');

-- CreateEnum
CREATE TYPE "CollectUkVehicleType" AS ENUM ('SEDAN', 'SUV', 'TRUCK');

-- AlterTable
ALTER TABLE "collect_uk_collection_bookings" ADD COLUMN     "item_type_other" TEXT,
ADD COLUMN     "item_types" "CollectUkItemType"[] DEFAULT ARRAY[]::"CollectUkItemType"[],
ADD COLUMN     "vehicle_type" "CollectUkVehicleType";
