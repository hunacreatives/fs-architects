-- C-14: The "Public read by token" policy used USING (true), exposing every
-- questionnaire row (client names, emails, all answers, tokens) to anonymous
-- users. The public /q page only ever needs the single row matching a token, so
-- we remove anonymous direct table access and serve that one row through a
-- SECURITY DEFINER RPC that filters by token. Submission goes through a second
-- RPC that only flips a 'sent' row to 'submitted'.

drop policy if exists "Public read by token" on hub_questionnaires;
drop policy if exists "Public submit by token" on hub_questionnaires;

-- Read a single questionnaire by its token. Drafts are not returned (the public
-- page treats them as not-found). Sensitive columns (client_email, created_by)
-- are intentionally excluded.
create or replace function public.get_questionnaire_by_token(p_token uuid)
returns table (
  id bigint,
  service_type text,
  client_name text,
  token uuid,
  status text,
  questions jsonb,
  intro_message text
)
language sql
security definer
set search_path = public
stable
as $$
  select id, service_type, client_name, token, status, questions, intro_message
  from hub_questionnaires
  where token = p_token
    and status in ('sent', 'submitted');
$$;

grant execute on function public.get_questionnaire_by_token(uuid) to anon, authenticated;

-- Submit answers for a 'sent' questionnaire identified by token. No-op-guarded so
-- a token can only be submitted once and only while it is in the 'sent' state.
create or replace function public.submit_questionnaire(p_token uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update hub_questionnaires
    set answers = p_answers,
        status = 'submitted',
        submitted_at = now()
  where token = p_token
    and status = 'sent';
  if not found then
    raise exception 'Questionnaire is not available for submission.';
  end if;
end;
$$;

grant execute on function public.submit_questionnaire(uuid, jsonb) to anon, authenticated;
