create or replace function public.record_password_login(
  p_auth_user_id uuid,
  p_email text,
  p_display_name text default null,
  p_allow_create boolean default false
)
returns table (
  id text,
  email text,
  plan text,
  auth_user_id uuid,
  account_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(p_email));
  verified_auth_email text;
  auth_email_confirmed_at timestamptz;
  existing_auth_user_id uuid;
  existing_email text;
  existing_user_id text;
begin
  if p_auth_user_id is null or normalized_email = '' then
    raise exception 'A verified auth user and email are required';
  end if;

  select lower(trim(au.email)), au.email_confirmed_at
    into verified_auth_email, auth_email_confirmed_at
    from auth.users au
   where au.id = p_auth_user_id;

  if verified_auth_email is null
    or auth_email_confirmed_at is null
    or verified_auth_email <> normalized_email then
    raise exception 'The auth identity does not own this verified email';
  end if;

  select u.email
    into existing_email
    from public.users u
   where u.auth_user_id = p_auth_user_id
   for update;

  if existing_email is not null and existing_email <> normalized_email then
    raise exception 'This auth identity is already linked to another account';
  end if;

  select u.id, u.auth_user_id
    into existing_user_id, existing_auth_user_id
    from public.users u
   where u.email = normalized_email
   for update;

  if existing_auth_user_id is not null and existing_auth_user_id <> p_auth_user_id then
    raise exception 'This email is already linked to another auth identity';
  end if;

  if existing_user_id is null and not p_allow_create then
    raise exception 'No existing student account can be linked to this identity';
  end if;

  insert into public.users as account (
    email,
    plan,
    auth_user_id,
    name,
    login_count,
    last_login_at,
    updated_at
  )
  values (
    normalized_email,
    'free',
    p_auth_user_id,
    nullif(trim(p_display_name), ''),
    1,
    now(),
    now()
  )
  on conflict on constraint users_email_key do update
    set auth_user_id = p_auth_user_id,
        name = coalesce(nullif(trim(p_display_name), ''), account.name),
        login_count = account.login_count + 1,
        last_login_at = now(),
        updated_at = now()
  returning
    account.id,
    account.email,
    account.plan,
    account.auth_user_id,
    account.account_status
  into id, email, plan, auth_user_id, account_status;

  return next;
end;
$$;

revoke all on function public.record_password_login(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_password_login(uuid, text, text, boolean) to service_role;
