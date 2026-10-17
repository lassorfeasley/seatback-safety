-- Keep the Instagram queue topped up from banked social crops.
--
-- seatback.fill_social_queue(start, end) schedules one post per empty day in
-- the range (days that already have a draft/scheduled/posted post are left
-- alone). Crop choice mirrors the old client-side "Fill Schedule" spreading:
-- never-used crops first, then avoid repeating a crop, card, airline, or
-- decade within 5 days of the slot, then least-recently-used.
--
-- seatback.top_up_social_queue() fills the next N days and is run daily by
-- pg_cron, so the queue never runs dry as long as there are banked crops.
-- Pure SQL: no Edge Function, Vault key, or project URL involved.

create or replace function seatback.fill_social_queue(
  p_start date,
  p_end date,
  p_post_time time default '09:00',
  p_tz text default 'America/New_York'
)
returns integer
language plpgsql
set search_path = seatback, public
as $$
declare
  _day date;
  _slot timestamptz;
  _crop record;
  _filled integer := 0;
begin
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'end date must be on or after start date';
  end if;
  if p_end - p_start > 366 then
    raise exception 'date range is limited to one year';
  end if;

  -- Serialize with concurrent runs (cron + manual) so a day is never double-booked.
  perform pg_advisory_xact_lock(hashtext('seatback.fill_social_queue'));

  for _day in select generate_series(p_start, p_end, interval '1 day')::date loop
    _slot := (_day + p_post_time) at time zone p_tz;

    continue when _slot <= now();
    continue when exists (
      select 1 from social_posts p
      where p.status <> 'failed'
        and p.scheduled_at is not null
        and (p.scheduled_at at time zone p_tz)::date = _day
    );

    select
      c.id,
      c.card_id,
      c.panel_id,
      c.crop_image_path,
      'Artwork selected from'
        || coalesce(' ✈️ ' || a.name, '')
        || coalesce(' ' || ac.label, '')
        || ' #SeatbackSafety card'
        || coalesce(' c. ' || sc.published_year, '') as caption
    into _crop
    from social_crops c
    join safety_cards sc on sc.id = c.card_id
    left join airlines a on a.id = sc.airline_id
    left join lateral (
      select string_agg(l.label, ', ' order by ca.sort_order) as label
      from card_aircraft ca
      left join aircraft_variants v on v.id = ca.aircraft_variant_id
      left join aircraft_models m on m.id = coalesce(v.model_id, ca.aircraft_model_id)
      left join aircraft_manufacturers mf on mf.id = m.manufacturer_id
      cross join lateral (
        select nullif(concat_ws(' ', mf.name, m.name, v.name), '') as label
      ) l
      where ca.card_id = c.card_id
    ) ac on true
    left join lateral (
      select max(p.scheduled_at) as last_used
      from social_posts p
      where p.social_crop_id = c.id and p.status <> 'failed'
    ) u on true
    left join lateral (
      select coalesce(sum(
          case when n.social_crop_id = c.id then 100 else 0 end
        + case when n.card_id = c.card_id then 10 else 0 end
        + case when n.airline_id = sc.airline_id then 6 - n.dist else 0 end
        + case when n.published_year / 10 = sc.published_year / 10 then (6 - n.dist) * 0.5 else 0 end
      ), 0) as penalty
      from (
        select p.social_crop_id, p.card_id, nsc.airline_id, nsc.published_year,
               abs((p.scheduled_at at time zone p_tz)::date - _day) as dist
        from social_posts p
        join safety_cards nsc on nsc.id = p.card_id
        where p.status <> 'failed'
          and p.scheduled_at between _slot - interval '6 days' and _slot + interval '6 days'
      ) n
      where n.dist between 1 and 5
    ) near on true
    order by (u.last_used is not null), near.penalty, u.last_used nulls first, random()
    limit 1;

    exit when not found;

    insert into social_posts (
      card_id, panel_id, social_crop_id, crop_image_path,
      crop_x_pct, crop_y_pct, crop_size_pct,
      caption, status, scheduled_at
    ) values (
      _crop.card_id, _crop.panel_id, _crop.id, _crop.crop_image_path,
      0, 0, 1,
      _crop.caption, 'scheduled', _slot
    );
    _filled := _filled + 1;
  end loop;

  return _filled;
end;
$$;

create or replace function seatback.top_up_social_queue(p_days integer default 14)
returns integer
language sql
set search_path = seatback, public
as $$
  select seatback.fill_social_queue(
    (now() at time zone 'America/New_York')::date,
    (now() at time zone 'America/New_York')::date + greatest(p_days, 1) - 1
  );
$$;

revoke all on function seatback.fill_social_queue(date, date, time, text) from public, anon;
revoke all on function seatback.top_up_social_queue(integer) from public, anon;
grant execute on function seatback.fill_social_queue(date, date, time, text) to authenticated, service_role;
grant execute on function seatback.top_up_social_queue(integer) to authenticated, service_role;

-- Daily at 08:00 UTC (3–4 AM ET), well before the 9 AM ET post slot.
select cron.schedule(
  'seatback-top-up-social-queue',
  '0 8 * * *',
  $$ select seatback.top_up_social_queue(14); $$
);

select seatback.top_up_social_queue(14);
