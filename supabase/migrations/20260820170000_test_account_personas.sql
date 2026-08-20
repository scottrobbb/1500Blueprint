alter table public.users add column if not exists is_test_account boolean not null default false;
alter table public.users add column if not exists test_persona text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_test_persona_check'
  ) then
    alter table public.users add constraint users_test_persona_check
      check (test_persona is null or test_persona in ('free', 'core', 'max', 'suspended'));
  end if;
end
$$;

create index if not exists users_test_accounts_idx
  on public.users(is_test_account)
  where is_test_account = true;

comment on column public.users.is_test_account is
  'Marks production QA personas so they can be tagged and excluded from business reporting.';
