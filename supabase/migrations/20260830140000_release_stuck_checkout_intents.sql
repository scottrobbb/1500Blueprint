-- A checkout POST claims a reservation before doing any Stripe work (ensureCustomer,
-- resolvePrice, createCheckout). If any of that later throws, the reservation was left
-- behind in 'creating' status with no Stripe session ever attached, and
-- claim_billing_checkout_intent treats it as a live in-progress checkout for up to its
-- 5-minute lease -- surfacing "A different Checkout session is still open" to a student
-- who never actually reached Stripe. This lets the checkout route release that exact
-- half-claimed reservation immediately so the very next attempt can reclaim it.
create or replace function public.release_billing_checkout_intent(
  p_user_id text,
  p_livemode boolean,
  p_reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_released boolean;
begin
  update public.billing_checkout_intents intent
     set status = 'expired',
         stripe_checkout_session_url = null,
         updated_at = now()
   where intent.user_id = p_user_id
     and intent.livemode = p_livemode
     and intent.reservation_id = p_reservation_id
     and intent.status = 'creating';
  v_released := found;
  return v_released;
end;
$$;

revoke all on function public.release_billing_checkout_intent(text, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.release_billing_checkout_intent(text, boolean, uuid)
  to service_role;
