-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "archived_by_buyer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "archived_by_seller" BOOLEAN NOT NULL DEFAULT false;

