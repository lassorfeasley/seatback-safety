-- Migration 010: Add pivot_index to safety_cards
--
-- The pivot panel is the stationary "spine" of the card during fold/unfold.
-- Panels to its left fold leftward, panels to its right fold rightward.
-- Nullable; when NULL, the app auto-derives from the cover position.

ALTER TABLE public.safety_cards
ADD COLUMN IF NOT EXISTS pivot_index integer;
