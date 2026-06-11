alter table public.hub_sign_documents add column if not exists amendment_type text default 'initial';
-- initial, rate_amendment, scope_change, renewal, other
alter table public.hub_sign_documents add column if not exists rate_snapshot numeric;
