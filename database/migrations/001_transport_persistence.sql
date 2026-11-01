-- Add persistence metadata without replacing the shared transport schema or data.
ALTER TABLE transport.transport_offers
  ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS aggregate_version integer NOT NULL DEFAULT 0;
UPDATE transport.transport_offers o SET aggregate_version = GREATEST(o.aggregate_version, e.version)
FROM (SELECT aggregate_id, max(aggregate_version) AS version FROM transport.outbox_events
      WHERE aggregate_type='TransportOffer' GROUP BY aggregate_id) e
WHERE o.id::text=e.aggregate_id;
ALTER TABLE transport.transport_offers ADD CONSTRAINT ck_offer_versions
  CHECK (row_version > 0 AND aggregate_version >= 0);
ALTER TABLE transport.assignments ADD COLUMN IF NOT EXISTS accepted_offer_id uuid
  REFERENCES transport.transport_offers(id);
-- A parent becomes COUNTERED; only the child needs parent/actor metadata.
ALTER TABLE transport.transport_offers DROP CONSTRAINT IF EXISTS ck_offer_counter;
ALTER TABLE transport.transport_offers ADD CONSTRAINT ck_offer_counter CHECK (
  (parent_offer_id IS NULL) = (proposed_by IS NULL)
  AND (round = 0 OR (parent_offer_id IS NOT NULL AND proposed_by IS NOT NULL))
);
