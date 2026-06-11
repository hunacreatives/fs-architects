alter table public.hub_sign_documents add column if not exists content text;
alter table public.hub_sign_documents add column if not exists is_generated boolean default false;
