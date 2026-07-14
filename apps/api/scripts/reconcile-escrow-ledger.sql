-- Escrow reconciliation (SCRUM-212 / audit B1).
--
-- Surfaces orders whose money state implies escrow_ledger entries that are
-- missing -- the fingerprint of the pre-fix split-commit bug, where an order's
-- status was committed in one transaction and the ledger write in a separate
-- one never landed. Read-only. Expect ZERO rows on a healthy database; any row
-- is a candidate for manual correction.
--
-- Fingerprints:
--   * PAID/SHIPPED with no HOLD                     -> paymentConfirmation split-commit
--   * COMPLETED that HAS a HOLD but no RELEASE      -> escrowRelease split-commit
--     (requires a HOLD so genuine COD / non-escrow completions don't false-positive)
--   * REFUNDED with no REFUND                       -> dispute-resolution split-commit
WITH ledger AS (
  SELECT
    o.id,
    o.status::text AS status,
    o.price_at_purchase,
    COUNT(*) FILTER (WHERE e.type = 'HOLD')       AS hold_entries,
    COUNT(*) FILTER (WHERE e.type = 'RELEASE')    AS release_entries,
    COUNT(*) FILTER (WHERE e.type = 'COMMISSION') AS commission_entries,
    COUNT(*) FILTER (WHERE e.type = 'REFUND')     AS refund_entries
  FROM orders o
  LEFT JOIN escrow_ledger e ON e.order_id = o.id
  WHERE o.status IN ('PAID', 'SHIPPED', 'COMPLETED', 'REFUNDED')
  GROUP BY o.id, o.status, o.price_at_purchase
)
SELECT
  id,
  status,
  price_at_purchase,
  hold_entries,
  release_entries,
  commission_entries,
  refund_entries,
  CASE
    WHEN status IN ('PAID', 'SHIPPED') AND hold_entries = 0 THEN 'missing HOLD (payment confirm)'
    WHEN status = 'COMPLETED' AND hold_entries > 0 AND release_entries = 0 THEN 'held but never released (escrow release)'
    WHEN status = 'REFUNDED' AND refund_entries = 0 THEN 'missing REFUND (dispute resolve)'
  END AS suspected_corruption
FROM ledger
WHERE (status IN ('PAID', 'SHIPPED') AND hold_entries = 0)
   OR (status = 'COMPLETED' AND hold_entries > 0 AND release_entries = 0)
   OR (status = 'REFUNDED' AND refund_entries = 0);
