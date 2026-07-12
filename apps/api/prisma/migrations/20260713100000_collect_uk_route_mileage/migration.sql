-- AlterTable
ALTER TABLE "collect_uk_collection_bookings" ADD COLUMN     "collection_latitude" DOUBLE PRECISION,
ADD COLUMN     "collection_longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "collect_uk_collection_routes" ADD COLUMN     "total_distance_miles" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "collect_uk_collection_stops" ADD COLUMN     "distance_from_previous_miles" DOUBLE PRECISION;
