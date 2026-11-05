-- Website content managed from the hub (Admin → Website): projects, team, homepage hero, contact details, job posts.
-- The public site reads published rows; owner/admin/HR (is_hub_admin) manage them. The site keeps showing its built-in
-- content until the hub imports a section (site_settings 'live'), so running this changes nothing on the live site.
-- Text that the site shows in three languages lives in i18n jsonb: {"en": {...}, "es": {...}, "zh": {...}}; a blank
-- Spanish or Chinese field falls back to English. Safe to run more than once.

create table if not exists site_projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  sort_order int not null default 0,
  published boolean not null default true,
  year text not null default '',
  location text not null default '',          -- the map city it pins to (CDO, Cebu, Manila, …)
  lat double precision,
  lng double precision,
  category text not null default '',          -- the projects page filter: Residential, Retail, Hospitality, …
  thumb text not null default '',
  hero text not null default '',
  main_image text not null default '',
  gallery text[] not null default '{}',
  floor_plans jsonb not null default '[]',    -- [{"image": "...", "label": {"en": "", "es": "", "zh": ""}}]
  video text not null default '',             -- optional card video (webm) and its mp4
  video_mp4 text not null default '',
  floors text not null default '',
  plot_area text not null default '',
  built_area text not null default '',
  i18n jsonb not null default '{}',           -- name, address, category, description, quote
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists site_team (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  sort_order int not null default 0,
  published boolean not null default true,
  photo text not null default '',
  photo_shift text not null default '',       -- how far the portrait sits up or down in its card, e.g. -18%
  photo_shift_x text not null default '',     -- and left or right
  photo_scale numeric,
  credentials jsonb not null default '[]',    -- [{"label": "Role", "value": "Design Lead"}]
  i18n jsonb not null default '{}',           -- name, title, bio
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists site_hero_slides (
  id uuid primary key default gen_random_uuid(),
  sort_order int not null default 0,
  published boolean not null default true,
  image text not null,
  video text not null default '',
  video_mp4 text not null default '',
  title text not null default '',
  location text not null default '',
  year text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists site_settings (
  key text primary key,                       -- 'contact': {"email", "phone", "address": {en, es, zh}, "socials": [...]}
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists hub_job_postings (
  id uuid primary key default gen_random_uuid(),
  sort_order int not null default 0,
  published boolean not null default true,
  i18n jsonb not null default '{}',           -- title, type, location, department, summary, responsibilities[], requirements[]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['site_projects', 'site_team', 'site_hero_slides', 'hub_job_postings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "Public reads published" on %I', t);
    execute format('create policy "Public reads published" on %I for select using (published or is_hub_admin())', t);
    execute format('drop policy if exists "Admins manage" on %I', t);
    execute format('create policy "Admins manage" on %I for all using (is_hub_admin()) with check (is_hub_admin())', t);
  end loop;
end $$;

alter table site_settings enable row level security;
drop policy if exists "Public reads settings" on site_settings;
create policy "Public reads settings" on site_settings for select using (true);
drop policy if exists "Admins manage settings" on site_settings;
create policy "Admins manage settings" on site_settings for all using (is_hub_admin()) with check (is_hub_admin());

-- Images and films uploaded from the hub. Public to read (the website shows them); only admins write.
insert into storage.buckets (id, name, public) values ('site-media', 'site-media', true)
on conflict (id) do update set public = true;
drop policy if exists "Site media admins upload" on storage.objects;
create policy "Site media admins upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and is_hub_admin());
drop policy if exists "Site media admins update" on storage.objects;
create policy "Site media admins update" on storage.objects for update to authenticated
  using (bucket_id = 'site-media' and is_hub_admin());
drop policy if exists "Site media admins delete" on storage.objects;
create policy "Site media admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and is_hub_admin());
