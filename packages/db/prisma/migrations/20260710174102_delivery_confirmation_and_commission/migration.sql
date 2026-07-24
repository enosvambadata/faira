-- AlterEnum
ALTER TYPE "EscrowEntryType" ADD VALUE 'COMMISSION';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivery_reminder_day3_sent_at" TIMESTAMP(3),
ADD COLUMN     "delivery_reminder_day4_sent_at" TIMESTAMP(3);

