-- Migration 006: Provenance, pricing, and document attachments
--
-- Adds a card_documents table for receipts/invoices/PDFs linked to
-- provenance entries or price observations. Creates a private
-- documents storage bucket. Fixes cascade deletes on existing tables.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. card_documents table
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE public.card_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.safety_cards(id) ON DELETE CASCADE,
  provenance_id uuid REFERENCES public.card_provenance(id) ON DELETE SET NULL,
  price_observation_id uuid REFERENCES public.card_price_observations(id) ON DELETE SET NULL,
  file_path text NOT NULL,
  original_filename text NOT NULL,
  mime_type text,
  file_size_bytes bigint,
  label text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT card_documents_pkey PRIMARY KEY (id)
);

-- ─────────────────────────────────────────────────────────────────────
-- 2. Fix cascade deletes on existing tables
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.card_provenance
  DROP CONSTRAINT card_provenance_card_id_fkey,
  ADD CONSTRAINT card_provenance_card_id_fkey
    FOREIGN KEY (card_id) REFERENCES public.safety_cards(id) ON DELETE CASCADE;

ALTER TABLE public.card_price_observations
  DROP CONSTRAINT card_price_observations_card_id_fkey,
  ADD CONSTRAINT card_price_observations_card_id_fkey
    FOREIGN KEY (card_id) REFERENCES public.safety_cards(id) ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Documents storage bucket (private)
--
--    Path convention: documents/{card_id}/{document_id}.{ext}
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
  VALUES ('documents', 'documents', false)
  ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Documents bucket RLS policies
-- ─────────────────────────────────────────────────────────────────────

CREATE POLICY "Authenticated users can upload documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Authenticated users can read documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'documents');

CREATE POLICY "Authenticated users can update documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'documents')
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Authenticated users can delete documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'documents');

COMMIT;
