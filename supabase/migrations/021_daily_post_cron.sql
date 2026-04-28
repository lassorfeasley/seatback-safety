-- Daily auto-post cron: picks a random card OG image and publishes to Instagram.
-- Runs at 13:00 UTC (9 AM ET) every day.
--
-- SETUP (one-time, run in Supabase SQL Editor):
--
--   1. Enable pg_cron and pg_net extensions
--      (Dashboard > Database > Extensions).
--
--   2. Store the secret API key in Vault (skip if already done for 023):
--
--        SELECT vault.create_secret(
--          '<paste secret key here>',
--          'service_role_key'
--        );
--
--      Use the key from Dashboard > Project Settings > API Keys >
--      "Publishable and secret API keys" tab > secret key.
--      (NOT the legacy service_role key on the other tab.)

create or replace function public.invoke_daily_post()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _key text;
begin
  select decrypted_secret into _key
    from vault.decrypted_secrets
    where name = 'service_role_key'
    limit 1;

  if _key is null then
    raise warning 'daily-post: service_role_key not found in vault — skipping';
    return;
  end if;

  perform net.http_post(
    url := 'https://bdajjvzqelklyklnxrgg.supabase.co/functions/v1/daily-post',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _key
    ),
    body := '{}'::jsonb
  );
end;
$$;

select cron.schedule(
  'daily-instagram-post',
  '0 13 * * *',
  $$ select public.invoke_daily_post(); $$
);
