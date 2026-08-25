-- Each month can hold several call recordings; track the date of the call
-- itself so multiple recordings in the same month sort and display correctly.
-- Title becomes optional now that the date carries the primary identity.

alter table public.call_recording_lessons
  add column if not exists call_date date;

update public.call_recording_lessons
  set call_date = created_at::date
  where call_date is null;

alter table public.call_recording_lessons
  alter column call_date set not null;

alter table public.call_recording_lessons
  alter column title drop not null;

drop index if exists call_recording_lessons_month_created_idx;
create index if not exists call_recording_lessons_month_date_idx
  on public.call_recording_lessons(month_id, call_date);
