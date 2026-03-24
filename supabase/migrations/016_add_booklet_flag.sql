ALTER TABLE public.safety_cards
  ADD COLUMN IF NOT EXISTS is_booklet boolean NOT NULL DEFAULT false;
