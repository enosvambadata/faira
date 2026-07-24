-- Collect UK notification reliability (SCRUM-261): optional customer email as a
-- second delivery channel, plus a per-attempt delivery log so best-effort sends
-- stop failing silently.
ALTER TABLE "collect_uk_collection_bookings" ADD COLUMN "customer_email" TEXT;

CREATE TYPE "CollectUkNotificationChannel" AS ENUM ('SMS', 'EMAIL');
CREATE TYPE "CollectUkNotificationStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "collect_uk_notification_logs" (
  "id" UUID NOT NULL,
  "booking_id" UUID,
  "shipment_id" UUID,
  "event" TEXT NOT NULL,
  "channel" "CollectUkNotificationChannel" NOT NULL,
  "recipient" TEXT NOT NULL,
  "status" "CollectUkNotificationStatus" NOT NULL,
  "provider" TEXT,
  "detail" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collect_uk_notification_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "collect_uk_notification_logs_booking_id_created_at_idx" ON "collect_uk_notification_logs"("booking_id", "created_at");
CREATE INDEX "collect_uk_notification_logs_status_created_at_idx" ON "collect_uk_notification_logs"("status", "created_at");
