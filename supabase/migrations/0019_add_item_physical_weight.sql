-- KANTIRA Business OS — physical product weight for shipping
--
-- Adds a single, nullable, purely-additive column so Shiprocket-facing
-- shipment weight can be derived server-side from authoritative catalog
-- data instead of being fabricated or trusted from the client (see
-- app/checkout/actions.ts). This is a distinct concept from every existing
-- numeric attribute on items — cost_price/selling_price/tax_rate_percent
-- (money), reorder_level (a stock threshold), and the WEIGHTED_AVERAGE
-- inventory-costing method are all untouched and unrelated.
--
-- Nullable with no default: 0001-0018's existing items rows (and every row
-- created before a business weight is entered) stay exactly as valid as
-- they are today. Nothing reads this column yet except the checkout
-- shipping-quote path being wired up in this same phase, and that path
-- already treats a NULL weight as "cannot quote" rather than a fabricated
-- default (see lib/shipping/weight.ts).
--
-- The CHECK only enforces >= 0 (a database can't know a shippable product's
-- weight must be strictly positive — a non-shippable/service item, or one
-- not yet finalized, may reasonably be 0 or NULL). Rejecting zero/negative
-- weight for an item actually being shipped is a shipping-quote-layer
-- business rule, not a storage-layer one, so it belongs in
-- lib/shipping/weight.ts, not this CHECK.

ALTER TABLE public.items
  ADD COLUMN weight_kg numeric(10, 3);

ALTER TABLE public.items
  ADD CONSTRAINT items_weight_kg_check CHECK (weight_kg IS NULL OR weight_kg >= 0);
