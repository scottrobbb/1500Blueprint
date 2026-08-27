-- The explanation queue view is capped at 500 rows for the sidebar list,
-- but the "remaining" count shown to editors was just that capped array's
-- length — so once true remaining climbed back above 500, the badge stuck
-- at 500 no matter how many explanations got completed. This adds a
-- lightweight COUNT-only RPC (no row payload) so the badge can reflect the
-- true remaining total, independent of the list's row cap.

create or replace function public.get_explanation_queue_count()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select (
    select count(*)
    from public.question_bank_catalog c
    join public.drill_questions q on q.id = c.question_id
    where c.enabled = true
      and lower(q.difficulty) in ('easy', 'medium', 'hard')
      and concat_ws(
        ' ',
        coalesce(q.content #>> '{source,archivePath}', ''),
        coalesce(q.content #>> '{source,document}', '')
      ) !~* 'challenge'
      and nullif(trim(q.explanation), '') is null
  ) + (
    select count(*)
    from public.questions q
    where lower(q.difficulty) in ('easy', 'medium', 'hard')
      and nullif(trim(q.explanation), '') is null
  );
$$;

revoke all on function public.get_explanation_queue_count() from public, anon, authenticated;
grant execute on function public.get_explanation_queue_count() to service_role;
