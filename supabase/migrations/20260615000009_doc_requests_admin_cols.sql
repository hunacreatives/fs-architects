alter table public.hub_doc_requests
  add column if not exists admin_notes text,
  add column if not exists file_name text,
  add column if not exists file_url text,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists pickup_notified_at timestamptz;
