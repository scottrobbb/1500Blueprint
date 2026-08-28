-- The application treats email as an account identity. PostgreSQL's ordinary
-- text uniqueness is case-sensitive, so enforce the same trimmed/lowercase
-- identity that auth, billing, progress, and access checks use.

do $integrity$
declare
  v_noncanonical bigint;
  v_duplicate_groups bigint;
begin
  select count(*)
    into v_noncanonical
    from public.users
   where email is distinct from lower(trim(email));

  select count(*)
    into v_duplicate_groups
    from (
      select lower(trim(email))
        from public.users
       group by lower(trim(email))
      having count(*) > 1
    ) duplicates;

  if v_noncanonical <> 0 or v_duplicate_groups <> 0 then
    raise exception using
      errcode = '23505',
      message = format(
        'Account email integrity failed: %s noncanonical rows and %s duplicate normalized groups',
        v_noncanonical,
        v_duplicate_groups
      ),
      hint = 'Merge affected accounts and preserve their email-owned progress before retrying this migration.';
  end if;
end
$integrity$;

create unique index if not exists users_normalized_email_idx
  on public.users (lower(trim(email)));

do $constraint$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.users'::regclass
       and conname = 'users_email_canonical_check'
  ) then
    alter table public.users
      add constraint users_email_canonical_check
      check (
        email = lower(trim(email))
        and length(email) between 3 and 254
        and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      ) not valid;
  end if;
end
$constraint$;

alter table public.users
  validate constraint users_email_canonical_check;

comment on index public.users_normalized_email_idx is
  'Prevents case/whitespace variants from creating multiple Blueprint identities.';
