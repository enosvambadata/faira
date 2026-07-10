-- CreateEnum
CREATE TYPE "ShippingMethod" AS ENUM ('MEETUP', 'COURIER', 'POSTAL');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "shipped_at" TIMESTAMP(3),
ADD COLUMN     "shipping_method" "ShippingMethod",
ADD COLUMN     "tracking_reference" TEXT;

