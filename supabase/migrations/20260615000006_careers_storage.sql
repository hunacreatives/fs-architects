-- Create storage bucket for career application files
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'careers',
  'careers',
  false,
  10485760, -- 10MB
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','application/zip']
)
on conflict (id) do nothing;

-- Allow the service role full access (edge functions use service role)
create policy "service role full access on careers"
  on storage.objects for all
  to service_role
  using (bucket_id = 'careers')
  with check (bucket_id = 'careers');
