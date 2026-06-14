alter table hub_invoice_log add column if not exists settled boolean not null default false;
alter table hub_invoice_log add column if not exists settled_at timestamptz;

create index if not exists hub_invoice_log_settled_idx on hub_invoice_log(settled);
