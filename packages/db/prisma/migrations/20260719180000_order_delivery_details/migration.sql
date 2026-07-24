-- Anti-leakage Layer 2 (SCRUM-259): structured delivery details captured at
-- checkout, gated per (viewer, status, method) by shapeOrderForViewer. Nullable
-- because pre-existing orders never captured them.
ALTER TABLE "orders" ADD COLUMN "delivery_method" "ShippingMethod";
ALTER TABLE "orders" ADD COLUMN "delivery_recipient_name" TEXT;
ALTER TABLE "orders" ADD COLUMN "delivery_phone" TEXT;
ALTER TABLE "orders" ADD COLUMN "delivery_address_line" TEXT;
ALTER TABLE "orders" ADD COLUMN "delivery_suburb" TEXT;
ALTER TABLE "orders" ADD COLUMN "delivery_city" TEXT;
