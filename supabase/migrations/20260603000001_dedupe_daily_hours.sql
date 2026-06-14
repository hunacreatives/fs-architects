with ranked as (
  select
    ctid,
    row_number() over (
      partition by user_id, date
      order by
        coalesce(hours_capped, 0) desc,
        coalesce(hours_raw, 0) desc,
        coalesce(overtime_hours, 0) desc,
        coalesce(updated_at, 'epoch'::timestamptz) desc,
        ctid desc
    ) as rn
  from public.hub_daily_hours
)
delete from public.hub_daily_hours h
using ranked r
where h.ctid = r.ctid
  and r.rn > 1;

create unique index if not exists hub_daily_hours_user_id_date_key
  on public.hub_daily_hours (user_id, date);
