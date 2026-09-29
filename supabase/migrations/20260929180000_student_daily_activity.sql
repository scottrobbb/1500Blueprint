-- Active time on the site, one row per student per Eastern day. The browser
-- reports seconds only while a student page is visible and in use (see
-- components/activity/ActivityTracker.tsx); idle and background tabs add
-- nothing. Admins read it on the student detail page.
create table public.student_daily_activity (
  email text not null references public.users(email) on delete cascade,
  day date not null,
  active_seconds integer not null default 0 check (active_seconds between 0 and 86400),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (email, day)
);
alter table public.student_daily_activity enable row level security;
revoke all on public.student_daily_activity from public, anon, authenticated;
grant select, insert, update, delete on public.student_daily_activity to service_role;

-- Adds reported seconds to today's row. A report can never add more time than
-- has passed since the row was last touched (plus a little slack for clock
-- and network jitter), so a replayed or forged request cannot inflate the total.
create function public.record_active_time(p_email text, p_seconds integer)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_now timestamptz := now();
  v_day date := (v_now at time zone 'America/New_York')::date;
  v_seconds integer := least(greatest(coalesce(p_seconds, 0), 0), 120);
begin
  if v_seconds = 0 then return; end if;
  insert into public.student_daily_activity as activity (email, day, active_seconds, first_seen_at, last_seen_at)
  values (p_email, v_day, v_seconds, v_now, v_now)
  on conflict (email, day) do update
    set active_seconds = least(
          86400,
          activity.active_seconds + least(
            excluded.active_seconds,
            greatest(0, ceil(extract(epoch from v_now - activity.last_seen_at))::integer + 15)
          )
        ),
        last_seen_at = v_now;
end;
$$;
revoke all on function public.record_active_time(text, integer) from public, anon, authenticated;
grant execute on function public.record_active_time(text, integer) to service_role;
