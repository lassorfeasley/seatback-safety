-- Remove the daily-post automation: unsupervised auto-posting is no longer wanted.

select cron.unschedule('daily-instagram-post');

drop function if exists public.invoke_daily_post();
