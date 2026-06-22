-- Add employee_id column to hub_users
ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS employee_id text UNIQUE;

-- Sequence tracks the global employee number; starts at 22 (FS26021 = Irvin is the last assigned)
CREATE SEQUENCE IF NOT EXISTS employee_id_seq START WITH 22;

-- Function: auto-generate {PREFIX}{YY}{NNN} if employee_id not provided
-- admin/owner role → ADHR prefix; everyone else → FS
CREATE OR REPLACE FUNCTION generate_employee_id()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  prefix text;
BEGIN
  IF NEW.employee_id IS NULL THEN
    IF NEW.role = 'owner' THEN
      prefix := 'AR';
    ELSIF NEW.role = 'admin' THEN
      prefix := 'ADHR';
    ELSE
      prefix := 'FS';
    END IF;
    NEW.employee_id := prefix || TO_CHAR(NOW(), 'YY') || LPAD(nextval('employee_id_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- RPC: preview what the next employee ID will be for a given role (does not consume the sequence)
CREATE OR REPLACE FUNCTION preview_next_employee_id(p_role text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  prefix text;
  next_num bigint;
BEGIN
  IF p_role = 'owner' THEN prefix := 'AR';
  ELSIF p_role = 'admin' THEN prefix := 'ADHR';
  ELSE prefix := 'FS';
  END IF;

  SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END
    INTO next_num FROM employee_id_seq;

  RETURN prefix || TO_CHAR(NOW(), 'YY') || LPAD(next_num::text, 3, '0');
END;
$$;

DROP TRIGGER IF EXISTS set_employee_id ON hub_users;
CREATE TRIGGER set_employee_id
  BEFORE INSERT ON hub_users
  FOR EACH ROW EXECUTE FUNCTION generate_employee_id();


