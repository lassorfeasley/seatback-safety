-- Daily auto-post cron: picks a random card OG image and publishes to Instagram.
-- Runs at 13:00 UTC (9 AM ET) every day.
--
-- SETUP: Run this in the Supabase SQL Editor (Dashboard > SQL Editor) after
-- enabling pg_cron and pg_net extensions (Dashboard > Database > Extensions).
--
-- Replace YOUR_SERVICE_ROLE_KEY with the value from
-- Dashboard > Project Settings > API > service_role key.

select cron.schedule(
  'daily-instagram-post',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://bdajjvzqelklyklnxrgg.supabase.co/functions/v1/daily-post',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
