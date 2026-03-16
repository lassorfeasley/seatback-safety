-- Migration 013: Security hardening
--
-- Resolves all Supabase linter errors and warnings:
--   - Enable RLS on 4 lookup tables (policy_exists_rls_disabled + rls_disabled_in_public)
--   - Switch 6 views to SECURITY INVOKER (security_definer_view)
--   - Pin search_path on 6 functions (function_search_path_mutable)
--   - Drop duplicate policies on 2 join tables (rls_policy_always_true duplicates)

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1. Enable RLS on lookup tables that have policies but RLS disabled
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.airlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aircraft_manufacturers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aircraft_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aircraft_variants ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════
-- 2. Switch views from SECURITY DEFINER to SECURITY INVOKER
-- ═══════════════════════════════════════════════════════════════════

ALTER VIEW public.airline_browse SET (security_invoker = on);
ALTER VIEW public.manufacturer_browse SET (security_invoker = on);
ALTER VIEW public.model_browse SET (security_invoker = on);
ALTER VIEW public.variant_browse SET (security_invoker = on);
ALTER VIEW public.v_crease_pairs SET (security_invoker = on);
ALTER VIEW public.v_card_fold_structure SET (security_invoker = on);

-- ═══════════════════════════════════════════════════════════════════
-- 3. Pin search_path on all public functions
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_opposite_fold_direction(direction text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN direction = 'forward' THEN 'backward'
    WHEN direction = 'backward' THEN 'forward'
    ELSE direction
  END;
$$;

CREATE OR REPLACE FUNCTION public.sync_opposite_crease()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  opposite_side text;
  opposite_direction text;
BEGIN
  opposite_side := CASE WHEN NEW.side = 'front' THEN 'back' ELSE 'front' END;
  opposite_direction := public.get_opposite_fold_direction(NEW.fold_direction);

  UPDATE public.card_creases
  SET fold_direction = opposite_direction,
      unfold_sequence = NEW.unfold_sequence
  WHERE card_id = NEW.card_id
    AND side = opposite_side
    AND between_panel = NEW.between_panel
    AND (fold_direction != opposite_direction OR unfold_sequence != NEW.unfold_sequence);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_crease_directions(p_card_id uuid)
RETURNS TABLE (
  between_panel integer,
  front_direction text,
  back_direction text,
  is_valid boolean
)
LANGUAGE sql
STABLE
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.create_crease_pair(
  p_card_id uuid,
  p_between_panel integer,
  p_front_direction text DEFAULT 'forward',
  p_unfold_sequence integer DEFAULT NULL
)
RETURNS TABLE (front_crease_id uuid, back_crease_id uuid)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_front_id uuid;
  v_back_id uuid;
  v_back_direction text;
  v_sequence integer;
BEGIN
  v_back_direction := public.get_opposite_fold_direction(p_front_direction);

  v_sequence := COALESCE(p_unfold_sequence, p_between_panel);

  INSERT INTO public.card_creases (card_id, side, between_panel, fold_direction, unfold_sequence)
  VALUES (p_card_id, 'front', p_between_panel, p_front_direction, v_sequence)
  ON CONFLICT (card_id, side, unfold_sequence) DO UPDATE
  SET fold_direction = EXCLUDED.fold_direction,
      between_panel = EXCLUDED.between_panel
  RETURNING id INTO v_front_id;

  INSERT INTO public.card_creases (card_id, side, between_panel, fold_direction, unfold_sequence)
  VALUES (p_card_id, 'back', p_between_panel, v_back_direction, v_sequence)
  ON CONFLICT (card_id, side, unfold_sequence) DO UPDATE
  SET fold_direction = EXCLUDED.fold_direction,
      between_panel = EXCLUDED.between_panel
  RETURNING id INTO v_back_id;

  RETURN QUERY SELECT v_front_id, v_back_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_unfold_sequence(
  p_card_id uuid,
  p_between_panel integer,
  p_new_sequence integer
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_old_sequence integer;
  v_swap_panel integer;
BEGIN
  SELECT unfold_sequence INTO v_old_sequence
  FROM public.card_creases
  WHERE card_id = p_card_id
    AND side = 'front'
    AND between_panel = p_between_panel;

  IF v_old_sequence = p_new_sequence THEN
    RETURN;
  END IF;

  SELECT between_panel INTO v_swap_panel
  FROM public.card_creases
  WHERE card_id = p_card_id
    AND side = 'front'
    AND unfold_sequence = p_new_sequence
    AND between_panel != p_between_panel;

  UPDATE public.card_creases
  SET unfold_sequence = -1
  WHERE card_id = p_card_id
    AND between_panel = p_between_panel;

  IF v_swap_panel IS NOT NULL THEN
    UPDATE public.card_creases
    SET unfold_sequence = v_old_sequence
    WHERE card_id = p_card_id
      AND between_panel = v_swap_panel;
  END IF;

  UPDATE public.card_creases
  SET unfold_sequence = p_new_sequence
  WHERE card_id = p_card_id
    AND between_panel = p_between_panel;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_card_cover(
  p_card_id uuid,
  p_spread_index integer,
  p_side text DEFAULT 'front'
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF p_side NOT IN ('front', 'back') THEN
    RAISE EXCEPTION 'Invalid cover_side: %. Must be ''front'' or ''back''.', p_side;
  END IF;

  IF p_spread_index < 0 THEN
    RAISE EXCEPTION 'Invalid cover_spread_index: %. Must be >= 0.', p_spread_index;
  END IF;

  UPDATE public.safety_cards
  SET cover_spread_index = p_spread_index,
      cover_side = p_side
  WHERE id = p_card_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Card not found: %', p_card_id;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 4. Drop duplicate policies on join tables
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated users can manage card_aircraft" ON public.card_aircraft;
DROP POLICY IF EXISTS "Authenticated users can manage card_languages" ON public.card_languages;

COMMIT;
