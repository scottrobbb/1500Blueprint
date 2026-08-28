-- Student-submitted reports for authored question-bank and practice-test items.
-- All reads and writes are server-mediated; students never receive direct table
-- privileges, and admin status changes use the service-role client.

create table if not exists public.question_reports (
  id                        text primary key default gen_random_uuid()::text,
  drill_question_id         text references public.drill_questions(id) on delete cascade,
  practice_test_question_id text references public.questions(id) on delete cascade,
  reporter_email            text not null references public.users(email) on update cascade on delete restrict,
  reporter_auth_user_id     uuid references auth.users(id) on delete set null,
  report_type               text not null,
  comment                   text not null,
  status                    text not null default 'open',
  resolved_at               timestamptz,
  resolved_by_email         text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint question_reports_one_target_check check (
    num_nonnulls(drill_question_id, practice_test_question_id) = 1
  ),
  constraint question_reports_type_check check (
    report_type in ('wrong-answer', 'incorrect-explanation', 'formatting', 'other')
  ),
  constraint question_reports_status_check check (
    status in ('open', 'resolved', 'dismissed')
  ),
  constraint question_reports_comment_length_check check (
    length(btrim(comment)) between 3 and 2000
  ),
  constraint question_reports_resolution_check check (
    (status = 'open' and resolved_at is null and resolved_by_email is null)
    or (status in ('resolved', 'dismissed') and resolved_at is not null and resolved_by_email is not null)
  )
);

create index if not exists question_reports_status_created_idx
  on public.question_reports(status, created_at desc);
create index if not exists question_reports_drill_question_idx
  on public.question_reports(drill_question_id)
  where drill_question_id is not null;
create index if not exists question_reports_practice_question_idx
  on public.question_reports(practice_test_question_id)
  where practice_test_question_id is not null;
create index if not exists question_reports_reporter_email_idx
  on public.question_reports(reporter_email);
create index if not exists question_reports_reporter_auth_user_idx
  on public.question_reports(reporter_auth_user_id)
  where reporter_auth_user_id is not null;

alter table public.question_reports enable row level security;
revoke all on table public.question_reports from anon, authenticated;

drop trigger if exists question_reports_touch on public.question_reports;
create trigger question_reports_touch before update on public.question_reports
  for each row execute function public.touch_updated_at();
