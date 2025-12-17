-- Migration: Add cover spread designation to safety_cards
-- This allows users to specify which spread and side should face outward when the card is fully folded

-- Add the cover_spread_index column (0-based index of the spread)
-- Default to 0 (first spread, matching traditional card behavior)
ALTER TABLE public.safety_cards
ADD COLUMN IF NOT EXISTS cover_spread_index integer NOT NULL DEFAULT 0
CHECK (cover_spread_index >= 0);

-- Add the cover_side column ('front' or 'back')
-- Default to 'front' (the front side of the cover spread faces outward)
ALTER TABLE public.safety_cards
ADD COLUMN IF NOT EXISTS cover_side text NOT NULL DEFAULT 'front'
CHECK (cover_side IN ('front', 'back'));

-- Create an index for efficient querying
CREATE INDEX IF NOT EXISTS idx_safety_cards_cover
ON public.safety_cards (cover_spread_index, cover_side);

-- Comment on new columns for documentation
COMMENT ON COLUMN public.safety_cards.cover_spread_index IS 
  'The 0-based index of the spread that serves as the cover when the card is fully folded. 0 = first spread (leftmost when unfolded).';

COMMENT ON COLUMN public.safety_cards.cover_side IS 
  'Which side of the cover spread faces outward when folded: front or back.';

-- Drop and recreate v_card_fold_structure view to include cover information
-- (CREATE OR REPLACE cannot change column order, so we must drop first)
DROP VIEW IF EXISTS public.v_card_fold_structure;

CREATE VIEW public.v_card_fold_structure AS
SELECT 
  sc.id as card_id,
  sc.title as card_title,
  cp.between_panel,
  cp.front_fold_direction,
  cp.back_fold_direction,
  cp.unfold_sequence,
  cp.directions_are_valid,
  sc.cover_spread_index,
  sc.cover_side,
  -- Count of panels on each side
  (SELECT COUNT(*) FROM public.card_panels p 
   JOIN public.card_sides s ON p.side_id = s.id 
   WHERE s.card_id = sc.id AND s.side = 'front') as front_panel_count,
  (SELECT COUNT(*) FROM public.card_panels p 
   JOIN public.card_sides s ON p.side_id = s.id 
   WHERE s.card_id = sc.id AND s.side = 'back') as back_panel_count
FROM public.safety_cards sc
LEFT JOIN public.v_crease_pairs cp ON cp.card_id = sc.id
ORDER BY sc.id, cp.between_panel;

COMMENT ON VIEW public.v_card_fold_structure IS 
  'Complete view of a card''s fold structure including cover designation, panel counts, and crease configurations.';

-- Function to update the cover designation for a card
CREATE OR REPLACE FUNCTION update_card_cover(
  p_card_id uuid,
  p_spread_index integer,
  p_side text DEFAULT 'front'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Validate side
  IF p_side NOT IN ('front', 'back') THEN
    RAISE EXCEPTION 'Invalid cover_side: %. Must be ''front'' or ''back''.', p_side;
  END IF;
  
  -- Validate spread index is not negative
  IF p_spread_index < 0 THEN
    RAISE EXCEPTION 'Invalid cover_spread_index: %. Must be >= 0.', p_spread_index;
  END IF;
  
  -- Update the card
  UPDATE public.safety_cards
  SET cover_spread_index = p_spread_index,
      cover_side = p_side
  WHERE id = p_card_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Card not found: %', p_card_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION update_card_cover IS 
  'Updates the cover designation for a card. The cover spread and side determine which panel faces outward when the card is fully folded.';
