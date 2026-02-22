-- Migration 009: Allow anon role full access to join tables
--
-- The app uses the Supabase anon key (no user authentication).
-- Tables like card_aircraft and card_languages have RLS enabled
-- but no policies for the anon role, causing insert/delete failures.

BEGIN;

-- ─── card_aircraft ──────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'card_aircraft' AND policyname = 'Anon full access to card_aircraft'
  ) THEN
    CREATE POLICY "Anon full access to card_aircraft"
      ON public.card_aircraft FOR ALL
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ─── card_languages ─────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'card_languages' AND policyname = 'Anon full access to card_languages'
  ) THEN
    CREATE POLICY "Anon full access to card_languages"
      ON public.card_languages FOR ALL
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

COMMIT;
