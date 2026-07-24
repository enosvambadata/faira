-- CreateTable
CREATE TABLE "collect_uk_freight_rates" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "price_pence" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collect_uk_freight_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collect_uk_freight_rates_company_id_idx" ON "collect_uk_freight_rates"("company_id");

-- AddForeignKey
ALTER TABLE "collect_uk_freight_rates" ADD CONSTRAINT "collect_uk_freight_rates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "collect_uk_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
