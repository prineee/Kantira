-- KANTIRA Business OS — UAT/TEST DATA — NOT a schema migration
--
-- THIS FILE IS NOT PART OF THE MIGRATION CHAIN. It is not applied by
-- `supabase db reset` / `supabase start` and is never run automatically —
-- it must be executed deliberately against a specific environment, exactly
-- once per environment (though it is safe to re-run: every statement below
-- is idempotent).
--
-- Purpose: populate the four pre-existing UAT/placeholder items with TEST
-- shipping weights, and create exactly one TEST Shiprocket pickup mapping
-- (MAIN store -> "DCM" / provider_location_id 2836654) so the Phase 5B-8D/E
-- checkout shipping-quote pipeline can be exercised end-to-end.
--
-- ==========================================================================
-- THESE ARE UAT/TEST VALUES ONLY.
--   - The four weights below are placeholder test data for the four
--     existing UAT SKUs (SKU-UAT-001, UAT-ITEM-01/02/03) — NOT real product
--     weights, and must never be copied onto any other item.
--   - The MAIN -> DCM pickup mapping is a TEST configuration only: DCM is
--     physically registered in Patna, Bihar while MAIN is Mumbai. This is
--     NOT a confirmed production logistics arrangement — it exists solely
--     to validate the pipeline, and must be reviewed/replaced with a real
--     mapping decision before any real online order or shipment is created.
--   - UAT01 (Pune) is deliberately NOT mapped by this script.
-- ==========================================================================

-- ---------------------------------------------------------------------
-- 1. UAT item weights (idempotent: re-running sets the same values again)
-- ---------------------------------------------------------------------

UPDATE public.items
SET weight_kg = 0.350
WHERE sku = 'SKU-UAT-001';

UPDATE public.items
SET weight_kg = 0.400
WHERE sku = 'UAT-ITEM-01';

UPDATE public.items
SET weight_kg = 0.500
WHERE sku = 'UAT-ITEM-02';

UPDATE public.items
SET weight_kg = 0.750
WHERE sku = 'UAT-ITEM-03';

-- ---------------------------------------------------------------------
-- 2. UAT pickup mapping: MAIN -> SHIPROCKET -> DCM (2836654)
--
-- store_shipping_config's own unique index on (organization_id, store_id)
-- is the natural idempotency/conflict target: re-running this script
-- updates the same one row in place rather than ever creating a second
-- mapping row for MAIN. This can never produce a duplicate *active*
-- mapping for the same store, by construction (the unique index caps it
-- at exactly one row per store, full stop, active or not).
-- ---------------------------------------------------------------------

INSERT INTO public.store_shipping_config (
  organization_id, store_id, provider, provider_location_id, provider_location_name, active
)
SELECT
  s.organization_id,
  s.id,
  'SHIPROCKET',
  '2836654',
  'DCM',
  true
FROM public.stores s
WHERE s.store_code = 'MAIN'
  AND s.organization_id = public.primary_storefront_org_id()
ON CONFLICT (organization_id, store_id) DO UPDATE
SET provider = EXCLUDED.provider,
    provider_location_id = EXCLUDED.provider_location_id,
    provider_location_name = EXCLUDED.provider_location_name,
    active = EXCLUDED.active;

-- ---------------------------------------------------------------------
-- 3. Verification (informational only — safe to run, changes nothing)
-- ---------------------------------------------------------------------

SELECT sku, name, weight_kg FROM public.items
WHERE sku IN ('SKU-UAT-001', 'UAT-ITEM-01', 'UAT-ITEM-02', 'UAT-ITEM-03')
ORDER BY sku;

SELECT s.store_code, ssc.provider, ssc.provider_location_id, ssc.provider_location_name, ssc.active
FROM public.store_shipping_config ssc
JOIN public.stores s ON s.id = ssc.store_id;
