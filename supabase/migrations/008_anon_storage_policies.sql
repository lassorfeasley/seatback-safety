-- Migration 008: Allow anon role to use storage buckets
--
-- The app currently uses the Supabase anon key (no user authentication),
-- but the storage RLS policies only allowed the 'authenticated' role.
-- This adds parallel policies for 'anon' so the app can upload/manage
-- files in all three buckets.

BEGIN;

-- ─── Scans bucket ──────────────────────────────────────────────────

CREATE POLICY "Anon users can upload scans"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'scans');

CREATE POLICY "Anon users can read scans"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'scans');

CREATE POLICY "Anon users can update scans"
  ON storage.objects FOR UPDATE
  TO anon
  USING (bucket_id = 'scans')
  WITH CHECK (bucket_id = 'scans');

CREATE POLICY "Anon users can delete scans"
  ON storage.objects FOR DELETE
  TO anon
  USING (bucket_id = 'scans');

-- ─── Documents bucket ──────────────────────────────────────────────

CREATE POLICY "Anon users can upload documents"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Anon users can read documents"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'documents');

CREATE POLICY "Anon users can update documents"
  ON storage.objects FOR UPDATE
  TO anon
  USING (bucket_id = 'documents')
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Anon users can delete documents"
  ON storage.objects FOR DELETE
  TO anon
  USING (bucket_id = 'documents');

-- ─── Derivatives bucket ───────────────────────────────────────────
-- (already has public SELECT; adding INSERT/UPDATE/DELETE for anon)

CREATE POLICY "Anon users can upload derivatives"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'derivatives');

CREATE POLICY "Anon users can update derivatives"
  ON storage.objects FOR UPDATE
  TO anon
  USING (bucket_id = 'derivatives')
  WITH CHECK (bucket_id = 'derivatives');

CREATE POLICY "Anon users can delete derivatives"
  ON storage.objects FOR DELETE
  TO anon
  USING (bucket_id = 'derivatives');

COMMIT;
