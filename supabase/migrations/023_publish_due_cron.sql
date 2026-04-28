-- Scheduled-post cron: fires publish-instagram in "due" mode every 5 minutes.
-- Picks up posts with status='scheduled' and scheduled_at <= now().
--
-- SETUP (one-time, run in Supabase SQL Editor):
--
--   1. Enable pg_cron and pg_net extensions
--      (Dashboard > Database > Extensions).
--
--   2. Store the secret API key in Vault so it is never hard-coded:
--
--        SELECT vault.create_secret(
--          '<paste secret key here>',
--          'service_role_key'
--        );
--
--      Use the key from Dashboard > Project Settings > API Keys >
--      "Publishable and secret API keys" tab > secret key.
--      (NOT the legacy service_role key on the other tab.)
--
--   3. Apply this migration (supabase db push) or paste the SQL below into
--      the SQL Editor.

create or replace function public.invoke_publish_instagram_due()
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
    raise warning 'publish-instagram-due: service_role_key not found in vault — skipping';
    return;
  end if;

  perform net.http_post(
    url := 'https://bdajjvzqelklyklnxrgg.supabase.co/functions/v1/publish-instagram',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _key
    ),
    body := jsonb_build_object('mode', 'due')
  );
end;
$$;

select cron.schedule(
  'publish-instagram-due',
  '*/5 * * * *',
  $$ select public.invoke_publish_instagram_due(); $$
);
