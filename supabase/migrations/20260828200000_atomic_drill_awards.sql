-- Close the drill-award race: a completed drill and all of its XP, streak, and
-- achievement awards become one atomic transaction, mirroring
-- record_test_award (20260827220000). Previously awardDrill() in
-- lib/gamification/state.ts did this as five separate, non-transactional
-- calls (insert drill_attempts, insert xp_events, rpc add_xp, read+update
-- users for the streak, read+insert user_achievements) — a crash or network
-- failure between any two steps left the student's XP/streak permanently out
-- of sync with their recorded attempt, and was NOT repairable by retry
-- because the drill_attempts row (checked for idempotency) had already been
-- written.

create or replace function public.record_drill_award(
  p_email text,
  p_drill_slug text,
  p_correct integer,
  p_total integer,
  p_score integer,
  p_xp_amount integer,
  p_client_token text,
  p_achievement_rules jsonb
)
returns table(
  attempt_id text,
  inserted boolean,
  xp_awarded integer,
  new_achievement_ids text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_now timestamptz := now();
  v_today date := (v_now at time zone 'UTC')::date;
  v_today_start timestamptz := date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC';
  v_user public.users%rowtype;
  v_existing_attempt_id text;
  v_attempt_id text;
  v_xp integer;
  v_level integer := 1;
  v_level_floor integer := 0;
  v_level_step integer;
  v_streak_current integer;
  v_streak_longest integer;
  v_last_active date;
  v_drills_today bigint;
  v_tests_today bigint;
  v_goal_met boolean;
  v_drills_completed bigint;
  v_tests_completed bigint;
  v_daily_goals_hit bigint;
  v_best_test_score integer;
  v_perfect_drills bigint;
  v_new_achievement_ids text[] := array[]::text[];
begin
  if v_email = '' or length(v_email) > 254 then
    raise exception 'A valid account email is required';
  end if;
  if p_drill_slug is null or length(p_drill_slug) not between 1 and 160 then
    raise exception 'A valid drill slug is required';
  end if;
  if p_correct is not null and p_correct < 0 then
    raise exception 'Correct count cannot be negative';
  end if;
  if p_total is not null and p_total < 0 then
    raise exception 'Total count cannot be negative';
  end if;
  if p_score is not null and p_score not between 0 and 100 then
    raise exception 'Drill score is outside the supported range';
  end if;
  if p_xp_amount is null or p_xp_amount not between 0 and 100 then
    raise exception 'Drill XP amount is outside the supported range';
  end if;
  if p_client_token is not null
    and p_client_token !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$' then
    raise exception 'The drill idempotency token is invalid';
  end if;
  if jsonb_typeof(p_achievement_rules) is distinct from 'array' then
    raise exception 'Achievement rules must be an array';
  end if;
  if jsonb_array_length(p_achievement_rules) > 200 then
    raise exception 'Achievement rules must be a bounded array';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_achievement_rules) rule(value)
    where jsonb_typeof(rule.value) is distinct from 'object'
      or coalesce(rule.value ->> 'id', '') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'
      or coalesce(rule.value ->> 'metric', '') not in (
        'xp', 'level', 'streakCurrent', 'streakLongest', 'drillsCompleted',
        'testsCompleted', 'dailyGoalsHit', 'bestTestScore', 'perfectDrills'
      )
      or case
        when jsonb_typeof(rule.value -> 'threshold') = 'number' then
          (rule.value ->> 'threshold')::numeric <> trunc((rule.value ->> 'threshold')::numeric)
          or (rule.value ->> 'threshold')::numeric not between 0 and 2147483647
        else true
      end
  ) then
    raise exception 'Achievement rules contain an invalid rule';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_achievement_rules) rule(value)
    group by rule.value ->> 'id'
    having count(*) > 1
  ) then
    raise exception 'Achievement rule ids must be unique';
  end if;

  select account.*
    into v_user
    from public.users account
   where account.email = v_email
   for update;
  if not found or v_user.account_status <> 'active' then
    raise exception 'The active student account was not found';
  end if;

  if p_client_token is not null then
    select attempt.id
      into v_existing_attempt_id
      from public.drill_attempts attempt
     where attempt.email = v_email
       and attempt.client_token = p_client_token;
    if v_existing_attempt_id is not null then
      return query
        select v_existing_attempt_id, false, 0, array[]::text[];
      return;
    end if;
  end if;

  insert into public.drill_attempts (
    email, drill_slug, correct, total, score, xp_awarded, client_token, created_at
  ) values (
    v_email, p_drill_slug, p_correct, p_total, p_score, p_xp_amount, p_client_token, v_now
  )
  returning id into v_attempt_id;

  insert into public.xp_events(email, amount, reason, ref, created_at)
  values (v_email, p_xp_amount, 'drill', p_drill_slug, v_now);

  -- A streak day only credits once the daily goal is met (matches the prior
  -- creditStreak() semantics) — not on every single drill rep.
  select count(*) into v_drills_today
    from public.drill_attempts attempt
   where attempt.email = v_email and attempt.created_at >= v_today_start;
  select count(*) into v_tests_today
    from public.test_attempts attempt
   where attempt.email = v_email and attempt.created_at >= v_today_start;
  v_goal_met := v_drills_today >= v_user.daily_goal_target or v_tests_today >= 1;

  if v_user.last_active_date = v_today then
    v_streak_current := v_user.streak_current;
    v_streak_longest := v_user.streak_longest;
    v_last_active := v_user.last_active_date;
  elsif v_goal_met then
    v_streak_current := case when v_user.last_active_date = v_today - 1
      then v_user.streak_current + 1 else 1 end;
    v_streak_longest := greatest(v_user.streak_longest, v_streak_current);
    v_last_active := v_today;
  else
    v_streak_current := v_user.streak_current;
    v_streak_longest := v_user.streak_longest;
    v_last_active := v_user.last_active_date;
  end if;

  update public.users account
     set xp = account.xp + p_xp_amount,
         streak_current = v_streak_current,
         streak_longest = v_streak_longest,
         last_active_date = v_last_active,
         updated_at = v_now
   where account.email = v_email
  returning account.xp into v_xp;

  while true loop
    v_level_step := 100 + 25 * (v_level - 1);
    exit when v_xp < v_level_floor + v_level_step;
    v_level_floor := v_level_floor + v_level_step;
    v_level := v_level + 1;
  end loop;

  select count(*) into v_drills_completed
    from public.drill_attempts attempt
   where attempt.email = v_email;
  select count(*) into v_tests_completed
    from public.test_attempts attempt
   where attempt.email = v_email;
  select count(*) into v_perfect_drills
    from public.drill_attempts attempt
   where attempt.email = v_email and attempt.score >= 100;
  select coalesce(max(attempt.total_score), 0) into v_best_test_score
    from public.test_attempts attempt
   where attempt.email = v_email;
  select count(*) into v_daily_goals_hit
    from (
      select (attempt.created_at at time zone 'UTC')::date
      from public.drill_attempts attempt
      where attempt.email = v_email
      group by (attempt.created_at at time zone 'UTC')::date
      having count(*) >= v_user.daily_goal_target
    ) hit_days;

  with rules as (
    select
      rule.value ->> 'id' as id,
      rule.value ->> 'metric' as metric,
      (rule.value ->> 'threshold')::integer as threshold,
      rule.ordinality
    from jsonb_array_elements(p_achievement_rules) with ordinality rule(value, ordinality)
  ), eligible as (
    select rules.id, rules.ordinality
    from rules
    where case rules.metric
      when 'xp' then v_xp >= rules.threshold
      when 'level' then v_level >= rules.threshold
      when 'streakCurrent' then v_streak_current >= rules.threshold
      when 'streakLongest' then v_streak_longest >= rules.threshold
      when 'drillsCompleted' then v_drills_completed >= rules.threshold
      when 'testsCompleted' then v_tests_completed >= rules.threshold
      when 'dailyGoalsHit' then v_daily_goals_hit >= rules.threshold
      when 'bestTestScore' then v_best_test_score >= rules.threshold
      when 'perfectDrills' then v_perfect_drills >= rules.threshold
      else false
    end
  ), newly_inserted as (
    insert into public.user_achievements(email, achievement_id, unlocked_at)
    select v_email, eligible.id, v_now
    from eligible
    order by eligible.ordinality
    on conflict (email, achievement_id) do nothing
    returning achievement_id
  )
  select coalesce(
    array_agg(newly_inserted.achievement_id order by rules.ordinality),
    array[]::text[]
  )
    into v_new_achievement_ids
    from newly_inserted
    join rules on rules.id = newly_inserted.achievement_id;

  return query
    select v_attempt_id, true, p_xp_amount, v_new_achievement_ids;
end;
$$;

revoke all on function public.record_drill_award(
  text, text, integer, integer, integer, integer, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_drill_award(
  text, text, integer, integer, integer, integer, text, jsonb
) to service_role;

comment on function public.record_drill_award(
  text, text, integer, integer, integer, integer, text, jsonb
) is 'Atomically inserts one idempotent drill attempt and applies its XP, streak, and achievement awards.';
