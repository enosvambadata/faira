-- AlterTable
ALTER TABLE "collect_uk_collection_bookings" ADD COLUMN     "collection_window_id" UUID,
ALTER COLUMN "preferred_date" DROP NOT NULL;

-- CreateTable
CREATE TABLE "collect_uk_collection_windows" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collect_uk_collection_windows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collect_uk_collection_windows_company_id_end_date_idx" ON "collect_uk_collection_windows"("company_id", "end_date");

-- AddForeignKey
ALTER TABLE "collect_uk_collection_windows" ADD CONSTRAINT "collect_uk_collection_windows_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "collect_uk_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect_uk_collection_bookings" ADD CONSTRAINT "collect_uk_collection_bookings_collection_window_id_fkey" FOREIGN KEY ("collection_window_id") REFERENCES "collect_uk_collection_windows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

