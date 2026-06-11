create table if not exists hub_performance_reviews (
  id bigserial primary key,
  contractor_id uuid not null references hub_users(id) on delete cascade,
  reviewer_id uuid references hub_users(id) on delete set null,
  period_label text not null, -- e.g. "Q2 2026", "May 2026"
  overall_rating integer check (overall_rating between 1 and 5),
  attendance_rating integer check (attendance_rating between 1 and 5),
  quality_rating integer check (quality_rating between 1 and 5),
  communication_rating integer check (communication_rating between 1 and 5),
  initiative_rating integer check (initiative_rating between 1 and 5),
  strengths text,
  improvements text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table hub_performance_reviews enable row level security;

create policy "admins manage reviews" on hub_performance_reviews
  for all to authenticated
  using (
    exists (select 1 from hub_users where id = auth.uid() and role in ('admin','owner','hr'))
    or contractor_id = auth.uid()
  )
  with check (
    exists (select 1 from hub_users where id = auth.uid() and role in ('admin','owner','hr'))
  );
