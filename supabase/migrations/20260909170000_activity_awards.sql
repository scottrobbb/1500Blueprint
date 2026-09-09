-- XP for the two surfaces that recorded work without ever paying for it: the
-- Question Bank (neither attempt route touched gamification) and the
-- single-module practice runner (saved the attempt and stopped). Full-length
-- tests already award through record_test_award and are untouched here.
--
-- Neither surface can go through record_drill_award: that writes a
-- drill_attempts row, which feeds the daily goal, the drillsCompleted and
-- perfectDrills achievements, and every drill analytic. A bank question is not
-- a drill rep. So this is a sibling that awards XP and achievements against
-- work already recorded elsewhere, and inserts no attempt row of its own.
--
-- Idempotency lives in xp_events rather than in a new table: one row per
-- (email, reason, ref) is both the ledger entry and the guard. For the bank,
-- ref is the question id, which is exactly "pays out once per question, ever".
-- For module practice, ref is the completion's client token, so a retried
-- submit re-uses the row it already wrote.
--
-- The streak is deliberately not advanced. A streak day is credited when the
-- daily goal is met, and the goal counts drill attempts and test attempts;
-- letting these two surfaces move it would change what a streak means without
-- anyone asking for that. They contribute XP, level, and achievements only.

-- xp_events predates this repo's migration history, so its reason column may
-- carry a CHECK listing only the reasons that existed then. Widen it rather
-- than fail at runtime on the first bank question. Re-added NOT VALID: new
-- rows are checked, existing rows are left alone, since this migration cannot
-- see what is already in the table.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'xp_events'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%reason%'
  loop
    execute format('alter table public.xp_events drop constraint %I', v_constraint.conname);
  end loop;
end $$;

alter table public.xp_events
  add constraint xp_events_reason_check
  check (reason in ('drill', 'test', 'question_bank', 'module_practice'))
  not valid;

-- The idempotency guard reads (email, reason, ref) on every award, so it needs
-- to be an index lookup rather than a scan of the student's whole XP history.
create index if not exists xp_events_email_reason_ref_idx
  on public.xp_events(email, reason, ref);

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

revoke all on function public.record_activity_award(
  text, text, text, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.record_activity_award(
  text, text, text, integer, jsonb
) to service_role;

comment on function public.record_activity_award(
  text, text, text, integer, jsonb
) is 'Atomically applies XP and achievement awards for work recorded elsewhere (Question Bank questions, practice modules). Idempotent on (email, reason, ref) via xp_events; does not advance the streak.';
