-- Restrict the staff explanation queue to unanswered standard-difficulty items,
-- enforce explanation quality at the write boundary, and expose editor metrics.

create or replace function public.get_explanation_queue(p_limit integer default 500)
returns table (
  id text, target_type text, source_label text, location text, section text,
  difficulty text, skill text, passage text, prompt text, figure_url text,
  choices jsonb, correct_answer text, explanation text, published boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with bank_candidates as (
    select
      q.id,
      'question_bank'::text as target_type,
      case when q.section = 'math' then 'Question Bank · Math' else 'Question Bank · Reading & Writing' end as source_label,
      coalesce(nullif(concat_ws(' · ', nullif(q.domain, ''), nullif(q.skill, '')), ''), q.drill_slug) as location,
      coalesce(q.section, 'rw') as section,
      lower(q.difficulty) as difficulty,
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
      and lower(q.difficulty) in ('easy', 'medium', 'hard')
      and concat_ws(
        ' ',
        coalesce(q.content #>> '{source,archivePath}', ''),
        coalesce(q.content #>> '{source,document}', '')
      ) !~* 'challenge'
      and nullif(trim(q.explanation), '') is null
  ),
  test_candidates as (
    select
      q.id,
      'practice_test'::text as target_type,
      t.title as source_label,
      (case when m.section = 'math' then 'Math' else 'R&W' end)
        || ' M' || m."order"::text
        || case when m."order" = 2 then ' ' || initcap(m.variant) else '' end
        || ' · Question ' || q.position::text as location,
      m.section,
      lower(q.difficulty) as difficulty,
      q.skill,
      q.passage,
      q.prompt,
      q.figure_url,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', c.letter, 'text', c.text) order by c.letter)
        from public.choices c
        where c.question_id = q.id
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
    where lower(q.difficulty) in ('easy', 'medium', 'hard')
      and nullif(trim(q.explanation), '') is null
  ),
  ranked as (
    select candidates.*,
      row_number() over (
        partition by target_type
        order by source_label, location, id
      ) as source_rank
    from (
      select * from bank_candidates
      union all
      select * from test_candidates
    ) candidates
  )
  select
    id, target_type, source_label, location, section, difficulty, skill,
    passage, prompt, figure_url, choices, correct_answer, explanation, published
  from ranked
  order by source_rank, target_type, source_label, location
  limit greatest(1, least(coalesce(p_limit, 500), 500));
$$;

revoke all on function public.get_explanation_queue(integer) from public, anon, authenticated;
grant execute on function public.get_explanation_queue(integer) to service_role;

create or replace function public.update_staff_explanation(
  p_editor_email text,
  p_target_type text,
  p_target_id text,
  p_explanation text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  prior_value text;
  target_difficulty text;
  target_source text;
  clean_explanation text := trim(coalesce(p_explanation, ''));
begin
  if cardinality(regexp_split_to_array(clean_explanation, E'\\s+')) < 15 then
    raise exception 'Explanation must contain at least 15 words';
  end if;
  if char_length(clean_explanation) > 20000 then
    raise exception 'Explanation is too long';
  end if;

  if p_target_type = 'question_bank' then
    select
      q.explanation,
      lower(q.difficulty),
      concat_ws(
        ' ',
        coalesce(q.content #>> '{source,archivePath}', ''),
        coalesce(q.content #>> '{source,document}', '')
      )
    into prior_value, target_difficulty, target_source
    from public.drill_questions q
    join public.question_bank_catalog c on c.question_id = q.id and c.enabled = true
    where q.id = p_target_id
    for update of q;

    if not found
      or target_difficulty is null
      or target_difficulty not in ('easy', 'medium', 'hard')
      or target_source ~* 'challenge'
    then
      raise exception 'Question is not eligible for staff explanation';
    end if;
    if nullif(trim(prior_value), '') is not null then
      raise exception 'Question already has an explanation';
    end if;

    update public.drill_questions
    set explanation = clean_explanation, updated_at = now()
    where id = p_target_id;
  elsif p_target_type = 'practice_test' then
    select q.explanation, lower(q.difficulty)
    into prior_value, target_difficulty
    from public.questions q
    where q.id = p_target_id
    for update;

    if not found or target_difficulty is null or target_difficulty not in ('easy', 'medium', 'hard') then
      raise exception 'Question is not eligible for staff explanation';
    end if;
    if nullif(trim(prior_value), '') is not null then
      raise exception 'Question already has an explanation';
    end if;

    update public.questions
    set explanation = clean_explanation, explanation_source = 'human'
    where id = p_target_id;
  else
    raise exception 'Unsupported explanation target';
  end if;

  insert into public.explanation_edit_log (
    editor_email, target_type, target_id, prior_explanation, next_explanation
  ) values (
    lower(trim(p_editor_email)), p_target_type, p_target_id, prior_value, clean_explanation
  );
end;
$$;

revoke all on function public.update_staff_explanation(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.update_staff_explanation(text, text, text, text)
  to service_role;

create or replace function public.get_explanation_editor_stats()
returns table (
  editor_email text,
  editor_name text,
  completed_total bigint,
  completed_last_7_days bigint,
  completed_today bigint,
  last_completed_at timestamptz,
  current_staff boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with qualifying_edits as (
    select l.*
    from public.explanation_edit_log l
    where nullif(trim(l.prior_explanation), '') is null
      and cardinality(regexp_split_to_array(trim(l.next_explanation), E'\\s+')) >= 15
      and (
        (
          l.target_type = 'question_bank'
          and exists (
            select 1
            from public.drill_questions q
            join public.question_bank_catalog c on c.question_id = q.id and c.enabled = true
            where q.id = l.target_id
              and lower(q.difficulty) in ('easy', 'medium', 'hard')
              and concat_ws(
                ' ',
                coalesce(q.content #>> '{source,archivePath}', ''),
                coalesce(q.content #>> '{source,document}', '')
              ) !~* 'challenge'
          )
        )
        or (
          l.target_type = 'practice_test'
          and exists (
            select 1
            from public.questions q
            where q.id = l.target_id
              and lower(q.difficulty) in ('easy', 'medium', 'hard')
          )
        )
      )
  ),
  credited as (
    select distinct on (target_type, target_id)
      editor_email, target_type, target_id, created_at
    from qualifying_edits
    order by target_type, target_id, created_at, id
  ),
  editors as (
    select email
    from public.staff_roles
    where role = 'explanation_editor'
    union
    select editor_email
    from credited
  )
  select
    editors.email as editor_email,
    users.name as editor_name,
    count(credited.target_id) as completed_total,
    count(credited.target_id) filter (
      where credited.created_at >= now() - interval '7 days'
    ) as completed_last_7_days,
    count(credited.target_id) filter (
      where credited.created_at >= (
        date_trunc('day', now() at time zone 'America/New_York')
        at time zone 'America/New_York'
      )
    ) as completed_today,
    max(credited.created_at) as last_completed_at,
    exists (
      select 1
      from public.staff_roles roles
      where roles.email = editors.email and roles.role = 'explanation_editor'
    ) as current_staff
  from editors
  left join public.users users on users.email = editors.email
  left join credited on credited.editor_email = editors.email
  group by editors.email, users.name
  order by completed_total desc, editors.email;
$$;

revoke all on function public.get_explanation_editor_stats() from public, anon, authenticated;
grant execute on function public.get_explanation_editor_stats() to service_role;

comment on function public.get_explanation_editor_stats() is
  'Credits the first qualifying 15-word completion for each eligible non-Challenge question.';
