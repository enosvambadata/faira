-- Escrow timer sweeps (SCRUM-258): the old single "delivery reminder" columns
-- (keyed off payment, day 3/4) are repurposed for the two-sweep model —
-- Sweep A (auto-release) reminds the BUYER before release; Sweep B (auto-refund)
-- reminds the SELLER before an unshipped order is cancelled and refunded.
ALTER TABLE "orders" RENAME COLUMN "delivery_reminder_day3_sent_at" TO "auto_release_reminder_at";
ALTER TABLE "orders" RENAME COLUMN "delivery_reminder_day4_sent_at" TO "auto_refund_reminder_at";
