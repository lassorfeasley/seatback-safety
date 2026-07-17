-- Automatic Meta access token refresh.
--
-- The Meta long-lived token expires every ~60 days. This migration adds:
--   1. Vault accessors so Edge Functions can read/write the token
--      (secret name: 'meta_access_token').
--   2. A singleton status table for observability (when was the token last
--      refreshed, when does it expire, did the last refresh fail).
--   3. A weekly pg_cron job that calls the refresh-meta-token Edge Function.
--
-- One-time setup after applying (see docs/INSTAGRAM_AUTO_POST.md):
--   - supabase secrets set META_APP_ID="..." META_APP_SECRET="..."
--   - Seed a fresh long-lived token:
--       select public.set_meta_access_token('<token>');

-- ── 1. Status table (singleton row) ────────────────────────────────

create table if not exists meta_token_status (
  id boolean primary key default true check (id),
  refreshed_at timestamptz,
  expires_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table meta_token_status enable row level security;

create policy "Authenticated users can read meta_token_status"
  on meta_token_status for select
  to authenticated
  using (true);

grant select on meta_token_status to authenticated;
grant select, insert, update, delete on meta_token_status to service_role;

insert into meta_token_status (id) values (true)
on conflict (id) do nothing;

-- ── 2. Vault accessors (service_role only) ─────────────────────────

create or replace function public.get_meta_access_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _token text;
begin
  select decrypted_secret into _token
    from vault.decrypted_secrets
    where name = 'meta_access_token'
    limit 1;
  return _token;
end;
$$;

create or replace function public.set_meta_access_token(new_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
begin
  if new_token is null or length(new_token) = 0 then
    raise exception 'token must not be empty';
  end if;
  select id into _id from vault.secrets where name = 'meta_access_token' limit 1;
  if _id is null then
    perform vault.create_secret(new_token, 'meta_access_token');
  else
    perform vault.update_secret(_id, new_token);
  end if;
end;
$$;

revoke all on function public.get_meta_access_token() from public, anon, authenticated;
revoke all on function public.set_meta_access_token(text) from public, anon, authenticated;
grant execute on function public.get_meta_access_token() to service_role;
grant execute on function public.set_meta_access_token(text) to service_role;

-- ── 3. Weekly refresh cron ──────────────────────────────────────────
-- Same Vault-key pattern as publish-instagram-due (023).

create or replace function public.invoke_refresh_meta_token()
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
    raise warning 'refresh-meta-token: service_role_key not found in vault — skipping';
    return;
  end if;

  perform net.http_post(
    url := 'https://bdajjvzqelklyklnxrgg.supabase.co/functions/v1/refresh-meta-token',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _key
    ),
    body := '{}'::jsonb
  );
end;
$$;

-- Mondays 03:00 UTC. Each refresh yields a fresh ~60-day token, so weekly
-- leaves ~53 days of margin if a run fails.
select cron.schedule(
  'refresh-meta-token',
  '0 3 * * 1',
  $$ select public.invoke_refresh_meta_token(); $$
);
