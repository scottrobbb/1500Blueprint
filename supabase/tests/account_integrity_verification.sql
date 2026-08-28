-- Read-only post-deploy verification for account and billing identity integrity.
-- Run with a database-owner connection after all security migrations.

do $verification$
declare
  v_health jsonb;
  v_key text;
  v_value bigint;
  v_constraint_valid boolean;
begin
  select public.get_billing_integrity_health() into v_health;

  foreach v_key in array array[
    'duplicateNormalizedEmailGroups',
    'authIdentityEmailMismatches',
    'subscriptionCustomerMismatches',
    'duplicateActiveSubscriptionGroups',
    'invalidSubscriptionPlans',
    'invalidSubscriptionStatuses',
    'failedWebhookEvents',
    'expiredWebhookLeases'
  ]::text[] loop
    if not (v_health ? v_key) then
      raise exception 'Account integrity verification: health result omitted %', v_key;
    end if;
    v_value := (v_health ->> v_key)::bigint;
    if v_value <> 0 then
      raise exception 'Account integrity verification: % is %', v_key, v_value;
    end if;
  end loop;

  if exists (
    select 1
      from public.users
     where email is distinct from lower(trim(email))
  ) then
    raise exception 'Account integrity verification: a noncanonical account email remains';
  end if;

  if not exists (
    select 1
      from pg_index index_meta
      join pg_class index_relation on index_relation.oid = index_meta.indexrelid
     where index_meta.indrelid = 'public.users'::regclass
       and index_relation.relname = 'users_normalized_email_idx'
       and index_meta.indisunique
       and pg_get_indexdef(index_meta.indexrelid) ~* 'lower\(.*trim.*email'
  ) then
    raise exception 'Account integrity verification: normalized-email unique index is missing';
  end if;

  select convalidated
    into v_constraint_valid
    from pg_constraint
   where conrelid = 'public.users'::regclass
     and conname = 'users_email_canonical_check';
  if v_constraint_valid is distinct from true then
    raise exception 'Account integrity verification: canonical-email constraint is missing or unvalidated';
  end if;
end
$verification$;

select 'verified' as account_integrity_status;
