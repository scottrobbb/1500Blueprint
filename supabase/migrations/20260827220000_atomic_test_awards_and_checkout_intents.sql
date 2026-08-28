-- Close two cross-request races:
--   1. A completed practice test and all of its awards are one transaction.
--   2. A billing account owns one durable Checkout reservation per Stripe mode.

drop index if exists public.test_attempts_client_token_key;
create unique index test_attempts_client_token_key
  on public.test_attempts(email, client_token)
  where client_token is not null;

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
  v_today date := (v_now at time zone 'UTC')::date;
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

  if v_user.last_active_date = v_today then
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
    select v_attempt_id, true, v_xp_awarded, v_new_achievement_ids;
end;
$$;

revoke all on function public.record_test_award(
  text, text, integer, integer, integer, jsonb, jsonb, jsonb, jsonb, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_test_award(
  text, text, integer, integer, integer, jsonb, jsonb, jsonb, jsonb, text, text, jsonb
) to service_role;

comment on function public.record_test_award(
  text, text, integer, integer, integer, jsonb, jsonb, jsonb, jsonb, text, text, jsonb
) is 'Atomically inserts one idempotent test attempt and applies its XP, streak, and achievement awards.';

create table if not exists public.billing_checkout_intents (
  user_id text not null references public.users(id) on delete cascade,
  livemode boolean not null,
  reservation_id uuid not null default gen_random_uuid(),
  request_token text not null,
  plan_code text not null check (plan_code in ('core', 'max')),
  billing_cadence text not null check (billing_cadence in ('monthly', 'three_month')),
  status text not null default 'creating' check (status in ('creating', 'ready', 'completed', 'expired')),
  lease_expires_at timestamptz not null,
  checkout_expires_at timestamptz not null,
  stripe_checkout_session_id text,
  stripe_checkout_session_url text,
  attempts integer not null default 1 check (attempts > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, livemode),
  unique (reservation_id),
  check (checkout_expires_at > created_at),
  check (
    status <> 'ready'
    or (stripe_checkout_session_id is not null and stripe_checkout_session_url is not null)
  )
);

create unique index if not exists billing_checkout_intents_session_idx
  on public.billing_checkout_intents(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

alter table public.billing_checkout_intents enable row level security;
revoke all on table public.billing_checkout_intents from public, anon, authenticated;
grant select, insert, update, delete on table public.billing_checkout_intents to service_role;

create or replace function public.claim_billing_checkout_intent(
  p_user_id text,
  p_livemode boolean,
  p_plan_code text,
  p_billing_cadence text,
  p_request_token text
)
returns table(
  decision text,
  reservation_id uuid,
  checkout_expires_at timestamptz,
  stripe_checkout_session_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_intent public.billing_checkout_intents%rowtype;
begin
  if p_user_id is null or p_user_id = '' or length(p_user_id) > 128 then
    raise exception 'A valid billing account is required';
  end if;
  if p_plan_code not in ('core', 'max')
    or p_billing_cadence not in ('monthly', 'three_month') then
    raise exception 'The Checkout offer is invalid';
  end if;
  if p_request_token is null
    or p_request_token !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,99}$' then
    raise exception 'A valid Checkout request token is required';
  end if;
  if not exists (
    select 1 from public.users account
    where account.id = p_user_id and account.account_status = 'active'
  ) then
    raise exception 'The active billing account was not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id || ':' || p_livemode::text, 1500));

  select intent.*
    into v_intent
    from public.billing_checkout_intents intent
   where intent.user_id = p_user_id and intent.livemode = p_livemode
   for update;

  if not found then
    insert into public.billing_checkout_intents (
      user_id, livemode, request_token, plan_code, billing_cadence,
      status, lease_expires_at, checkout_expires_at
    ) values (
      p_user_id, p_livemode, p_request_token, p_plan_code, p_billing_cadence,
      'creating', v_now + interval '5 minutes', v_now + interval '1 hour'
    )
    returning * into v_intent;
    decision := 'claimed';
  elsif v_intent.status in ('completed', 'expired') or v_intent.checkout_expires_at <= v_now then
    update public.billing_checkout_intents intent
       set reservation_id = gen_random_uuid(),
           request_token = p_request_token,
           plan_code = p_plan_code,
           billing_cadence = p_billing_cadence,
           status = 'creating',
           lease_expires_at = v_now + interval '5 minutes',
           checkout_expires_at = v_now + interval '1 hour',
           stripe_checkout_session_id = null,
           stripe_checkout_session_url = null,
           attempts = intent.attempts + 1,
           updated_at = v_now
     where intent.user_id = p_user_id and intent.livemode = p_livemode
    returning intent.* into v_intent;
    decision := 'claimed';
  elsif v_intent.plan_code <> p_plan_code or v_intent.billing_cadence <> p_billing_cadence then
    decision := 'busy';
  elsif v_intent.status = 'ready' and v_intent.stripe_checkout_session_url is not null then
    decision := 'ready';
  elsif v_intent.status = 'creating' and v_intent.lease_expires_at <= v_now then
    -- Preserve reservation_id: every recovery uses the same Stripe idempotency
    -- key and identical expires_at, even if the first network response was lost.
    update public.billing_checkout_intents intent
       set request_token = p_request_token,
           lease_expires_at = v_now + interval '5 minutes',
           attempts = intent.attempts + 1,
           updated_at = v_now
     where intent.user_id = p_user_id and intent.livemode = p_livemode
    returning intent.* into v_intent;
    decision := 'claimed';
  else
    decision := 'busy';
  end if;

  reservation_id := v_intent.reservation_id;
  checkout_expires_at := v_intent.checkout_expires_at;
  stripe_checkout_session_url := case when decision = 'ready'
    then v_intent.stripe_checkout_session_url else null end;
  return next;
end;
$$;

create or replace function public.store_billing_checkout_session(
  p_user_id text,
  p_livemode boolean,
  p_reservation_id uuid,
  p_stripe_checkout_session_id text,
  p_stripe_checkout_session_url text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stored boolean;
begin
  if p_stripe_checkout_session_id is null
    or p_stripe_checkout_session_id !~ '^cs_[A-Za-z0-9_]{8,200}$'
    or p_stripe_checkout_session_url is null
    or length(p_stripe_checkout_session_url) not between 1 and 4096 then
    raise exception 'The Stripe Checkout session is invalid';
  end if;
  update public.billing_checkout_intents intent
     set status = 'ready',
         stripe_checkout_session_id = p_stripe_checkout_session_id,
         stripe_checkout_session_url = p_stripe_checkout_session_url,
         updated_at = now()
   where intent.user_id = p_user_id
     and intent.livemode = p_livemode
     and intent.reservation_id = p_reservation_id
     and intent.status = 'creating';
  v_stored := found;
  return v_stored;
end;
$$;

create or replace function public.mark_billing_checkout_session(
  p_stripe_checkout_session_id text,
  p_status text,
  p_reservation_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marked boolean;
begin
  if p_status not in ('completed', 'expired') then
    raise exception 'The Checkout terminal state is invalid';
  end if;
  update public.billing_checkout_intents intent
     set status = p_status,
         stripe_checkout_session_id = coalesce(intent.stripe_checkout_session_id, p_stripe_checkout_session_id),
         stripe_checkout_session_url = case
           when p_status = 'expired' then null
           else intent.stripe_checkout_session_url
         end,
         updated_at = now()
   where (
       intent.stripe_checkout_session_id = p_stripe_checkout_session_id
       or (p_reservation_id is not null and intent.reservation_id = p_reservation_id)
     )
     and intent.status <> 'completed';
  v_marked := found;
  return v_marked;
end;
$$;

revoke all on function public.claim_billing_checkout_intent(text, boolean, text, text, text)
  from public, anon, authenticated;
revoke all on function public.store_billing_checkout_session(text, boolean, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.mark_billing_checkout_session(text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_billing_checkout_intent(text, boolean, text, text, text)
  to service_role;
grant execute on function public.store_billing_checkout_session(text, boolean, uuid, text, text)
  to service_role;
grant execute on function public.mark_billing_checkout_session(text, text, uuid)
  to service_role;

comment on table public.billing_checkout_intents is
  'One durable Stripe Checkout reservation per billing account and Stripe mode; service-role only.';
comment on column public.billing_checkout_intents.reservation_id is
  'Stable identity used to derive the Stripe idempotency key across creation-lease recovery.';
