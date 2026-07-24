-- Anti-leakage Layer 1 (SCRUM-257): messages store the redacted body users see
-- plus the original (admin-only, purged after the dispute window), and a flag
-- marking messages that attempted to share contact info.
ALTER TABLE "messages" ADD COLUMN "body_raw" TEXT;
ALTER TABLE "messages" ADD COLUMN "contained_contact_info" BOOLEAN NOT NULL DEFAULT false;
