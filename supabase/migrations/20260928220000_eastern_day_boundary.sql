-- Students' days now run midnight to midnight Eastern instead of UTC. UTC
-- rolled the day over at 8pm Eastern, so evening work counted toward the next
-- day: streaks, the daily drill limit, and daily goals were all shifted.
--
-- Each function below is copied unchanged from its latest definition except
-- that 'UTC' becomes 'America/New_York'. The app's day math
-- (lib/gamification/engine.ts) uses the same zone. create or replace keeps the
-- existing grants. The one other change: the same-day streak checks accept a
-- last_active_date later than today, since dates recorded under UTC in the
-- evening sit a day ahead of Eastern and would otherwise reset streaks.

-- From 20260828200000_atomic_drill_awards.sql
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
  v_today date := (v_now at time zone 'America/New_York')::date;
  v_today_start timestamptz := date_trunc('day', v_now at time zone 'America/New_York') at time zone 'America/New_York';
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

  -- >= because a date saved under UTC can be a day ahead of Eastern today.
  if v_user.last_active_date >= v_today then
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
      select (attempt.created_at at time zone 'America/New_York')::date
      from public.drill_attempts attempt
      where attempt.email = v_email
      group by (attempt.created_at at time zone 'America/New_York')::date
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

-- From 20260827220000_atomic_test_awards_and_checkout_intents.sql
create or replace function public.record_test_award(
  p_email text,
  p_test_slug text,
  p_total_score integer,
  p_rw_score integer,
  p_math_score integer,
  p_answers jsonb,
  p_routed jsonb,
  p_per_question_time jsonb,
  p_test_snapshot jsonb,
  p_test_title text,
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
  v_today date := (v_now at time zone 'America/New_York')::date;
  v_user public.users%rowtype;
  v_existing_attempt_id text;
  v_attempt_id text;
  v_xp_awarded integer;
  v_xp integer;
  v_level integer := 1;
  v_level_floor integer := 0;
  v_level_step integer;
  v_streak_current integer;
  v_streak_longest integer;
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
  if p_test_slug is null or length(p_test_slug) not between 1 and 160 then
    raise exception 'A valid test slug is required';
  end if;
  if p_total_score is null or p_total_score not between 0 and 1600
    or (p_rw_score is not null and p_rw_score not between 0 and 800)
    or (p_math_score is not null and p_math_score not between 0 and 800) then
    raise exception 'Practice-test scores are outside the supported range';
  end if;
  if p_client_token is null
    or p_client_token !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$' then
    raise exception 'A valid test idempotency token is required';
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

  select attempt.id
    into v_existing_attempt_id
    from public.test_attempts attempt
   where attempt.email = v_email
     and attempt.client_token = p_client_token;
  if v_existing_attempt_id is not null then
    return query
      select v_existing_attempt_id, false, 0, array[]::text[];
    return;
  end if;

  v_xp_awarded := 200 + round((least(1600, greatest(0, p_total_score))::numeric / 1600) * 300)::integer;

  insert into public.test_attempts (
    email,
    test_slug,
    total_score,
    rw_score,
    math_score,
    xp_awarded,
    answers,
    routed,
    per_question_time,
    completed_at,
    client_token,
    test_snapshot,
    test_title,
    created_at
  ) values (
    v_email,
    p_test_slug,
    p_total_score,
    p_rw_score,
    p_math_score,
    v_xp_awarded,
    p_answers,
    p_routed,
    p_per_question_time,
    v_now,
    p_client_token,
    p_test_snapshot,
    p_test_title,
    v_now
  )
  returning id into v_attempt_id;

  insert into public.xp_events(email, amount, reason, ref, created_at)
  values (v_email, v_xp_awarded, 'test', p_test_slug, v_now);

  -- >= because a date saved under UTC can be a day ahead of Eastern today.
  if v_user.last_active_date >= v_today then
    v_streak_current := v_user.streak_current;
    v_streak_longest := v_user.streak_longest;
  elsif v_user.last_active_date = v_today - 1 then
    v_streak_current := v_user.streak_current + 1;
    v_streak_longest := greatest(v_user.streak_longest, v_streak_current);
  else
    v_streak_current := 1;
    v_streak_longest := greatest(v_user.streak_longest, 1);
  end if;

  update public.users account
     set xp = account.xp + v_xp_awarded,
         streak_current = v_streak_current,
         streak_longest = v_streak_longest,
         last_active_date = v_today,
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
      select (attempt.created_at at time zone 'America/New_York')::date
      from public.drill_attempts attempt
      where attempt.email = v_email
      group by (attempt.created_at at time zone 'America/New_York')::date
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
    select v_attempt_id, true, v_xp_awarded, v_new_achievement_ids;
end;
$$;

-- From 20260909170000_activity_awards.sql
create or replace function public.record_activity_award(
  p_email text,
  p_reason text,
  p_ref text,
  p_xp_amount integer,
  p_achievement_rules jsonb
)
returns table(
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
  v_user public.users%rowtype;
  v_xp integer;
  v_level integer := 1;
  v_level_floor integer := 0;
  v_level_step integer;
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
  if p_reason is null or p_reason not in ('question_bank', 'module_practice') then
    raise exception 'Unsupported activity award reason';
  end if;
  if p_ref is null or length(p_ref) not between 1 and 160 then
    raise exception 'A valid activity reference is required';
  end if;
  -- Well below the drill ceiling: nothing on these surfaces is worth a drill.
  if p_xp_amount is null or p_xp_amount not between 0 and 100 then
    raise exception 'Activity XP amount is outside the supported range';
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

  -- Locking the account row serialises concurrent awards for one student, so
  -- the guard below cannot be passed twice for the same ref.
  select account.*
    into v_user
    from public.users account
   where account.email = v_email
   for update;
  if not found or v_user.account_status <> 'active' then
    raise exception 'The active student account was not found';
  end if;

  if exists (
    select 1
    from public.xp_events event
   where event.email = v_email
     and event.reason = p_reason
     and event.ref = p_ref
  ) then
    return query select false, 0, array[]::text[];
    return;
  end if;

  insert into public.xp_events(email, amount, reason, ref, created_at)
  values (v_email, p_xp_amount, p_reason, p_ref, v_now);

  update public.users account
     set xp = account.xp + p_xp_amount,
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
      select (attempt.created_at at time zone 'America/New_York')::date
      from public.drill_attempts attempt
      where attempt.email = v_email
      group by (attempt.created_at at time zone 'America/New_York')::date
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
      when 'streakCurrent' then v_user.streak_current >= rules.threshold
      when 'streakLongest' then v_user.streak_longest >= rules.threshold
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

  return query select true, p_xp_amount, v_new_achievement_ids;
end;
$$;
