create or replace function public.get_explanation_queue(p_limit integer default 250)
returns table (
  id text,
  target_type text,
  source_label text,
  location text,
  section text,
  difficulty text,
  skill text,
  passage text,
  prompt text,
  figure_url text,
  choices jsonb,
  correct_answer text,
  explanation text,
  published boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with candidates as (
    select
      q.id,
      'question_bank'::text as target_type,
      case when q.section = 'math' then 'Question Bank · Math' else 'Question Bank · Reading & Writing' end as source_label,
      coalesce(nullif(concat_ws(' · ', nullif(q.domain, ''), nullif(q.skill, '')), ''), q.drill_slug) as location,
      coalesce(q.section, 'rw') as section,
      q.difficulty,
      q.skill,
      q.passage,
      coalesce(nullif(trim(q.stem), ''), nullif(trim(q.passage), ''), 'Untitled question') as prompt,
      q.figure_url,
      coalesce(q.content -> 'choices', '[]'::jsonb) as choices,
      case
        when q.answer_type = 'grid_in' then coalesce(array_to_string(array(
          select jsonb_array_elements_text(coalesce(q.content -> 'accepted', '[]'::jsonb))
        ), ' or '), '')
        else coalesce((
          select (choice ->> 'id') || '. ' || (choice ->> 'text')
          from jsonb_array_elements(coalesce(q.content -> 'choices', '[]'::jsonb)) choice
          where choice ->> 'id' = q.content ->> 'correct'
          limit 1
        ), '')
      end as correct_answer,
      coalesce(q.explanation, '') as explanation,
      q.status = 'published' as published
    from public.question_bank_catalog catalog
    join public.drill_questions q on q.id = catalog.question_id
    where catalog.enabled = true

    union all

    select
      q.id,
      'practice_test'::text as target_type,
      t.title as source_label,
      (case when m.section = 'math' then 'Math' else 'R&W' end)
        || ' M' || m."order"::text
        || case when m."order" = 2 then ' ' || initcap(m.variant) else '' end
        || ' · Question ' || q.position::text as location,
      m.section,
      coalesce(q.difficulty, 'medium') as difficulty,
      q.skill,
      q.passage,
      q.prompt,
      q.figure_url,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', c.letter, 'text', c.text) order by c.letter)
        from public.choices c where c.question_id = q.id
      ), '[]'::jsonb) as choices,
      case
        when q.type = 'grid' then coalesce(array_to_string(q.accepted_answers, ' or '), '')
        else coalesce((
          select c.letter || '. ' || c.text
          from public.choices c
          where c.question_id = q.id and c.letter = q.correct
          limit 1
        ), '')
      end as correct_answer,
      coalesce(q.explanation, '') as explanation,
      t.status = 'published' as published
    from public.questions q
    join public.modules m on m.id = q.module_id
    join public.tests t on t.id = m.test_id
  )
  select * from candidates
  order by (nullif(trim(explanation), '') is not null), source_label, location
  limit greatest(1, least(coalesce(p_limit, 250), 500));
$$;

revoke all on function public.get_explanation_queue(integer) from public, anon, authenticated;
grant execute on function public.get_explanation_queue(integer) to service_role;
