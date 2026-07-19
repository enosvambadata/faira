-- Anti-leakage Layer 3 (SCRUM-260): marketplace-local collection code the buyer
-- shows the seller at an in-person handover, redeemed to confirm delivery
-- without exchanging a phone number. Not Fulfilment's Shipment-bound code.
ALTER TABLE "orders" ADD COLUMN "collection_code" TEXT;
ALTER TABLE "orders" ADD COLUMN "collection_code_attempts" INTEGER NOT NULL DEFAULT 0;
