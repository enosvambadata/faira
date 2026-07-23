-- AlterTable
ALTER TABLE "collect_uk_collection_bookings" ADD COLUMN     "charge_pence" INTEGER;

-- CreateTable
CREATE TABLE "collect_uk_company_rates" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "base_per_stop_pence" INTEGER NOT NULL,
    "tier_small_pence" INTEGER NOT NULL,
    "tier_medium_pence" INTEGER NOT NULL,
    "tier_large_pence" INTEGER NOT NULL,
    "tier_xl_pence" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collect_uk_company_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collect_uk_company_rates_company_id_key" ON "collect_uk_company_rates"("company_id");

-- AddForeignKey
ALTER TABLE "collect_uk_company_rates" ADD CONSTRAINT "collect_uk_company_rates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "collect_uk_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

