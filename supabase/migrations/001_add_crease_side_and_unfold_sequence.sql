-- Migration: Add side and unfold_sequence columns to card_creases
-- This supports the fold editor's ability to:
-- 1. Track front/back creases separately (with opposite fold directions)
-- 2. Define the order in which creases unfold during animation

-- Add the 'side' column to distinguish front/back creases
ALTER TABLE public.card_creases
ADD COLUMN IF NOT EXISTS side text NOT NULL DEFAULT 'front'
CHECK (side IN ('front', 'back'));

-- Add the 'unfold_sequence' column to control animation order
-- Lower numbers unfold first (0 = innermost fold, unfolds first)
ALTER TABLE public.card_creases
ADD COLUMN IF NOT EXISTS unfold_sequence integer NOT NULL DEFAULT 0;

-- Create a unique constraint to ensure no duplicate unfold_sequence per card+side
-- This prevents two creases on the same side from having the same sequence number
ALTER TABLE public.card_creases
ADD CONSTRAINT card_creases_unique_unfold_sequence 
UNIQUE (card_id, side, unfold_sequence);

-- Create an index for efficient querying by card and side
CREATE INDEX IF NOT EXISTS idx_card_creases_card_side 
ON public.card_creases (card_id, side);

-- Comment on new columns for documentation
COMMENT ON COLUMN public.card_creases.side IS 
  'Which side of the card this crease belongs to (front or back). Front and back creases at the same between_panel position must have opposite fold_direction values.';

COMMENT ON COLUMN public.card_creases.unfold_sequence IS 
  'The order in which this crease unfolds during animation. 0 = unfolds first (innermost), higher numbers unfold later. Must be unique per card+side combination.';

