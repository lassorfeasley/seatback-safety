-- Migration 026: Explicit Data API grants for all public tables and views
--
-- Supabase will stop auto-granting Data API access to the public schema:
--   May 30, 2026 — new projects
--   Oct 30, 2026 — all existing projects
--
-- This migration makes the implicit grants explicit so nothing breaks
-- when the default changes. The grant levels match our existing RLS
-- security model:
--   anon          → SELECT only  (public reads)
--   authenticated → full CRUD    (admin)
--   service_role  → full CRUD    (edge functions)

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1. TABLES
-- ═══════════════════════════════════════════════════════════════════

-- Core card tables
GRANT SELECT                          ON public.safety_cards           TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.safety_cards           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.safety_cards           TO service_role;

GRANT SELECT                          ON public.card_sides             TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.card_sides             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.card_sides             TO service_role;

GRANT SELECT                          ON public.card_panels            TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.card_panels            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.card_panels            TO service_role;

GRANT SELECT                          ON public.card_creases           TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.card_creases           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.card_creases           TO service_role;

GRANT SELECT                          ON public.card_scans             TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.card_scans             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.card_scans             TO service_role;

GRANT SELECT                          ON public.panel_crops            TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.panel_crops            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.panel_crops            TO service_role;

GRANT SELECT                          ON public.panel_images           TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.panel_images           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.panel_images           TO service_role;

-- Provenance & pricing
GRANT SELECT                          ON public.card_provenance        TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.card_provenance        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.card_provenance        TO service_role;

GRANT SELECT                          ON public.card_price_observations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.card_price_observations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.card_price_observations TO service_role;

GRANT SELECT                          ON public.card_documents         TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.card_documents         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.card_documents         TO service_role;

-- Join tables
GRANT SELECT                          ON public.card_aircraft          TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.card_aircraft          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.card_aircraft          TO service_role;

GRANT SELECT                          ON public.card_languages         TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.card_languages         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.card_languages         TO service_role;

-- Lookup tables
GRANT SELECT                          ON public.airlines               TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.airlines               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.airlines               TO service_role;

GRANT SELECT                          ON public.aircraft_manufacturers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.aircraft_manufacturers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.aircraft_manufacturers TO service_role;

GRANT SELECT                          ON public.aircraft_models        TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.aircraft_models        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.aircraft_models        TO service_role;

GRANT SELECT                          ON public.aircraft_variants      TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.aircraft_variants      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.aircraft_variants      TO service_role;

GRANT SELECT                          ON public.airline_countries      TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.airline_countries      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.airline_countries      TO service_role;

-- Social tables
GRANT SELECT                          ON public.social_posts           TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.social_posts           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.social_posts           TO service_role;

GRANT SELECT                          ON public.social_style_directives TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.social_style_directives TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.social_style_directives TO service_role;

GRANT SELECT                          ON public.social_crops           TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.social_crops           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.social_crops           TO service_role;

-- ═══════════════════════════════════════════════════════════════════
-- 2. VIEWS  (security_invoker views still need SELECT to be visible
--            in the Data API; writes go through underlying tables)
-- ═══════════════════════════════════════════════════════════════════

GRANT SELECT ON public.airline_browse        TO anon, authenticated, service_role;
GRANT SELECT ON public.manufacturer_browse   TO anon, authenticated, service_role;
GRANT SELECT ON public.model_browse          TO anon, authenticated, service_role;
GRANT SELECT ON public.variant_browse        TO anon, authenticated, service_role;
GRANT SELECT ON public.country_card_counts   TO anon, authenticated, service_role;
GRANT SELECT ON public.v_crease_pairs        TO anon, authenticated, service_role;
GRANT SELECT ON public.v_card_fold_structure TO anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════
-- 3. SEQUENCES  (authenticated & service_role need USAGE to INSERT
--               rows that use generated default values)
-- ═══════════════════════════════════════════════════════════════════

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

COMMIT;
