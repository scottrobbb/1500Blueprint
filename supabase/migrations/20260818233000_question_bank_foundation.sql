-- 1500 Ultimate — Question Bank catalog, student activity, and dashboard analytics.
--
-- The catalog is an explicit allowlist over drill_questions. This keeps full-test
-- and drill-only items out of the bank unless Scott deliberately includes them.
-- Attempts snapshot the taxonomy used when the answer was submitted so editing a
-- question later does not rewrite the student's historical analytics.

create table if not exists public.question_bank_catalog (
  question_id  text primary key references public.drill_questions(id) on delete cascade,
  access_tier  text not null default 'ultimate' check (access_tier in ('free', 'ultimate')),
  enabled      boolean not null default true,
  added_at     timestamptz not null default now()
);

create index if not exists question_bank_catalog_enabled_idx
  on public.question_bank_catalog(enabled, access_tier);

create table if not exists public.question_bank_attempts (
  id            text primary key default gen_random_uuid()::text,
  email         text not null references public.users(email) on delete cascade,
  question_id   text not null references public.drill_questions(id) on delete restrict,
  session_id    text,
  client_token  text,
  mode          text not null default 'practice' check (mode in ('practice', 'review', 'challenge')),
  response      jsonb not null default '{}'::jsonb,
  correct       boolean not null,
  duration_ms   integer not null default 0 check (duration_ms >= 0),
  section       text not null check (section in ('rw', 'math')),
  domain        text,
  skill         text,
  difficulty    text not null check (difficulty in ('easy', 'medium', 'hard')),
  attempted_at  timestamptz not null default now()
);

create unique index if not exists question_bank_attempts_client_token_key
  on public.question_bank_attempts(client_token)
  where client_token is not null;
create index if not exists question_bank_attempts_email_time_idx
  on public.question_bank_attempts(email, attempted_at desc);
create index if not exists question_bank_attempts_email_question_idx
  on public.question_bank_attempts(email, question_id);
create index if not exists question_bank_attempts_email_section_idx
  on public.question_bank_attempts(email, section, attempted_at desc);

create table if not exists public.question_bank_saves (
  email        text not null references public.users(email) on delete cascade,
  question_id  text not null references public.drill_questions(id) on delete cascade,
  saved_at     timestamptz not null default now(),
  primary key (email, question_id)
);

create index if not exists question_bank_saves_email_time_idx
  on public.question_bank_saves(email, saved_at desc);

alter table public.question_bank_catalog enable row level security;
alter table public.question_bank_attempts enable row level security;
alter table public.question_bank_saves enable row level security;

-- All bank reads and writes go through authenticated server routes. Keeping
-- these tables private also prevents the publishable key from reading answers
-- indirectly through attempt history or enumerating Ultimate-only inventory.
revoke all on table public.question_bank_catalog from public, anon, authenticated;
revoke all on table public.question_bank_attempts from public, anon, authenticated;
revoke all on table public.question_bank_saves from public, anon, authenticated;
grant select, insert, update, delete on table public.question_bank_catalog to service_role;
grant select, insert, update, delete on table public.question_bank_attempts to service_role;
grant select, insert, update, delete on table public.question_bank_saves to service_role;

-- Seed only the current objective SAT banks. Vocabulary, reading-recall drills,
-- AI drills, flashcards, and full-length-test questions remain excluded.
insert into public.question_bank_catalog (question_id, access_tier)
select q.id, 'ultimate'
from public.drill_questions q
where q.status = 'published'
  and (
    (
      q.drill_slug = 'grammar'
      and q.section = 'rw'
      and q.answer_type = 'mc_single'
      and q.created_by = 'scott-reading-import'
    )
    or
    (
      q.drill_slug = 'targeted-math'
      and q.section = 'math'
      and q.answer_type in ('mc_single', 'grid_in')
      and q.created_by = 'scott-math-import'
    )
  )
on conflict (question_id) do nothing;

-- One service-only call supplies the entire landing dashboard. Aggregating in
-- Postgres keeps the page fast even after the bank has millions of attempts.
create or replace function public.get_question_bank_dashboard(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  subjects(section) as (
    values ('rw'::text), ('math'::text)
  ),
  difficulties(difficulty, sort) as (
    values ('easy'::text, 1), ('medium'::text, 2), ('hard'::text, 3)
  ),
  eligible as (
    select q.id, q.section, q.domain, q.skill, q.difficulty
    from public.question_bank_catalog c
    join public.drill_questions q on q.id = c.question_id
    where c.enabled = true
      and q.status = 'published'
      and q.section in ('rw', 'math')
      and (
        (q.section = 'rw' and q.created_by = 'scott-reading-import')
        or (q.section = 'math' and q.created_by = 'scott-math-import')
      )
  ),
  attempts as (
    select a.*
    from public.question_bank_attempts a
    join eligible e on e.id = a.question_id
    where a.email = p_email
  ),
  subject_stats as (
    select
      s.section,
      count(distinct e.id) as available,
      count(distinct a.question_id) as solved,
      count(a.id) as attempts,
      count(a.id) filter (where a.correct) as correct
    from subjects s
    left join eligible e on e.section = s.section
    left join attempts a on a.question_id = e.id
    group by s.section
  ),
  weeks as (
    select generate_series(
      date_trunc('week', timezone('utc', now()))::date - interval '11 weeks',
      date_trunc('week', timezone('utc', now()))::date,
      interval '1 week'
    )::date as week_start
  ),
  weekly as (
    select
      w.week_start,
      count(a.id) filter (where a.correct) as correct,
      count(a.id) filter (where not a.correct) as wrong,
      count(a.id) filter (where a.correct and a.difficulty = 'easy') as easy_correct,
      count(a.id) filter (where a.correct and a.difficulty = 'medium') as medium_correct,
      count(a.id) filter (where a.correct and a.difficulty = 'hard') as hard_correct,
      count(a.id) filter (where not a.correct and a.difficulty = 'easy') as easy_wrong,
      count(a.id) filter (where not a.correct and a.difficulty = 'medium') as medium_wrong,
      count(a.id) filter (where not a.correct and a.difficulty = 'hard') as hard_wrong
    from weeks w
    left join attempts a
      on date_trunc('week', timezone('utc', a.attempted_at))::date = w.week_start
    group by w.week_start
  ),
  topic_stats as (
    select
      e.section,
      coalesce(nullif(e.domain, ''), 'Other') as domain,
      count(distinct e.id) as available,
      count(a.id) filter (
        where a.section = e.section
          and coalesce(nullif(a.domain, ''), 'Other') = coalesce(nullif(e.domain, ''), 'Other')
      ) as attempts,
      count(a.id) filter (
        where a.correct
          and a.section = e.section
          and coalesce(nullif(a.domain, ''), 'Other') = coalesce(nullif(e.domain, ''), 'Other')
      ) as correct
    from eligible e
    left join attempts a on a.question_id = e.id
    group by e.section, coalesce(nullif(e.domain, ''), 'Other')
  ),
  difficulty_stats as (
    select
      s.section,
      d.difficulty,
      d.sort,
      count(distinct e.id) as available,
      count(a.id) filter (where a.section = s.section and a.difficulty = d.difficulty) as attempts,
      count(a.id) filter (where a.correct and a.section = s.section and a.difficulty = d.difficulty) as correct,
      coalesce(round(avg(a.duration_ms) filter (
        where a.section = s.section and a.difficulty = d.difficulty
      )), 0) as average_duration_ms
    from subjects s
    cross join difficulties d
    left join eligible e on e.section = s.section and e.difficulty = d.difficulty
    left join attempts a on a.question_id = e.id
    group by s.section, d.difficulty, d.sort
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'attempted', (select count(*) from attempts),
      'correct', (select count(*) from attempts where correct),
      'accuracy', coalesce(
        (select round(100.0 * count(*) filter (where correct) / nullif(count(*), 0)) from attempts),
        0
      ),
      'saved', (
        select count(*)
        from public.question_bank_saves s
        join eligible e on e.id = s.question_id
        where s.email = p_email
      ),
      'streak', coalesce((select u.streak_current from public.users u where u.email = p_email), 0)
    ),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'section', section,
        'available', available,
        'solved', solved,
        'attempts', attempts,
        'correct', correct,
        'accuracy', coalesce(round(100.0 * correct / nullif(attempts, 0)), 0)
      ) order by case section when 'rw' then 1 else 2 end)
      from subject_stats
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekStart', week_start,
        'correct', correct,
        'wrong', wrong,
        'easyCorrect', easy_correct,
        'mediumCorrect', medium_correct,
        'hardCorrect', hard_correct,
        'easyWrong', easy_wrong,
        'mediumWrong', medium_wrong,
        'hardWrong', hard_wrong
      ) order by week_start)
      from weekly
    ), '[]'::jsonb),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'section', section,
        'domain', domain,
        'available', available,
        'attempts', attempts,
        'correct', correct,
        'accuracy', coalesce(round(100.0 * correct / nullif(attempts, 0)), 0)
      ) order by case section when 'rw' then 1 else 2 end, domain)
      from topic_stats
    ), '[]'::jsonb),
    'difficulty', coalesce((
      select jsonb_agg(jsonb_build_object(
        'section', section,
        'difficulty', difficulty,
        'available', available,
        'attempts', attempts,
        'correct', correct,
        'accuracy', coalesce(round(100.0 * correct / nullif(attempts, 0)), 0),
        'averageDurationMs', average_duration_ms
      ) order by case section when 'rw' then 1 else 2 end, sort)
      from difficulty_stats
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_question_bank_dashboard(text) from public, anon, authenticated;
grant execute on function public.get_question_bank_dashboard(text) to service_role;

comment on table public.question_bank_catalog is
  'Explicit allowlist of published drill_questions available in Ultimate Question Bank.';
comment on table public.question_bank_attempts is
  'Append-only question-level answer history used by the bank runner and analytics.';
comment on table public.question_bank_saves is
  'Per-student saved questions for later review.';
