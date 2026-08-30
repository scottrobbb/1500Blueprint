-- Free-plan students are restricted to a curated ~200-question pool
-- (question_bank_catalog.access_tier = 'free'; see the free-tier admin
-- toggle and the freeTierOnly filtering added in the question-bank query
-- layer). The dashboard's "available" counts previously always summed the
-- entire eligible catalog regardless of plan, so a Free student saw the
-- full-bank totals (e.g. "478 available") even though their actual pool is
-- 100 per subject. Adds an opt-in parameter so the caller can restrict the
-- eligible set to the free-tier pool.

drop function if exists public.get_question_bank_dashboard(text);

create or replace function public.get_question_bank_dashboard(
  p_email text,
  p_free_tier_only boolean default false
)
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
      and (p_free_tier_only = false or c.access_tier = 'free')
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

revoke all on function public.get_question_bank_dashboard(text, boolean) from public, anon, authenticated;
grant execute on function public.get_question_bank_dashboard(text, boolean) to service_role;

comment on function public.get_question_bank_dashboard(text, boolean) is
  'Question Bank dashboard aggregates. p_free_tier_only restricts the eligible set to question_bank_catalog.access_tier = ''free'' for Free-plan callers.';
