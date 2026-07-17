-- Remove the daily-post automation: unsupervised auto-posting is no longer wanted.

-- Tolerant unschedule: the job may have already been removed via the dashboard.
do $$
begin
  perform cron.unschedule('daily-instagram-post');
exception when others then
  raise notice 'daily-instagram-post cron job not found — nothing to unschedule';
end;
$$;

drop function if exists public.invoke_daily_post();
