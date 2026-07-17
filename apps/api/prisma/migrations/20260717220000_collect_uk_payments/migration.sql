-- CreateEnum
CREATE TYPE "CollectUkPaymentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "collect_uk_payments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "shipment_id" UUID,
    "customer_name" TEXT NOT NULL,
    "customer_contact" TEXT,
    "description" TEXT NOT NULL,
    "amount_pence" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'gbp',
    "status" "CollectUkPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "stripe_session_id" TEXT,
    "stripe_payment_intent_id" TEXT,
    "checkout_url" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collect_uk_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collect_uk_payments_stripe_session_id_key" ON "collect_uk_payments"("stripe_session_id");

-- CreateIndex
CREATE INDEX "collect_uk_payments_company_id_idx" ON "collect_uk_payments"("company_id");

-- CreateIndex
CREATE INDEX "collect_uk_payments_status_idx" ON "collect_uk_payments"("status");

-- AddForeignKey
ALTER TABLE "collect_uk_payments" ADD CONSTRAINT "collect_uk_payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "collect_uk_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect_uk_payments" ADD CONSTRAINT "collect_uk_payments_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "collect_uk_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
