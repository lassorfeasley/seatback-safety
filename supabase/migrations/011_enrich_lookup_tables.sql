-- Migration 011: Enrich lookup tables for public showcase
--
-- Adds display metadata (logos, codes, descriptions) to airlines,
-- aircraft_manufacturers, aircraft_models, and aircraft_variants.
-- Creates an entity-images storage bucket for logos/photos.
-- Adds slug to aircraft_variants.
-- Adds anon read policies on lookup tables.
-- Creates a card_counts view for browse pages.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Enrich airlines
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.airlines
  ADD COLUMN IF NOT EXISTS iata_code   text,
  ADD COLUMN IF NOT EXISTS icao_code   text,
  ADD COLUMN IF NOT EXISTS country     text,
  ADD COLUMN IF NOT EXISTS logo_path   text,       -- path in entity-images bucket
  ADD COLUMN IF NOT EXISTS active      boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS description text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_airlines_iata ON public.airlines (iata_code) WHERE iata_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_airlines_icao ON public.airlines (icao_code) WHERE icao_code IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Enrich aircraft_manufacturers
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.aircraft_manufacturers
  ADD COLUMN IF NOT EXISTS country     text,
  ADD COLUMN IF NOT EXISTS logo_path   text,
  ADD COLUMN IF NOT EXISTS website_url text;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Enrich aircraft_models
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.aircraft_models
  ADD COLUMN IF NOT EXISTS aircraft_type     text,  -- e.g. 'narrowbody', 'widebody', 'regional', 'turboprop'
  ADD COLUMN IF NOT EXISTS first_flight_year integer,
  ADD COLUMN IF NOT EXISTS description       text,
  ADD COLUMN IF NOT EXISTS image_path        text;

ALTER TABLE public.aircraft_models
  DROP CONSTRAINT IF EXISTS aircraft_models_type_check;

ALTER TABLE public.aircraft_models
  ADD CONSTRAINT aircraft_models_type_check
    CHECK (aircraft_type IS NULL OR aircraft_type = ANY (ARRAY[
      'narrowbody'::text, 'widebody'::text, 'regional'::text,
      'turboprop'::text, 'commuter'::text, 'supersonic'::text, 'other'::text
    ]));

-- ─────────────────────────────────────────────────────────────────────
-- 4. Enrich aircraft_variants + add slug
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.aircraft_variants
  ADD COLUMN IF NOT EXISTS slug        text,
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS description text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_aircraft_variants_slug
  ON public.aircraft_variants (slug) WHERE slug IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Entity-images storage bucket (public read)
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
  VALUES ('entity-images', 'entity-images', true)
  ON CONFLICT (id) DO NOTHING;

-- Authenticated users can manage entity images
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Auth users can upload entity images'
  ) THEN
    CREATE POLICY "Auth users can upload entity images"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'entity-images');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Auth users can update entity images'
  ) THEN
    CREATE POLICY "Auth users can update entity images"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'entity-images')
      WITH CHECK (bucket_id = 'entity-images');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Auth users can delete entity images'
  ) THEN
    CREATE POLICY "Auth users can delete entity images"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'entity-images');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Anyone can view entity images'
  ) THEN
    CREATE POLICY "Anyone can view entity images"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'entity-images');
  END IF;
END $$;

-- Anon can also upload/manage (current app has no auth)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Anon can upload entity images'
  ) THEN
    CREATE POLICY "Anon can upload entity images"
      ON storage.objects FOR INSERT
      TO anon
      WITH CHECK (bucket_id = 'entity-images');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Anon can update entity images'
  ) THEN
    CREATE POLICY "Anon can update entity images"
      ON storage.objects FOR UPDATE
      TO anon
      USING (bucket_id = 'entity-images')
      WITH CHECK (bucket_id = 'entity-images');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Anon can delete entity images'
  ) THEN
    CREATE POLICY "Anon can delete entity images"
      ON storage.objects FOR DELETE
      TO anon
      USING (bucket_id = 'entity-images');
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Anon read access on lookup tables
-- ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'airlines' AND policyname = 'Anon read airlines'
  ) THEN
    CREATE POLICY "Anon read airlines"
      ON public.airlines FOR SELECT TO anon USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'airlines' AND policyname = 'Anon write airlines'
  ) THEN
    CREATE POLICY "Anon write airlines"
      ON public.airlines FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'aircraft_manufacturers' AND policyname = 'Anon read aircraft_manufacturers'
  ) THEN
    CREATE POLICY "Anon read aircraft_manufacturers"
      ON public.aircraft_manufacturers FOR SELECT TO anon USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'aircraft_manufacturers' AND policyname = 'Anon write aircraft_manufacturers'
  ) THEN
    CREATE POLICY "Anon write aircraft_manufacturers"
      ON public.aircraft_manufacturers FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'aircraft_models' AND policyname = 'Anon read aircraft_models'
  ) THEN
    CREATE POLICY "Anon read aircraft_models"
      ON public.aircraft_models FOR SELECT TO anon USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'aircraft_models' AND policyname = 'Anon write aircraft_models'
  ) THEN
    CREATE POLICY "Anon write aircraft_models"
      ON public.aircraft_models FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'aircraft_variants' AND policyname = 'Anon read aircraft_variants'
  ) THEN
    CREATE POLICY "Anon read aircraft_variants"
      ON public.aircraft_variants FOR SELECT TO anon USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'aircraft_variants' AND policyname = 'Anon write aircraft_variants'
  ) THEN
    CREATE POLICY "Anon write aircraft_variants"
      ON public.aircraft_variants FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 7. Card count views for browse pages
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.airline_browse AS
SELECT
  a.id,
  a.name,
  a.slug,
  a.iata_code,
  a.icao_code,
  a.country,
  a.logo_path,
  a.active,
  a.description,
  COUNT(DISTINCT sc.id) AS card_count
FROM public.airlines a
LEFT JOIN public.safety_cards sc ON sc.airline_id = a.id
GROUP BY a.id;

CREATE OR REPLACE VIEW public.manufacturer_browse AS
SELECT
  m.id,
  m.name,
  m.slug,
  m.country,
  m.logo_path,
  m.website_url,
  COUNT(DISTINCT ca.card_id) AS card_count
FROM public.aircraft_manufacturers m
LEFT JOIN public.aircraft_models am ON am.manufacturer_id = m.id
LEFT JOIN public.card_aircraft ca ON ca.aircraft_model_id = am.id
GROUP BY m.id;

CREATE OR REPLACE VIEW public.model_browse AS
SELECT
  am.id,
  am.name,
  am.slug,
  am.manufacturer_id,
  m.name   AS manufacturer_name,
  m.slug   AS manufacturer_slug,
  am.aircraft_type,
  am.first_flight_year,
  am.description,
  am.image_path,
  COUNT(DISTINCT ca.card_id) AS card_count
FROM public.aircraft_models am
JOIN public.aircraft_manufacturers m ON m.id = am.manufacturer_id
LEFT JOIN public.card_aircraft ca ON ca.aircraft_model_id = am.id
GROUP BY am.id, m.id;

CREATE OR REPLACE VIEW public.variant_browse AS
SELECT
  v.id,
  v.name,
  v.slug,
  v.designation,
  v.description,
  v.model_id,
  am.name  AS model_name,
  am.slug  AS model_slug,
  m.id     AS manufacturer_id,
  m.name   AS manufacturer_name,
  m.slug   AS manufacturer_slug,
  COUNT(DISTINCT ca.card_id) AS card_count
FROM public.aircraft_variants v
JOIN public.aircraft_models am ON am.id = v.model_id
JOIN public.aircraft_manufacturers m ON m.id = am.manufacturer_id
LEFT JOIN public.card_aircraft ca ON ca.aircraft_variant_id = v.id
GROUP BY v.id, am.id, m.id;

COMMIT;
