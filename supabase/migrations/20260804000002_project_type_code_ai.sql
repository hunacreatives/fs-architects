-- Rename the Architectural Interiors type code from INT to AI.
-- Run as separate statements (not one transaction) since dropping and
-- re-adding the constraint in the same batch fails validation against rows
-- still holding the old 'INT' value — those need to be migrated in between.

alter table hub_projects drop constraint if exists hub_projects_project_type_code_check;

update hub_projects set project_type_code = 'AI' where project_type_code = 'INT';

alter table hub_projects add constraint hub_projects_project_type_code_check
  check (project_type_code in ('RES','COM','IND','INST','AGR','MIX','REN','ADD','AI','SITE'));
