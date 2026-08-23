-- Durable, source-specific student progress.
--
-- Keep question events append-only so chronological history and answer totals do
-- not have to be inferred from drill_question_progress (which is intentionally
-- one mutable mastery row per question). Course and test additions make retries
-- idempotent and freeze the exact test form used for a completed score report.

create table if not exists public.drill_question_attempts (
  id           uuid primary key default gen_random_uuid(),
  email        text not null references public.users(email) on delete cascade,
  question_id  text not null references public.drill_questions(id) on delete restrict,
  drill_slug   text not null,
  source       text not null default 'drill' check (source in ('drill', 'question_bank')),
  correct      boolean not null,
  score        smallint check (score between 0 and 100),
  client_token text,
  attempted_at timestamptz not null default now()
);

create index if not exists drill_question_attempts_email_time_idx
  on public.drill_question_attempts(email, attempted_at desc);
create index if not exists drill_question_attempts_email_source_idx
  on public.drill_question_attempts(email, source, attempted_at desc);
create unique index if not exists drill_question_attempts_email_token_key
  on public.drill_question_attempts(email, client_token)
  where client_token is not null;

alter table public.drill_question_attempts enable row level security;
revoke all on table public.drill_question_attempts from public, anon, authenticated;
grant select, insert on table public.drill_question_attempts to service_role;

alter table public.course_practice_attempts
  add column if not exists client_token text;

-- Course history must outlive curriculum edits. Deleting used content is
-- intentionally rejected; admins can unpublish it without erasing progress.
alter table public.course_lesson_completions
  drop constraint if exists course_lesson_completions_lesson_id_fkey,
  add constraint course_lesson_completions_lesson_id_fkey
    foreign key (lesson_id) references public.course_lessons(id) on delete restrict;

alter table public.course_practice_attempts
  drop constraint if exists course_practice_attempts_lesson_id_fkey,
  add constraint course_practice_attempts_lesson_id_fkey
    foreign key (lesson_id) references public.course_lessons(id) on delete restrict,
  drop constraint if exists course_practice_attempts_block_id_fkey,
  add constraint course_practice_attempts_block_id_fkey
    foreign key (block_id) references public.course_lesson_blocks(id) on delete restrict;

create unique index if not exists course_practice_attempts_email_token_key
  on public.course_practice_attempts(email, client_token)
  where client_token is not null;

alter table public.test_attempts
  add column if not exists test_snapshot jsonb,
  add column if not exists test_title text;

alter table public.module_attempts
  add column if not exists module_snapshot jsonb;

-- Freeze the current relational form for attempts created before immutable
-- snapshots existed. This is the best available baseline and prevents the
-- first later CMS edit from rewriting every historical report.
create or replace function public._build_test_module_snapshot(p_module_id text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', m.id,
    'order', m."order",
    'variant', case when m."order" = 2 then m.variant else null end,
    'questions', coalesce((
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'id', q.id,
          'domain', coalesce(q.domain, ''),
          'skill', nullif(q.skill, ''),
          'difficulty', case when q.difficulty in ('easy', 'medium', 'hard') then q.difficulty else 'medium' end,
          'passage', q.passage,
          'figureUrl', q.figure_url,
          'prompt', q.prompt,
          'explanation', coalesce(q.explanation, ''),
          'type', case when q.type = 'grid' then 'grid' else 'mc' end,
          'acceptedAnswers', case when q.type = 'grid' then to_jsonb(q.accepted_answers) else null end,
          'choices', case when q.type <> 'grid' then coalesce((
            select jsonb_agg(jsonb_build_object('id', c.letter, 'text', c.text) order by c.letter)
            from public.choices c
            where c.question_id = q.id
          ), '[]'::jsonb) else null end,
          'correct', case when q.type <> 'grid' then coalesce(q.correct, 'A') else null end,
          'choiceExplanations', case when q.type <> 'grid' then (
            select jsonb_object_agg(c.letter, c.explanation)
            from public.choices c
            where c.question_id = q.id and c.explanation is not null
          ) else null end
        )) order by q.position
      )
      from public.questions q
      where q.module_id = m.id
    ), '[]'::jsonb)
  ))
  from public.modules m
  where m.id = p_module_id;
$$;

create or replace function public._build_test_snapshot(p_test_id text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', section_row.section_id,
        'name', section_row.section_name,
        'shortName', section_row.section_name,
        'minutesPerModule', section_row.minutes_per_module,
        'module1', public._build_test_module_snapshot(section_row.module_1_id),
        'module2', jsonb_build_object(
          'easy', public._build_test_module_snapshot(section_row.easy_id),
          'hard', public._build_test_module_snapshot(section_row.hard_id)
        )
      ) order by section_row.section_rank)
      from (
        select
          section_key.section_id,
          section_key.section_name,
          section_key.section_rank,
          module_1.minutes_per_module,
          module_1.id as module_1_id,
          easy.id as easy_id,
          hard.id as hard_id
        from (values
          ('rw'::text, 'Reading and Writing'::text, 1),
          ('math'::text, 'Math'::text, 2)
        ) as section_key(section_id, section_name, section_rank)
        join public.modules module_1
          on module_1.test_id = t.id
          and module_1.section = section_key.section_id
          and module_1."order" = 1
        join public.modules easy
          on easy.test_id = t.id
          and easy.section = section_key.section_id
          and easy."order" = 2
          and easy.variant = 'easy'
        join public.modules hard
          on hard.test_id = t.id
          and hard.section = section_key.section_id
          and hard."order" = 2
          and hard.variant = 'hard'
      ) section_row
    ), '[]'::jsonb),
    'routeThreshold', jsonb_build_object('rw', t.rw_threshold, 'math', t.math_threshold),
    'breakMinutes', t.break_minutes
  )
  from public.tests t
  where t.id = p_test_id;
$$;

create or replace function public._build_module_attempt_snapshot(p_test_id text, p_module_key text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'meta', jsonb_strip_nulls(jsonb_build_object(
      'key', p_module_key,
      'sectionId', m.section,
      'sectionName', case when m.section = 'rw' then 'Reading and Writing' else 'Math' end,
      'order', m."order",
      'variant', case when m."order" = 2 then m.variant else null end,
      'label', case
        when m."order" = 1 then 'Module 1'
        when m.variant = 'hard' then 'Module 2 · Hard'
        else 'Module 2 · Easy'
      end,
      'fullLabel', (case when m.section = 'rw' then 'Reading and Writing' else 'Math' end) || case
        when m."order" = 1 then ' — Module 1'
        when m.variant = 'hard' then ' — Module 2 (Hard)'
        else ' — Module 2 (Easy)'
      end,
      'questionCount', (select count(*) from public.questions q where q.module_id = m.id),
      'minutes', m.minutes_per_module
    )),
    'module', public._build_test_module_snapshot(m.id)
  )
  from public.modules m
  where m.test_id = p_test_id
    and m.section || '-' || m."order"::text || case when m."order" = 2 then '-' || m.variant else '' end = p_module_key
  limit 1;
$$;

with snapshots as (
  select a.id, public._build_test_snapshot(t.id) as snapshot
  from public.test_attempts a
  join public.tests t on t.slug = a.test_slug
  where a.test_snapshot is null
)
update public.test_attempts a
set test_snapshot = snapshots.snapshot
from snapshots
where a.id = snapshots.id and snapshots.snapshot is not null;

with snapshots as (
  select a.id, public._build_module_attempt_snapshot(t.id, a.module_key) as snapshot
  from public.module_attempts a
  join public.tests t on t.slug = a.test_slug
  where a.module_snapshot is null
)
update public.module_attempts a
set module_snapshot = snapshots.snapshot
from snapshots
where a.id = snapshots.id and snapshots.snapshot is not null;

drop function public._build_module_attempt_snapshot(text, text);
drop function public._build_test_snapshot(text);
drop function public._build_test_module_snapshot(text);

update public.test_attempts
set test_title = test_snapshot->>'title'
where test_title is null and test_snapshot is not null;

update public.test_attempts a
set test_title = t.title
from public.tests t
where a.test_title is null and a.test_slug = t.slug;

-- One compact aggregate call backs the dashboard. Question Bank remains in its
-- existing dedicated RPC so its all-historical-attempt definition stays authoritative.
create or replace function public.get_student_progress(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  course_practice as (
    select
      count(*)::integer as sessions,
      coalesce(sum(question_count), 0)::integer as attempted,
      coalesce(sum(correct_count), 0)::integer as correct
    from public.course_practice_attempts
    where email = p_email
  ),
  drill_questions as (
    select
      count(*)::integer as attempted,
      count(*) filter (where correct)::integer as correct
    from public.drill_question_attempts
    where email = p_email and source = 'drill'
  ),
  drill_rollup as (
    select
      count(*)::integer as sessions
    from public.drill_attempts
    where email = p_email
  ),
  unique_drills as (
    select
      count(*)::integer as unique_questions,
      coalesce(sum(attempts), 0)::integer as tracked_attempts
    from public.drill_question_progress
    where email = p_email
  ),
  lesson_rollup as (
    select count(*)::integer as completed
    from public.course_lesson_completions
    where email = p_email
  ),
  test_rollup as (
    select count(*)::integer as attempts
    from public.test_attempts
    where email = p_email
  )
  select jsonb_build_object(
    'lessonsCompleted', (select completed from lesson_rollup),
    'coursePracticeSessions', (select sessions from course_practice),
    'coursePracticeAttempted', (select attempted from course_practice),
    'coursePracticeCorrect', (select correct from course_practice),
    'drillQuestionAttempted', (select attempted from drill_questions),
    'drillQuestionCorrect', (select correct from drill_questions),
    'drillSessions', (select sessions from drill_rollup),
    'uniqueDrillQuestions', (select unique_questions from unique_drills),
    'trackedDrillAttempts', (select tracked_attempts from unique_drills),
    'testAttempts', (select attempts from test_rollup)
  );
$$;

revoke all on function public.get_student_progress(text) from public, anon, authenticated;
grant execute on function public.get_student_progress(text) to service_role;

-- Enforce the per-student Question Bank allowance in the same transaction that
-- records the answer. The advisory lock serializes different browser tabs for
-- one student, while client_token makes a lost-response retry return the saved
-- event without consuming another allowance slot.
create or replace function public.record_question_bank_attempt(
  p_email text,
  p_question_id text,
  p_session_id text,
  p_client_token text,
  p_response jsonb,
  p_correct boolean,
  p_duration_ms integer,
  p_section text,
  p_domain text,
  p_skill text,
  p_difficulty text,
  p_limit bigint
)
returns table(
  inserted boolean,
  duplicate boolean,
  allowed boolean,
  used bigint,
  stored_question_id text,
  stored_response jsonb,
  stored_correct boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_attempt public.question_bank_attempts%rowtype;
  current_usage bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_email)), 1500));

  select attempt.* into existing_attempt
  from public.question_bank_attempts attempt
  where attempt.email = p_email and attempt.client_token = p_client_token
  limit 1;

  if found then
    select count(*) into current_usage
    from public.question_bank_attempts attempt
    where attempt.email = p_email;
    return query select
      false,
      true,
      true,
      current_usage,
      existing_attempt.question_id,
      existing_attempt.response,
      existing_attempt.correct;
    return;
  end if;

  select count(*) into current_usage
  from public.question_bank_attempts attempt
  where attempt.email = p_email;

  if p_limit is not null and current_usage >= p_limit then
    return query select false, false, false, current_usage, null::text, null::jsonb, null::boolean;
    return;
  end if;

  insert into public.question_bank_attempts (
    email,
    question_id,
    session_id,
    client_token,
    mode,
    response,
    correct,
    duration_ms,
    section,
    domain,
    skill,
    difficulty
  ) values (
    p_email,
    p_question_id,
    p_session_id,
    p_client_token,
    'practice',
    p_response,
    p_correct,
    p_duration_ms,
    p_section,
    p_domain,
    p_skill,
    p_difficulty
  );

  return query select
    true,
    false,
    true,
    current_usage + 1,
    p_question_id,
    p_response,
    p_correct;
end;
$$;

revoke all on function public.record_question_bank_attempt(
  text, text, text, text, jsonb, boolean, integer, text, text, text, text, bigint
) from public, anon, authenticated;
grant execute on function public.record_question_bank_attempt(
  text, text, text, text, jsonb, boolean, integer, text, text, text, text, bigint
) to service_role;

comment on table public.drill_question_attempts is
  'Append-only drill answer history. Objective correct is exact; AI drill correct means the configured passing score was met.';
comment on column public.test_attempts.test_snapshot is
  'Immutable PracticeTest JSON used to score and render this completed report.';
comment on column public.test_attempts.test_title is
  'Immutable display title copied from test_snapshot for lightweight history lists.';
comment on column public.module_attempts.module_snapshot is
  'Immutable module and metadata JSON used to render a saved single-module report.';
