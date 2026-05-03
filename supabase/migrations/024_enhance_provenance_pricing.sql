-- Migration 024: Enhance provenance and pricing data model
--
-- Adds acquisition detail fields to card_provenance (seller, platform,
-- cost breakdown, lot info). Adds listing_url to price observations.
-- Adds ai_analysis JSONB to card_documents for storing AI extraction results.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Richer provenance / acquisition fields
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.card_provenance
  ADD COLUMN IF NOT EXISTS seller_name      text,
  ADD COLUMN IF NOT EXISTS platform         text,
  ADD COLUMN IF NOT EXISTS platform_listing_url text,
  ADD COLUMN IF NOT EXISTS price_paid_usd   numeric,
  ADD COLUMN IF NOT EXISTS shipping_cost_usd numeric,
  ADD COLUMN IF NOT EXISTS lot_size         integer,
  ADD COLUMN IF NOT EXISTS condition_at_acquisition text;

COMMENT ON COLUMN public.card_provenance.seller_name IS 'Seller username or business name';
COMMENT ON COLUMN public.card_provenance.platform IS 'Where acquired: ebay, etsy, dealer, in_person, trade, gift, airline, other';
COMMENT ON COLUMN public.card_provenance.platform_listing_url IS 'URL of the listing';
COMMENT ON COLUMN public.card_provenance.price_paid_usd IS 'Item price in USD';
COMMENT ON COLUMN public.card_provenance.shipping_cost_usd IS 'Shipping cost in USD';
COMMENT ON COLUMN public.card_provenance.lot_size IS 'Number of cards in lot (for per-card cost calc)';
COMMENT ON COLUMN public.card_provenance.condition_at_acquisition IS 'Condition when acquired: mint, near_mint, excellent, good, fair, poor';

-- ─────────────────────────────────────────────────────────────────────
-- 2. Listing URL on price observations
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.card_price_observations
  ADD COLUMN IF NOT EXISTS listing_url text;

COMMENT ON COLUMN public.card_price_observations.listing_url IS 'URL of the observed listing or auction result';

-- ─────────────────────────────────────────────────────────────────────
-- 3. AI analysis storage on documents
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.card_documents
  ADD COLUMN IF NOT EXISTS ai_analysis jsonb;

COMMENT ON COLUMN public.card_documents.ai_analysis IS 'Structured data extracted by AI from this document';

COMMIT;
