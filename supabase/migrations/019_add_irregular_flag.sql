-- Irregular cards/booklets go through the full crop/fold pipeline
-- but skip the 3D visualizer on the public page (straight to lightbox).
ALTER TABLE public.safety_cards
  ADD COLUMN IF NOT EXISTS is_irregular boolean NOT NULL DEFAULT false;
