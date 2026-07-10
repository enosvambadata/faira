-- CreateEnum
CREATE TYPE "WeightTier" AS ENUM ('LIGHT', 'MEDIUM', 'HEAVY');

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "weight_tier" "WeightTier" NOT NULL DEFAULT 'LIGHT';

-- CreateTable
CREATE TABLE "delivery_fee_rates" (
    "id" UUID NOT NULL,
    "city" TEXT NOT NULL,
    "weight_tier" "WeightTier" NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_fee_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_fee_rates_city_weight_tier_key" ON "delivery_fee_rates"("city", "weight_tier");

