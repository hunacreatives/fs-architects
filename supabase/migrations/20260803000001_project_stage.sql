alter table hub_projects
  add column if not exists stage text not null default 'Pre-Design'
  check (stage in (
    'Pre-Design',
    'Schematic Design',
    'Design Development',
    'Construction Documents',
    'Permitting',
    'Bidding/Procurement',
    'Construction Administration',
    'Post-Construction/Closeout'
  ));
