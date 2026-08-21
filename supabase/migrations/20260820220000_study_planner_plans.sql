-- Data-backed Max study plans. Plans are immutable snapshots; student progress
-- is derived from real activity tables instead of mutable completion toggles.

alter table public.study_planner_profiles
  add column if not exists daily_minutes integer not null default 45,
  add column if not exists score_updated_at timestamptz;

update public.study_planner_profiles
set score_updated_at = updated_at
where current_score is not null
  and score_updated_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'study_planner_profiles_daily_minutes_check'
  ) then
    alter table public.study_planner_profiles
      add constraint study_planner_profiles_daily_minutes_check
      check (daily_minutes between 20 and 180 and daily_minutes % 5 = 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'study_planner_profiles_study_days_values_check'
  ) then
    alter table public.study_planner_profiles
      add constraint study_planner_profiles_study_days_values_check
      check (
        study_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
        and cardinality(array_positions(study_days, 0::smallint)) <= 1
        and cardinality(array_positions(study_days, 1::smallint)) <= 1
        and cardinality(array_positions(study_days, 2::smallint)) <= 1
        and cardinality(array_positions(study_days, 3::smallint)) <= 1
        and cardinality(array_positions(study_days, 4::smallint)) <= 1
        and cardinality(array_positions(study_days, 5::smallint)) <= 1
        and cardinality(array_positions(study_days, 6::smallint)) <= 1
      );
  end if;
end
$$;

create table if not exists public.study_planner_plans (
  id                  text primary key default gen_random_uuid()::text,
  email               text not null references public.users(email) on delete cascade,
  generated_at        timestamptz not null default now(),
  starts_on           date not null,
  ends_on             date not null,
  test_date           date not null,
  phase               text not null check (phase in ('baseline', 'foundation', 'build', 'test_ready', 'taper')),
  goal_score          integer not null check (goal_score between 400 and 1600),
  current_score       integer check (current_score between 400 and 1600),
  score_gap           integer check (score_gap is null or score_gap >= 0),
  days_to_test        integer not null check (days_to_test >= 0),
  score_runway        jsonb not null default '{}'::jsonb,
  focus_areas         jsonb not null default '[]'::jsonb,
  total_minutes       integer not null default 0 check (total_minutes >= 0),
  study_days          smallint[] not null,
  daily_minutes       integer not null check (daily_minutes between 20 and 180),
  practice_test_day   smallint not null check (practice_test_day between 0 and 6),
  profile_updated_at  timestamptz not null,
  unique (email, id),
  check (ends_on >= starts_on),
  check (ends_on <= test_date),
  check (cardinality(study_days) between 1 and 7),
  check (daily_minutes % 5 = 0),
  check (
    study_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    and cardinality(array_positions(study_days, 0::smallint)) <= 1
    and cardinality(array_positions(study_days, 1::smallint)) <= 1
    and cardinality(array_positions(study_days, 2::smallint)) <= 1
    and cardinality(array_positions(study_days, 3::smallint)) <= 1
    and cardinality(array_positions(study_days, 4::smallint)) <= 1
    and cardinality(array_positions(study_days, 5::smallint)) <= 1
    and cardinality(array_positions(study_days, 6::smallint)) <= 1
  )
);

create table if not exists public.study_planner_tasks (
  id                  text primary key,
  plan_id             text not null references public.study_planner_plans(id) on delete cascade,
  task_date           date not null,
  position            integer not null check (position > 0),
  kind                text not null check (kind in ('question_bank', 'course_lesson', 'full_test', 'review')),
  section             text check (section in ('rw', 'math')),
  skill               text,
  title               text not null,
  description         text not null,
  reason              text not null,
  href                text not null check (href like '/%'),
  estimated_minutes   integer not null check (estimated_minutes > 0),
  target_count        integer not null check (target_count > 0),
  course_lesson_id    text references public.course_lessons(id) on delete set null,
  test_slug           text,
  unique (plan_id, position),
  check (
    (kind in ('question_bank', 'review') and section is not null and skill is not null)
    or (kind not in ('question_bank', 'review'))
  )
);

alter table public.study_planner_profiles
  add column if not exists active_plan_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'study_planner_profiles_active_plan_id_fkey'
  ) then
    alter table public.study_planner_profiles
      add constraint study_planner_profiles_active_plan_id_fkey
      foreign key (email, active_plan_id)
      references public.study_planner_plans(email, id) on delete restrict;
  end if;
end
$$;

create index if not exists study_planner_plans_email_generated_idx
  on public.study_planner_plans(email, generated_at desc);
create index if not exists study_planner_tasks_plan_date_idx
  on public.study_planner_tasks(plan_id, task_date, position);
create index if not exists study_planner_tasks_lesson_idx
  on public.study_planner_tasks(course_lesson_id)
  where course_lesson_id is not null;

alter table public.study_planner_plans enable row level security;
alter table public.study_planner_tasks enable row level security;

revoke all on table public.study_planner_plans from public, anon, authenticated;
revoke all on table public.study_planner_tasks from public, anon, authenticated;
grant select, insert, update, delete on table public.study_planner_plans to service_role;
grant select, insert, update, delete on table public.study_planner_tasks to service_role;
