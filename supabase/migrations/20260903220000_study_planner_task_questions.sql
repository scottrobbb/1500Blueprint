-- A Study Planner question-set task has to hand the student the same questions
-- every time they open it. The runner re-selects "unattempted first" on every
-- load, so a student who answered 12 of 15 and came back the next day was
-- handed a fresh 15 -- their finished work simply left the session, which reads
-- as the task restarting. The set is pinned the first time the task is opened
-- and replayed on every visit after that.

create table if not exists public.study_planner_task_questions (
  task_id     text not null references public.study_planner_tasks(id) on delete cascade,
  position    integer not null check (position > 0),
  -- A retired question just leaves the pinned set; the replay already copes
  -- with a set that has lost a question, so it must not block the deletion.
  question_id text not null references public.drill_questions(id) on delete cascade,
  pinned_at   timestamptz not null default now(),
  primary key (task_id, position),
  unique (task_id, question_id)
);

alter table public.study_planner_task_questions enable row level security;

revoke all on table public.study_planner_task_questions from public, anon, authenticated;
grant select, insert, update, delete on table public.study_planner_task_questions to service_role;
