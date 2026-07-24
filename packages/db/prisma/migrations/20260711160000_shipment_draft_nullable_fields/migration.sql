-- AlterTable
ALTER TABLE "fulfilment_shipments" ALTER COLUMN "reference" DROP NOT NULL,
ALTER COLUMN "fee_payer" DROP NOT NULL,
ALTER COLUMN "delivery_fee" DROP NOT NULL;
