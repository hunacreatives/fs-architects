-- Split appraisal permissions by role: only the owner (Fretz) creates, rates,
-- sends, and deletes appraisals. HR (Francis Yu) can only complete the
-- HR-review step, and only once an appraisal has reached that stage. A plain
-- admin can view (and print) but cannot do the appraisal itself.

drop policy if exists "admins manage appraisals" on hub_appraisals;

create policy "leadership view appraisals" on hub_appraisals
  for select to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role in ('admin', 'owner', 'hr')));

create policy "owner creates appraisals" on hub_appraisals
  for insert to authenticated
  with check (exists (select 1 from hub_users where id = auth.uid() and role = 'owner'));

create policy "owner edits appraisals" on hub_appraisals
  for update to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role = 'owner'))
  with check (exists (select 1 from hub_users where id = auth.uid() and role = 'owner'));

create policy "owner deletes appraisals" on hub_appraisals
  for delete to authenticated
  using (exists (select 1 from hub_users where id = auth.uid() and role = 'owner'));

create policy "hr completes review" on hub_appraisals
  for update to authenticated
  using (
    exists (select 1 from hub_users where id = auth.uid() and role = 'hr')
    and status = 'awaiting_hr'
  )
  with check (
    exists (select 1 from hub_users where id = auth.uid() and role = 'hr')
    and status in ('awaiting_hr', 'completed')
  );
