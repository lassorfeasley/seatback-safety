-- Migration 025: Add order number, currency, and order date to provenance

BEGIN;

ALTER TABLE public.card_provenance
  ADD COLUMN IF NOT EXISTS order_number    text,
  ADD COLUMN IF NOT EXISTS order_date      date,
  ADD COLUMN IF NOT EXISTS currency        text,
  ADD COLUMN IF NOT EXISTS price_original  numeric;

COMMENT ON COLUMN public.card_provenance.order_number IS 'Platform order or transaction number (e.g. eBay order number)';
COMMENT ON COLUMN public.card_provenance.order_date IS 'Date the order was placed (may differ from acquired_date/delivery date)';
COMMENT ON COLUMN public.card_provenance.currency IS 'Original currency code if not USD (e.g. GBP, EUR)';
COMMENT ON COLUMN public.card_provenance.price_original IS 'Original price in the listed currency before USD conversion';

COMMIT;
