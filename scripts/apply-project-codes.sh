#!/bin/bash
# One-shot setup for the project-code feature (FS-{TYPE}-{YY}-{NNN}).
# Safe to re-run — every statement is idempotent (create if not exists / or replace).
set -e

cd "$(dirname "$0")/.."

echo "1/3 — Applying migration + RLS + security-definer fix..."
supabase db query "$(cat supabase/migrations/20260804000001_project_type_code.sql)" --linked
supabase db query "alter table hub_project_code_sequences enable row level security;" --linked
supabase db query "alter function generate_project_code() security definer set search_path = public;" --linked

echo "2/3 — Deploying rename-project-drive-folder..."
supabase functions deploy rename-project-drive-folder

echo "3/3 — Deploying create-project-drive-folder..."
supabase functions deploy create-project-drive-folder

echo "Done. Verify with:"
echo "  supabase db query \"select id, project_name, project_type_code, project_code from hub_projects order by id;\" --linked"
