-- AlterTable
ALTER TABLE "users" ADD COLUMN     "expo_push_token" TEXT;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "muted_by_buyer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "muted_by_seller" BOOLEAN NOT NULL DEFAULT false;

