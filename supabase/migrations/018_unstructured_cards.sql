-- Support for unstructured (non-standard) cards that skip the panel/crop/fold pipeline.
-- Unstructured cards store scans directly and display them in a gallery/lightbox.

ALTER TABLE public.safety_cards
  ADD COLUMN IF NOT EXISTS card_mode text NOT NULL DEFAULT 'structured'
    CHECK (card_mode IN ('structured', 'unstructured'));

-- Which scan to use as the OG / thumbnail source for unstructured cards
ALTER TABLE public.safety_cards
  ADD COLUMN IF NOT EXISTS og_scan_id uuid REFERENCES public.card_scans(id) ON DELETE SET NULL;

-- Display order for scans (used by unstructured cards in the gallery)
ALTER TABLE public.card_scans
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
