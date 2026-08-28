-- Complete the server-mediated data boundary for schemas that predate the
-- migration-based account rollout. The application never queries these tables
-- with an anon/authenticated Supabase client, so browser roles need no table
-- privileges even where RLS already defaults to an empty result.

alter table public.login_tokens enable row level security;
alter table public.users enable row level security;
alter table public.admins enable row level security;
alter table public.sat_skills enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_likes enable row level security;
alter table public.community_notifications enable row level security;
alter table public.flashcard_sets enable row level security;
alter table public.flashcard_cards enable row level security;
alter table public.xp_events enable row level security;
alter table public.drill_attempts enable row level security;
alter table public.drill_question_progress enable row level security;
alter table public.test_attempts enable row level security;
alter table public.test_sessions enable row level security;
alter table public.module_attempts enable row level security;
alter table public.user_achievements enable row level security;
alter table public.student_recent_activity enable row level security;

-- sat_skills used to be public taxonomy data. Runtime and admin readers now use
-- the service-role client, so keep it behind the same server boundary as the
-- questions that reference it.
drop policy if exists "public read sat_skills" on public.sat_skills;

revoke all privileges on table
  public.login_tokens,
  public.users,
  public.admins,
  public.sat_skills,
  public.community_posts,
  public.community_comments,
  public.community_likes,
  public.community_notifications,
  public.flashcard_sets,
  public.flashcard_cards,
  public.xp_events,
  public.drill_attempts,
  public.drill_question_progress,
  public.test_attempts,
  public.test_sessions,
  public.module_attempts,
  public.user_achievements,
  public.student_recent_activity
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.login_tokens,
  public.users,
  public.admins,
  public.sat_skills,
  public.community_posts,
  public.community_comments,
  public.community_likes,
  public.community_notifications,
  public.flashcard_sets,
  public.flashcard_cards,
  public.xp_events,
  public.drill_attempts,
  public.drill_question_progress,
  public.test_attempts,
  public.test_sessions,
  public.module_attempts,
  public.user_achievements,
  public.student_recent_activity
to service_role;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC unless it is revoked.
-- These RPCs all accept identity or mutation parameters and are only called by
-- authenticated application routes through the service-role client.
revoke all on function public.record_login(text, text)
  from public, anon, authenticated;
revoke all on function public.increment_post_views(text)
  from public, anon, authenticated;
revoke all on function public.community_top_members(integer)
  from public, anon, authenticated;
revoke all on function public.community_resolve_handles(text[])
  from public, anon, authenticated;
revoke all on function public.add_xp(text, integer)
  from public, anon, authenticated;
revoke all on function public.weekly_leaderboard(timestamptz)
  from public, anon, authenticated;
revoke all on function public.touch_updated_at()
  from public, anon, authenticated;

grant execute on function public.record_login(text, text) to service_role;
grant execute on function public.increment_post_views(text) to service_role;
grant execute on function public.community_top_members(integer) to service_role;
grant execute on function public.community_resolve_handles(text[]) to service_role;
grant execute on function public.add_xp(text, integer) to service_role;
grant execute on function public.weekly_leaderboard(timestamptz) to service_role;
grant execute on function public.touch_updated_at() to service_role;

-- Future public-schema objects start private. Migrations that intentionally add
-- an RPC must grant service_role explicitly in the same transaction.
alter default privileges in schema public
  revoke all privileges on tables from public, anon, authenticated;
alter default privileges in schema public
  revoke all privileges on sequences from public, anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- Storage is also server-mediated. course-assets stays private and supports the
-- app's largest signed lesson upload. figures is intentionally public for
-- rendered question, avatar, flashcard, and community images, while its 10 MiB
-- ceiling accommodates trusted content imports (user routes enforce 4-5 MiB).
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'course-assets',
    'course-assets',
    false,
    524288000,
    array[
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/zip',
      'text/plain',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'audio/mpeg',
      'audio/mp4',
      'audio/wav',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]::text[]
  ),
  (
    'figures',
    'figures',
    true,
    10485760,
    array[
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/svg+xml'
    ]::text[]
  )
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Restrictive policies remain effective even if a broad permissive Storage
-- policy is added later. Service-role uploads and signed-upload redemption run
-- with Storage's superuser context and are intentionally unaffected.
drop policy if exists "course assets require server mediation" on storage.objects;
create policy "course assets require server mediation"
on storage.objects
as restrictive
for all
to anon, authenticated
using (bucket_id <> 'course-assets')
with check (bucket_id <> 'course-assets');

drop policy if exists "figures require server mediation" on storage.objects;
create policy "figures require server mediation"
on storage.objects
as restrictive
for all
to anon, authenticated
using (bucket_id <> 'figures')
with check (bucket_id <> 'figures');

notify pgrst, 'reload schema';
