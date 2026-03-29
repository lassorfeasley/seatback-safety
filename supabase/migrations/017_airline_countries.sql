-- Migration 017: Multi-country airlines
--
-- Replaces the single `country` text column on airlines with an
-- `airline_countries` join table so airlines like SAS can be associated
-- with multiple countries.

BEGIN;

-- 1. Create join table
CREATE TABLE IF NOT EXISTS public.airline_countries (
  airline_id uuid NOT NULL REFERENCES public.airlines(id) ON DELETE CASCADE,
  country_name text NOT NULL,
  PRIMARY KEY (airline_id, country_name)
);

-- 2. Migrate existing data
INSERT INTO public.airline_countries (airline_id, country_name)
SELECT id, country FROM public.airlines WHERE country IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. Drop the old view that depends on the country column, then drop the column
DROP VIEW IF EXISTS public.airline_browse;
ALTER TABLE public.airlines DROP COLUMN IF EXISTS country;

-- 4. Update airline_browse view
CREATE OR REPLACE VIEW public.airline_browse AS
SELECT
  a.id,
  a.name,
  a.slug,
  a.iata_code,
  a.icao_code,
  a.logo_path,
  a.active,
  a.description,
  ARRAY_AGG(DISTINCT ac.country_name) FILTER (WHERE ac.country_name IS NOT NULL) AS countries,
  COUNT(DISTINCT sc.id) AS card_count
FROM public.airlines a
LEFT JOIN public.airline_countries ac ON ac.airline_id = a.id
LEFT JOIN public.safety_cards sc ON sc.airline_id = a.id
GROUP BY a.id;

-- 5. Country card counts view (for browse / stats)
CREATE OR REPLACE VIEW public.country_card_counts AS
SELECT
  ac.country_name AS name,
  COUNT(DISTINCT sc.id) AS card_count
FROM public.airline_countries ac
JOIN public.safety_cards sc ON sc.airline_id = ac.airline_id
GROUP BY ac.country_name;

-- 6. RLS
ALTER TABLE public.airline_countries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'airline_countries' AND policyname = 'Anon read airline_countries'
  ) THEN
    CREATE POLICY "Anon read airline_countries"
      ON public.airline_countries FOR SELECT TO anon USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'airline_countries' AND policyname = 'Authenticated full access airline_countries'
  ) THEN
    CREATE POLICY "Authenticated full access airline_countries"
      ON public.airline_countries FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;
