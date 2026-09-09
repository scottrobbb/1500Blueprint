create table public.dense_reading_sessions (
  id uuid primary key default gen_random_uuid(),
  email text not null references public.users(email) on delete cascade,
  mode text not null check (mode in ('guided', 'regular')),
  status text not null default 'active' check (status in ('active', 'completed')),
  questions jsonb not null check (jsonb_typeof(questions) = 'array'),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  results jsonb,
  question_count integer not null check (question_count between 1 and 11),
  correct_count integer check (correct_count between 0 and question_count),
  elapsed_ms bigint not null default 0 check (elapsed_ms between 0 and 604800000),
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (jsonb_array_length(questions) = question_count),
  check (octet_length(state::text) <= 524288),
  check ((status = 'active' and results is null and completed_at is null)
    or (status = 'completed' and results is not null and completed_at is not null))
);
create unique index dense_reading_one_active on public.dense_reading_sessions(email) where status = 'active';
create index dense_reading_history on public.dense_reading_sessions(email, created_at desc);
alter table public.dense_reading_sessions enable row level security;
revoke all on public.dense_reading_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.dense_reading_sessions to service_role;

-- The attempt, XP, streak, and result become durable together. A retry after
-- completion returns before quota checks or awards, even at the allowance edge.
create function public.complete_dense_reading_session(
  p_email text, p_id uuid, p_revision integer, p_state jsonb, p_results jsonb,
  p_correct integer, p_xp integer, p_rules jsonb, p_limit integer, p_monthly boolean
) returns void language plpgsql security invoker set search_path = public as $$
declare
  v_session public.dense_reading_sessions%rowtype;
  v_count bigint;
  v_actual_correct integer;
begin
  perform 1 from public.users where email = p_email and account_status = 'active' for update;
  if not found then raise exception 'Active account required'; end if;
  select * into v_session from public.dense_reading_sessions where id = p_id and email = p_email for update;
  if not found then raise exception 'Session not found'; end if;
  if v_session.status = 'completed' then return; end if;
  if v_session.revision <> p_revision then raise exception 'Session revision conflict'; end if;
  if p_limit is not null then
    select count(*) into v_count from public.drill_attempts
      where email = p_email and created_at >= date_trunc(case when p_monthly then 'month' else 'day' end, now() at time zone 'UTC') at time zone 'UTC';
    if v_count >= p_limit then raise exception 'Drill limit reached'; end if;
  end if;
  if jsonb_typeof(p_state -> 'progress') is distinct from 'array'
    or jsonb_array_length(p_state -> 'progress') <> v_session.question_count
    or jsonb_typeof(p_results) is distinct from 'array'
    or jsonb_array_length(p_results) <> v_session.question_count then
    raise exception 'Invalid reading completion';
  end if;
  select count(*) into v_actual_correct
    from jsonb_array_elements(v_session.questions) with ordinality q(value, position)
    where q.value ->> 'correct' = p_state -> 'progress' -> ((q.position - 1)::integer) ->> 'answer';
  if v_actual_correct <> p_correct then raise exception 'Invalid reading score'; end if;
  perform public.record_drill_award(p_email, 'dense-reading', p_correct, v_session.question_count,
    round(p_correct * 100.0 / v_session.question_count)::integer, p_xp,
    'dense-reading:' || p_id::text, p_rules);
  update public.dense_reading_sessions set state = p_state, results = p_results,
    correct_count = p_correct, elapsed_ms = (p_state ->> 'elapsedMs')::bigint,
    status = 'completed', completed_at = now(), updated_at = now(), revision = revision + 1
    where id = p_id;
end;
$$;
revoke all on function public.complete_dense_reading_session(text, uuid, integer, jsonb, jsonb, integer, integer, jsonb, integer, boolean) from public, anon, authenticated;
grant execute on function public.complete_dense_reading_session(text, uuid, integer, jsonb, jsonb, integer, integer, jsonb, integer, boolean) to service_role;

insert into public.drills(slug, title, category, accent, uses_ai, ai_role, answer_types, sort, status)
values ('dense-reading', 'Dense Reading', 'Reading', 'brand', false, 'none', array['mc_single'], 3, 'published')
on conflict (slug) do nothing;
notify pgrst, 'reload schema';
