-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "push_notifications_enabled" BOOLEAN NOT NULL DEFAULT true;

