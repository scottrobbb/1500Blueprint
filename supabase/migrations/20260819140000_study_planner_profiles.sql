-- Persistent inputs for the lightweight Ultimate study planner. The actual
-- schedule will be generated from the final content catalog later.

create table if not exists public.study_planner_profiles (
  email                          text primary key references public.users(email) on delete cascade,
  test_date                      date not null,
  current_score                  integer check (current_score between 400 and 1600),
  goal_score                     integer not null check (goal_score between 400 and 1600),
  study_days                     smallint[] not null check (cardinality(study_days) between 1 and 7),
  practice_test_day              smallint not null check (practice_test_day between 0 and 6),
  last_score_prompt_attempt_id   text,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);

alter table public.study_planner_profiles enable row level security;
revoke all on table public.study_planner_profiles from public, anon, authenticated;
grant select, insert, update, delete on table public.study_planner_profiles to service_role;
