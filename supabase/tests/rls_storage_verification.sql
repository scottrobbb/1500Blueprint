-- Read-only deployment verification for the app's Supabase surface.
-- Run after migrations with a database-owner connection. Any failed invariant
-- raises an exception; success returns one row containing `verified`.

do $verification$
declare
  table_name text;
  role_name text;
  operation text;
  function_name text;
  relation_oid oid;
  function_count integer;
  bucket_is_public boolean;
  bucket_limit bigint;
  bucket_mime_types text[];
  policy_count integer;
  protected_tables constant text[] := array[
    'access_grants',
    'admins',
    'ai_monthly_usage',
    'api_rate_limits',
    'billing_checkout_intents',
    'billing_refunds',
    'billing_webhook_events',
    'call_recording_lessons',
    'call_recording_months',
    'choices',
    'community_comments',
    'community_likes',
    'community_notifications',
    'community_posts',
    'course_lesson_blocks',
    'course_lesson_completions',
    'course_lessons',
    'course_modules',
    'course_practice_attempts',
    'courses',
    'drill_attempts',
    'drill_question_attempts',
    'drill_question_progress',
    'drill_questions',
    'drill_walkthrough_steps',
    'drills',
    'email_campaigns',
    'email_contact_imports',
    'email_contacts',
    'email_messages',
    'email_webhook_events',
    'explanation_edit_log',
    'flashcard_cards',
    'flashcard_sets',
    'login_tokens',
    'module_attempts',
    'modules',
    'plan_definitions',
    'plan_entitlements',
    'question_bank_attempts',
    'question_bank_catalog',
    'question_bank_saves',
    'question_reports',
    'question_content_edit_log',
    'questions',
    'sat_skills',
    'staff_roles',
    'student_recent_activity',
    'student_subscriptions',
    'study_planner_plans',
    'study_planner_profiles',
    'study_planner_tasks',
    'test_attempts',
    'test_sessions',
    'tests',
    'user_achievements',
    'users',
    'weekly_calls',
    'xp_events'
  ]::text[];
  service_only_functions constant text[] := array[
    'add_xp',
    'claim_billing_checkout_intent',
    'community_resolve_handles',
    'community_top_members',
    'consume_ai_submission',
    'consume_api_rate_limit',
    'get_billing_integrity_health',
    'get_explanation_editor_stats',
    'get_explanation_queue',
    'get_explanation_queue_count',
    'get_question_bank_dashboard',
    'get_student_progress',
    'increment_post_views',
    'mark_billing_checkout_session',
    'record_drill_award',
    'record_login',
    'record_objective_drill_answer',
    'record_password_login',
    'record_question_bank_attempt',
    'record_test_award',
    'refund_ai_submission',
    'store_billing_checkout_session',
    'touch_updated_at',
    'update_staff_explanation',
    'update_staff_question_content',
    'weekly_leaderboard'
  ]::text[];
begin
  foreach table_name in array protected_tables loop
    relation_oid := to_regclass(format('public.%I', table_name));
    if relation_oid is null then
      raise exception 'RLS verification: expected table public.% is missing', table_name;
    end if;

    if not (select relrowsecurity from pg_class where oid = relation_oid) then
      raise exception 'RLS verification: public.% does not have RLS enabled', table_name;
    end if;

    foreach role_name in array array['anon', 'authenticated']::text[] loop
      foreach operation in array array[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ]::text[] loop
        if has_table_privilege(role_name, relation_oid, operation) then
          raise exception 'RLS verification: role % retains % on public.%',
            role_name, operation, table_name;
        end if;
      end loop;

      foreach operation in array array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']::text[] loop
        if has_any_column_privilege(role_name, relation_oid, operation) then
          raise exception 'RLS verification: role % retains column % on public.%',
            role_name, operation, table_name;
        end if;
      end loop;
    end loop;
  end loop;

  foreach function_name in array service_only_functions loop
    select count(*) into function_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = function_name;

    if function_count = 0 then
      raise exception 'RLS verification: expected function public.% is missing', function_name;
    end if;

    foreach role_name in array array['anon', 'authenticated']::text[] loop
      if exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = function_name
          and has_function_privilege(role_name, p.oid, 'EXECUTE')
      ) then
        raise exception 'RLS verification: role % can execute public.%',
          role_name, function_name;
      end if;
    end loop;
  end loop;

  select public, file_size_limit, allowed_mime_types
  into bucket_is_public, bucket_limit, bucket_mime_types
  from storage.buckets
  where id = 'course-assets';
  if not found then
    raise exception 'Storage verification: course-assets bucket is missing';
  end if;
  if bucket_is_public then
    raise exception 'Storage verification: course-assets must be private';
  end if;
  if bucket_limit is distinct from 524288000 then
    raise exception 'Storage verification: course-assets size limit is not 500 MiB';
  end if;
  if bucket_mime_types is null or not (
    array['application/pdf', 'image/png', 'video/mp4']::text[] <@ bucket_mime_types
  ) then
    raise exception 'Storage verification: course-assets MIME allowlist is incomplete';
  end if;

  select public, file_size_limit, allowed_mime_types
  into bucket_is_public, bucket_limit, bucket_mime_types
  from storage.buckets
  where id = 'figures';
  if not found then
    raise exception 'Storage verification: figures bucket is missing';
  end if;
  if not bucket_is_public then
    raise exception 'Storage verification: figures must remain public';
  end if;
  if bucket_limit is distinct from 10485760 then
    raise exception 'Storage verification: figures size limit is not 10 MiB';
  end if;
  if bucket_mime_types is null or not (
    array['image/png', 'image/jpeg', 'image/webp']::text[] <@ bucket_mime_types
  ) then
    raise exception 'Storage verification: figures MIME allowlist is incomplete';
  end if;

  select count(*) into policy_count
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'storage'
    and c.relname = 'objects'
    and p.polname = 'course assets require server mediation'
    and not p.polpermissive
    and p.polcmd = '*'
    and (select oid from pg_roles where rolname = 'anon') = any(p.polroles)
    and (select oid from pg_roles where rolname = 'authenticated') = any(p.polroles)
    and position('course-assets' in pg_get_expr(p.polqual, p.polrelid)) > 0
    and position('course-assets' in pg_get_expr(p.polwithcheck, p.polrelid)) > 0;
  if policy_count <> 1 then
    raise exception 'Storage verification: restrictive course-assets policy is missing';
  end if;

  select count(*) into policy_count
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'storage'
    and c.relname = 'objects'
    and p.polname = 'figures require server mediation'
    and not p.polpermissive
    and p.polcmd = '*'
    and (select oid from pg_roles where rolname = 'anon') = any(p.polroles)
    and (select oid from pg_roles where rolname = 'authenticated') = any(p.polroles)
    and position('figures' in pg_get_expr(p.polqual, p.polrelid)) > 0
    and position('figures' in pg_get_expr(p.polwithcheck, p.polrelid)) > 0;
  if policy_count <> 1 then
    raise exception 'Storage verification: restrictive figures policy is missing';
  end if;
end
$verification$;

select 'verified' as rls_storage_status;
