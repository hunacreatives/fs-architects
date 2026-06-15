alter table public.hub_sign_documents
  alter column file_url drop not null,
  alter column file_name drop not null;
