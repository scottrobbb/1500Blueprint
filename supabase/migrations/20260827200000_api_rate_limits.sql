-- Atomic, server-only fixed-window limits for abuse-sensitive API routes.
-- Keys are SHA-256 hashes so email addresses and client IPs are never stored.

create table if not exists public.api_rate_limits (
  key_hash text primary key check (length(key_hash) = 64),
  request_count integer not null check (request_count >= 0),
  window_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists api_rate_limits_expiry_idx
  on public.api_rate_limits (window_expires_at);

alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.api_rate_limits to service_role;

create or replace function public.consume_api_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.api_rate_limits%rowtype;
begin
  if p_key_hash !~ '^[0-9a-f]{64}$'
     or p_limit < 1 or p_limit > 10000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit arguments';
  end if;

  insert into public.api_rate_limits as limits (
    key_hash,
    request_count,
    window_expires_at,
    updated_at
  ) values (
    p_key_hash,
    1,
    v_now + make_interval(secs => p_window_seconds),
    v_now
  )
  on conflict (key_hash) do update set
    request_count = case
      when limits.window_expires_at <= v_now then 1
      else limits.request_count + 1
    end,
    window_expires_at = case
      when limits.window_expires_at <= v_now
        then v_now + make_interval(secs => p_window_seconds)
      else limits.window_expires_at
    end,
    updated_at = v_now
  returning * into v_row;

  -- Amortized retention: ~1% of requests delete at most 100 stale rows through
  -- the expiry index, avoiding a synchronous full-table cleanup on hot paths.
  if random() < 0.01 then
    with expired as (
      select key_hash
      from public.api_rate_limits
      where window_expires_at < v_now - interval '1 day'
      order by window_expires_at
      limit 100
    )
    delete from public.api_rate_limits limits
    using expired
    where limits.key_hash = expired.key_hash;
  end if;

  return jsonb_build_object(
    'allowed', v_row.request_count <= p_limit,
    'used', v_row.request_count,
    'limit', p_limit,
    'resetsAt', v_row.window_expires_at
  );
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer)
  to service_role;
