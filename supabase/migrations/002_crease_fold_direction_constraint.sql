-- Migration: Add trigger to enforce opposite fold directions for front/back creases
-- When a crease is inserted or updated, ensure the corresponding crease on the opposite
-- side has the opposite fold_direction

-- Function to get the opposite fold direction
CREATE OR REPLACE FUNCTION get_opposite_fold_direction(direction text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE 
    WHEN direction = 'forward' THEN 'backward'
    WHEN direction = 'backward' THEN 'forward'
    ELSE direction
  END;
$$;

-- Function to sync the opposite side's crease
CREATE OR REPLACE FUNCTION sync_opposite_crease()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  opposite_side text;
  opposite_direction text;
BEGIN
  -- Determine the opposite side
  opposite_side := CASE WHEN NEW.side = 'front' THEN 'back' ELSE 'front' END;
  opposite_direction := get_opposite_fold_direction(NEW.fold_direction);
  
  -- Check if a crease exists on the opposite side at the same position
  -- If it does, update its fold_direction to be opposite
  UPDATE public.card_creases
  SET fold_direction = opposite_direction,
      unfold_sequence = NEW.unfold_sequence  -- Keep unfold_sequence in sync
  WHERE card_id = NEW.card_id
    AND side = opposite_side
    AND between_panel = NEW.between_panel
    AND (fold_direction != opposite_direction OR unfold_sequence != NEW.unfold_sequence);
  
  RETURN NEW;
END;
$$;

-- Create trigger to run after insert or update
DROP TRIGGER IF EXISTS trg_sync_opposite_crease ON public.card_creases;
CREATE TRIGGER trg_sync_opposite_crease
AFTER INSERT OR UPDATE OF fold_direction, unfold_sequence
ON public.card_creases
FOR EACH ROW
EXECUTE FUNCTION sync_opposite_crease();

-- Function to validate that front/back creases have opposite directions
-- This is a validation function that can be called manually or used in application logic
CREATE OR REPLACE FUNCTION validate_crease_directions(p_card_id uuid)
RETURNS TABLE (
  between_panel integer,
  front_direction text,
  back_direction text,
  is_valid boolean
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    f.between_panel,
    f.fold_direction as front_direction,
    b.fold_direction as back_direction,
    (f.fold_direction != b.fold_direction) as is_valid
  FROM public.card_creases f
  JOIN public.card_creases b 
    ON f.card_id = b.card_id 
    AND f.between_panel = b.between_panel
  WHERE f.card_id = p_card_id
    AND f.side = 'front'
    AND b.side = 'back'
  ORDER BY f.between_panel;
$$;

COMMENT ON FUNCTION validate_crease_directions IS 
  'Validates that all front/back crease pairs for a card have opposite fold directions. Returns a row for each crease position showing whether it is valid.';

