-- Migration 005: Archival storage enhancements
--
-- Adds museum-grade metadata to card_scans, global crop constraints to
-- safety_cards, expands panel_images variants, creates storage buckets
-- for original scans and derived images, and sets up RLS policies.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Archival metadata on card_scans
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.card_scans
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS sha256_hash text;

-- Allow scans to exist before being assigned to a side (the app's image
-- library lets users upload without choosing front/back first).
ALTER TABLE public.card_scans
  ALTER COLUMN side DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Global crop constraints on safety_cards
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.safety_cards
  ADD COLUMN IF NOT EXISTS panel_count integer,
  ADD COLUMN IF NOT EXISTS crop_width integer,
  ADD COLUMN IF NOT EXISTS crop_height integer;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Expand panel_images variant to include 'display'
--
--    full      – full-resolution crop from the 600 DPI scan
--    display   – ~800px wide JPEG for the card visualizer / preview UI
--    thumbnail – ~300px wide JPEG for grid views
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.panel_images
  DROP CONSTRAINT IF EXISTS panel_images_variant_check;

ALTER TABLE public.panel_images
  ADD CONSTRAINT panel_images_variant_check
    CHECK (variant = ANY (ARRAY['full'::text, 'display'::text, 'thumbnail'::text]));

-- ─────────────────────────────────────────────────────────────────────
-- 4. Unique constraint on card_sides – one front and one back per card
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.card_sides
  DROP CONSTRAINT IF EXISTS card_sides_card_id_side_unique;

ALTER TABLE public.card_sides
  ADD CONSTRAINT card_sides_card_id_side_unique UNIQUE (card_id, side);

-- ─────────────────────────────────────────────────────────────────────
-- 5. Index for "which panels use this scan?" lookups
-- ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_panel_crops_scan_id
  ON public.panel_crops (scan_id);

-- ─────────────────────────────────────────────────────────────────────
-- 6. Storage buckets
--
--    scans       – original 600 DPI TIFFs/JPEGs (private, signed URLs)
--    derivatives – generated crops & thumbnails (public read)
--
--    Path conventions:
--      scans/{card_id}/{scan_id}.{ext}
--      derivatives/{card_id}/{panel_id}_{variant}.jpg
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
  VALUES ('scans', 'scans', false)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('derivatives', 'derivatives', true)
  ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 7. Storage RLS policies
-- ─────────────────────────────────────────────────────────────────────

-- scans bucket: authenticated users can upload and read, no public access
CREATE POLICY "Authenticated users can upload scans"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'scans');

CREATE POLICY "Authenticated users can read scans"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'scans');

CREATE POLICY "Authenticated users can update scans"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'scans')
  WITH CHECK (bucket_id = 'scans');

CREATE POLICY "Authenticated users can delete scans"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'scans');

-- derivatives bucket: authenticated users can manage, anyone can read
CREATE POLICY "Authenticated users can upload derivatives"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'derivatives');

CREATE POLICY "Anyone can view derivatives"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'derivatives');

CREATE POLICY "Authenticated users can update derivatives"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'derivatives')
  WITH CHECK (bucket_id = 'derivatives');

CREATE POLICY "Authenticated users can delete derivatives"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'derivatives');

COMMIT;
