-- Migration: Create helper views for working with creases

-- View to see creases paired by position (front and back together)
CREATE OR REPLACE VIEW public.v_crease_pairs AS
SELECT 
  COALESCE(f.card_id, b.card_id) as card_id,
  COALESCE(f.between_panel, b.between_panel) as between_panel,
  f.id as front_crease_id,
  f.fold_direction as front_fold_direction,
  b.id as back_crease_id,
  b.fold_direction as back_fold_direction,
  COALESCE(f.unfold_sequence, b.unfold_sequence) as unfold_sequence,
  -- Validation: front and back should have opposite directions
  CASE 
    WHEN f.id IS NULL OR b.id IS NULL THEN false
    WHEN f.fold_direction != b.fold_direction THEN true
    ELSE false
  END as directions_are_valid
FROM public.card_creases f
FULL OUTER JOIN public.card_creases b 
  ON f.card_id = b.card_id 
  AND f.between_panel = b.between_panel
  AND b.side = 'back'
WHERE f.side = 'front' OR f.side IS NULL
ORDER BY card_id, between_panel;

COMMENT ON VIEW public.v_crease_pairs IS 
  'Shows front and back creases paired by their between_panel position. Useful for validating that fold directions are opposite.';

-- View to get the complete fold structure for a card
CREATE OR REPLACE VIEW public.v_card_fold_structure AS
SELECT 
  sc.id as card_id,
  sc.title as card_title,
  cp.between_panel,
  cp.front_fold_direction,
  cp.back_fold_direction,
  cp.unfold_sequence,
  cp.directions_are_valid,
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
  'Complete view of a card''s fold structure including panel counts and crease configurations.';

-- Function to create paired creases for a card
-- This ensures both front and back creases are created together with opposite directions
CREATE OR REPLACE FUNCTION create_crease_pair(
  p_card_id uuid,
  p_between_panel integer,
  p_front_direction text DEFAULT 'forward',
  p_unfold_sequence integer DEFAULT NULL
)
RETURNS TABLE (front_crease_id uuid, back_crease_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
  v_front_id uuid;
  v_back_id uuid;
  v_back_direction text;
  v_sequence integer;
BEGIN
  -- Calculate opposite direction for back
  v_back_direction := get_opposite_fold_direction(p_front_direction);
  
  -- Use provided sequence or calculate based on position
  v_sequence := COALESCE(p_unfold_sequence, p_between_panel);
  
  -- Insert front crease
  INSERT INTO public.card_creases (card_id, side, between_panel, fold_direction, unfold_sequence)
  VALUES (p_card_id, 'front', p_between_panel, p_front_direction, v_sequence)
  ON CONFLICT (card_id, side, unfold_sequence) DO UPDATE
  SET fold_direction = EXCLUDED.fold_direction,
      between_panel = EXCLUDED.between_panel
  RETURNING id INTO v_front_id;
  
  -- Insert back crease
  INSERT INTO public.card_creases (card_id, side, between_panel, fold_direction, unfold_sequence)
  VALUES (p_card_id, 'back', p_between_panel, v_back_direction, v_sequence)
  ON CONFLICT (card_id, side, unfold_sequence) DO UPDATE
  SET fold_direction = EXCLUDED.fold_direction,
      between_panel = EXCLUDED.between_panel
  RETURNING id INTO v_back_id;
  
  RETURN QUERY SELECT v_front_id, v_back_id;
END;
$$;

COMMENT ON FUNCTION create_crease_pair IS 
  'Creates a pair of creases (front and back) with automatically opposite fold directions. Use this instead of inserting creases directly to ensure consistency.';

-- Function to update unfold sequence and handle swaps
CREATE OR REPLACE FUNCTION update_unfold_sequence(
  p_card_id uuid,
  p_between_panel integer,
  p_new_sequence integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_sequence integer;
  v_swap_panel integer;
BEGIN
  -- Get the current sequence for this crease position
  SELECT unfold_sequence INTO v_old_sequence
  FROM public.card_creases
  WHERE card_id = p_card_id 
    AND side = 'front' 
    AND between_panel = p_between_panel;
  
  -- If no change needed, exit
  IF v_old_sequence = p_new_sequence THEN
    RETURN;
  END IF;
  
  -- Find if another crease already has the target sequence
  SELECT between_panel INTO v_swap_panel
  FROM public.card_creases
  WHERE card_id = p_card_id 
    AND side = 'front' 
    AND unfold_sequence = p_new_sequence
    AND between_panel != p_between_panel;
  
  -- Temporarily set to a high value to avoid unique constraint violation
  UPDATE public.card_creases
  SET unfold_sequence = -1
  WHERE card_id = p_card_id 
    AND between_panel = p_between_panel;
  
  -- If there's a crease to swap with, give it our old sequence
  IF v_swap_panel IS NOT NULL THEN
    UPDATE public.card_creases
    SET unfold_sequence = v_old_sequence
    WHERE card_id = p_card_id 
      AND between_panel = v_swap_panel;
  END IF;
  
  -- Set our new sequence
  UPDATE public.card_creases
  SET unfold_sequence = p_new_sequence
  WHERE card_id = p_card_id 
    AND between_panel = p_between_panel;
END;
$$;

COMMENT ON FUNCTION update_unfold_sequence IS 
  'Updates the unfold_sequence for a crease, automatically swapping with any crease that already has that sequence number. Ensures uniqueness is maintained.';



