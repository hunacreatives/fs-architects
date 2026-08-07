// Teams are managed by owner/admin via the Manage Teams page (hub_teams
// table) — not hardcoded. This module keeps a small in-memory cache so
// synchronous lookups (teamMeta, color dots) work anywhere without every
// call site needing its own fetch; call loadTeams() once per page (in a
// useEffect) to populate/refresh it.

import { supabase } from '@/lib/supabase';

export interface TeamMeta {
  key: string;
  label: string;
  leadId: string | null;
  leadName: string | null;
  color: string;
}

let cache: TeamMeta[] = [];

export function getCachedTeams(): TeamMeta[] {
  return cache;
}

export async function loadTeams(): Promise<TeamMeta[]> {
  const { data, error } = await supabase
    .from('hub_teams')
    .select('key, label, color, lead_id, hub_users!lead_id(full_name)')
    .order('label');
  if (error) {
    console.error('Failed to load teams:', error);
    return cache;
  }
  cache = (data ?? []).map((t: any) => ({
    key: t.key,
    label: t.label,
    leadId: t.lead_id,
    leadName: t.hub_users?.full_name ?? null,
    color: t.color,
  }));
  return cache;
}

export function teamMeta(key: string | null | undefined): TeamMeta | null {
  if (!key) return null;
  return cache.find(t => t.key === key) ?? null;
}
