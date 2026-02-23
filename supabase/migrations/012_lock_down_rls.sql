-- Migration 012: Lock down RLS for public site + authenticated admin
--
-- Switches from anon-writes-everything to:
--   - anon  => SELECT only (public reads)
--   - authenticated => ALL (admin writes)
--
-- Covers all data tables and storage buckets.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1. LOOKUP TABLES: drop anon write, add authenticated write
-- ═══════════════════════════════════════════════════════════════════

-- airlines
DROP POLICY IF EXISTS "Anon write airlines" ON public.airlines;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'airlines' AND policyname = 'Authenticated full access airlines'
  ) THEN
    CREATE POLICY "Authenticated full access airlines"
      ON public.airlines FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- aircraft_manufacturers
DROP POLICY IF EXISTS "Anon write aircraft_manufacturers" ON public.aircraft_manufacturers;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'aircraft_manufacturers' AND policyname = 'Authenticated full access aircraft_manufacturers'
  ) THEN
    CREATE POLICY "Authenticated full access aircraft_manufacturers"
      ON public.aircraft_manufacturers FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- aircraft_models
DROP POLICY IF EXISTS "Anon write aircraft_models" ON public.aircraft_models;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'aircraft_models' AND policyname = 'Authenticated full access aircraft_models'
  ) THEN
    CREATE POLICY "Authenticated full access aircraft_models"
      ON public.aircraft_models FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- aircraft_variants
DROP POLICY IF EXISTS "Anon write aircraft_variants" ON public.aircraft_variants;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'aircraft_variants' AND policyname = 'Authenticated full access aircraft_variants'
  ) THEN
    CREATE POLICY "Authenticated full access aircraft_variants"
      ON public.aircraft_variants FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 2. JOIN TABLES: replace anon ALL with anon SELECT + auth ALL
-- ═══════════════════════════════════════════════════════════════════

-- card_aircraft
DROP POLICY IF EXISTS "Anon full access to card_aircraft" ON public.card_aircraft;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'card_aircraft' AND policyname = 'Anon read card_aircraft'
  ) THEN
    CREATE POLICY "Anon read card_aircraft"
      ON public.card_aircraft FOR SELECT TO anon USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'card_aircraft' AND policyname = 'Authenticated full access card_aircraft'
  ) THEN
    CREATE POLICY "Authenticated full access card_aircraft"
      ON public.card_aircraft FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- card_languages
DROP POLICY IF EXISTS "Anon full access to card_languages" ON public.card_languages;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'card_languages' AND policyname = 'Anon read card_languages'
  ) THEN
    CREATE POLICY "Anon read card_languages"
      ON public.card_languages FOR SELECT TO anon USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'card_languages' AND policyname = 'Authenticated full access card_languages'
  ) THEN
    CREATE POLICY "Authenticated full access card_languages"
      ON public.card_languages FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 3. CORE CARD TABLES: enable RLS + add policies
-- ═══════════════════════════════════════════════════════════════════

DO $$ 
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'safety_cards', 'card_sides', 'card_panels', 'card_creases',
    'card_scans', 'panel_crops', 'panel_images',
    'card_provenance', 'card_price_observations', 'card_documents'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = tbl AND policyname = 'Anon read ' || tbl
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Anon read %s" ON public.%I FOR SELECT TO anon USING (true)',
        tbl, tbl
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = tbl AND policyname = 'Authenticated full access ' || tbl
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Authenticated full access %s" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        tbl, tbl
      );
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 4. STORAGE: remove anon write policies, keep auth write + public read
-- ═══════════════════════════════════════════════════════════════════

-- Scans bucket (private): remove all anon policies
DROP POLICY IF EXISTS "Anon users can upload scans" ON storage.objects;
DROP POLICY IF EXISTS "Anon users can read scans" ON storage.objects;
DROP POLICY IF EXISTS "Anon users can update scans" ON storage.objects;
DROP POLICY IF EXISTS "Anon users can delete scans" ON storage.objects;

-- Documents bucket (private): remove all anon policies
DROP POLICY IF EXISTS "Anon users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Anon users can read documents" ON storage.objects;
DROP POLICY IF EXISTS "Anon users can update documents" ON storage.objects;
DROP POLICY IF EXISTS "Anon users can delete documents" ON storage.objects;

-- Derivatives bucket (public read): remove anon write policies
DROP POLICY IF EXISTS "Anon users can upload derivatives" ON storage.objects;
DROP POLICY IF EXISTS "Anon users can update derivatives" ON storage.objects;
DROP POLICY IF EXISTS "Anon users can delete derivatives" ON storage.objects;

-- Entity-images bucket (public read): remove anon write policies
DROP POLICY IF EXISTS "Anon can upload entity images" ON storage.objects;
DROP POLICY IF EXISTS "Anon can update entity images" ON storage.objects;
DROP POLICY IF EXISTS "Anon can delete entity images" ON storage.objects;

COMMIT;
