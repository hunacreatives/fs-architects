-- Internal notes on an appraisal — visible/editable by owner/admin/hr only,
-- never returned to the employee (get_my_appraisals() doesn't select this
-- column at all, so there's nothing to accidentally leak). Separate from
-- comments_recommendations, which the employee does see once results are
-- sent.

alter table hub_appraisals add column if not exists internal_notes text;

-- Scoped write so this doesn't require broadening the existing owner/hr
-- UPDATE policies (which intentionally restrict who can touch what, when) —
-- any leadership role can save a note, at any stage of the workflow.
create or replace function public.save_appraisal_internal_note(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from hub_users where hub_users.id = auth.uid() and hub_users.role in ('admin', 'owner', 'hr')) then
    raise exception 'Admin, HR, or owner access required.';
  end if;

  update hub_appraisals
  set internal_notes = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
  where hub_appraisals.id = p_id;

  if not found then
    raise exception 'Appraisal not found';
  end if;
end;
$$;

revoke all on function public.save_appraisal_internal_note(uuid, text) from public, anon;
grant execute on function public.save_appraisal_internal_note(uuid, text) to authenticated;
