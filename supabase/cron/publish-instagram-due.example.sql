-- Example: call publish-instagram on a schedule (Supabase Cron + pg_net).
-- 1. Enable extensions and Cron per https://supabase.com/docs/guides/functions/schedule-functions
-- 2. Store YOUR_SERVICE_ROLE_KEY in Supabase Vault; reference it from SQL if your project supports it.
-- 3. Replace YOUR_PROJECT_REF and the Bearer token (never commit real secrets).

create or replace function public.invoke_publish_instagram_due()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/publish-instagram',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := jsonb_build_object('mode', 'due')
  );
end;
$$;

-- Run every 5 minutes (standard cron):
-- select cron.schedule(
--   'publish-instagram-due',
--   '*/5 * * * *',
--   $$ select public.invoke_publish_instagram_due(); $$
-- );
