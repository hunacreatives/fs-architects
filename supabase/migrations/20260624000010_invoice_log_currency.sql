-- W-14: hub_invoice_log never stored the invoice currency, so the log UI showed
-- ₱ for every invoice including USD ones. Add a currency column (default PHP for
-- existing rows) which send-invoice now populates.
alter table public.hub_invoice_log
  add column if not exists currency text not null default 'PHP' check (currency in ('PHP', 'USD'));
