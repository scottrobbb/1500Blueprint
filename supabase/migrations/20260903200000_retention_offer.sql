-- One-time cancellation save offer.
--
-- A student who confirms they want to cancel is offered 40% off their next
-- renewal, once, ever. "Once, ever" is the whole point: the two columns live on
-- the user rather than on a subscription so cancelling, resubscribing, or
-- changing plans cannot reset the entitlement, and a second device cannot see
-- an offer the first already spent.
--
-- retention_offer_shown_at is set the moment the offer is put in front of them,
-- which is what burns it — declining costs the offer just as accepting does.
-- retention_offer_accepted_at doubles as the in-flight lock for applying the
-- coupon, so a double-click cannot discount a subscription twice.

alter table public.users add column if not exists retention_offer_shown_at timestamptz;
alter table public.users add column if not exists retention_offer_accepted_at timestamptz;

comment on column public.users.retention_offer_shown_at is
  'Set once, when the cancellation save offer is first displayed. Non-null means the student is no longer eligible to be shown it, whether they accepted or declined.';
comment on column public.users.retention_offer_accepted_at is
  'Set once, when the student accepts the save offer. Claimed before the Stripe call and released again if that call fails, so it is also the duplicate-request lock.';

-- Claims one step of the offer for a user, under a row lock so concurrent
-- requests serialize instead of both winning. 'show' burns the offer; 'accept'
-- claims the right to apply the coupon. Only a 'granted' decision may act.
create or replace function public.claim_retention_offer(
  p_user_id text,
  p_action text
)
returns table(
  decision text,
  shown_at timestamptz,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
begin
  if p_user_id is null or p_user_id = '' or length(p_user_id) > 128 then
    raise exception 'A valid billing account is required';
  end if;
  if p_action not in ('show', 'accept') then
    raise exception 'Unknown retention offer action';
  end if;

  select account.* into v_user
    from public.users account
   where account.id = p_user_id
     for update;

  if not found then
    raise exception 'The billing account was not found';
  end if;
  if v_user.account_status <> 'active' then
    raise exception 'The billing account is not active';
  end if;

  if p_action = 'show' then
    if v_user.retention_offer_shown_at is not null then
      return query select 'already_shown'::text, v_user.retention_offer_shown_at, v_user.retention_offer_accepted_at;
      return;
    end if;

    update public.users
       set retention_offer_shown_at = now(), updated_at = now()
     where id = p_user_id
     returning users.retention_offer_shown_at, users.retention_offer_accepted_at
      into v_user.retention_offer_shown_at, v_user.retention_offer_accepted_at;

    return query select 'granted'::text, v_user.retention_offer_shown_at, v_user.retention_offer_accepted_at;
    return;
  end if;

  -- accept
  if v_user.retention_offer_accepted_at is not null then
    return query select 'already_accepted'::text, v_user.retention_offer_shown_at, v_user.retention_offer_accepted_at;
    return;
  end if;
  if v_user.retention_offer_shown_at is null then
    return query select 'not_offered'::text, v_user.retention_offer_shown_at, v_user.retention_offer_accepted_at;
    return;
  end if;

  update public.users
     set retention_offer_accepted_at = now(), updated_at = now()
   where id = p_user_id
   returning users.retention_offer_shown_at, users.retention_offer_accepted_at
    into v_user.retention_offer_shown_at, v_user.retention_offer_accepted_at;

  return query select 'granted'::text, v_user.retention_offer_shown_at, v_user.retention_offer_accepted_at;
end;
$$;

-- Undoes an acceptance claim whose Stripe call never landed, so a student is
-- not charged full price because of a network blip. Only ever called by the
-- request that won the claim, which is why it needs no further guard.
create or replace function public.release_retention_offer_acceptance(p_user_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.users
     set retention_offer_accepted_at = null, updated_at = now()
   where id = p_user_id;
$$;

revoke all on function public.claim_retention_offer(text, text) from anon, authenticated;
revoke all on function public.release_retention_offer_acceptance(text) from anon, authenticated;
