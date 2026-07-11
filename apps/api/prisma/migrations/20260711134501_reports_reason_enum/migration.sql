-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('FAKE_ITEM', 'SCAM', 'INAPPROPRIATE', 'OTHER');

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "note" TEXT,
DROP COLUMN "reason",
ADD COLUMN     "reason" "ReportReason" NOT NULL;
