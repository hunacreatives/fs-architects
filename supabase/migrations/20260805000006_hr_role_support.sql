-- 'hr' was never a real selectable role in the Add Employee UI (the dropdown
-- only offered Employee/"HR / Admin"/Owner, with "HR / Admin" mapping to the
-- 'admin' role) even though the appraisal system's HR-review step, the
-- ADHR employee-id prefix, and payroll checks all specifically look for
-- role = 'hr' as its own value. Now that the UI offers a real HR option,
-- give it the same ADHR prefix admin gets (the prefix already stands for
-- "Admin/HR").

create or replace function generate_employee_id()
returns trigger language plpgsql as $$
declare
  prefix text;
begin
  if new.employee_id is null then
    if new.role = 'owner' then
      prefix := 'AR';
    elsif new.role in ('admin', 'hr') then
      prefix := 'ADHR';
    else
      prefix := 'FS';
    end if;
    new.employee_id := prefix || to_char(now(), 'YY') || lpad(nextval('employee_id_seq')::text, 3, '0');
  end if;
  return new;
end;
$$;

create or replace function preview_next_employee_id(p_role text)
returns text language plpgsql security definer as $$
declare
  prefix text;
  next_num bigint;
begin
  if p_role = 'owner' then prefix := 'AR';
  elsif p_role in ('admin', 'hr') then prefix := 'ADHR';
  else prefix := 'FS';
  end if;

  select case when is_called then last_value + 1 else last_value end
    into next_num from employee_id_seq;

  return prefix || to_char(now(), 'YY') || lpad(next_num::text, 3, '0');
end;
$$;
