import { supabase } from '@/lib/supabase';

// Sensitive hub_users columns are no longer directly readable (see migration
// 20260624000008). They are served through the get_user_finance RPC, which only
// returns rows the caller is authorized to see (own row, or all for admin/hr).
export interface UserFinance {
  id: string;
  payment_type: string | null;
  hourly_rate: number | null;
  monthly_rate: number | null;
  currency: string | null;
  payment_method: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_account_type: string | null;
  project_percentage: number | null;
  notes: string | null;
}

// Returns a map keyed by user id. Pass specific ids, or omit for "all I can see".
// Degrades to an empty map on error (e.g. before the migration is applied), so
// callers that still read inline columns keep working.
export async function fetchUserFinanceMap(ids?: string[]): Promise<Record<string, UserFinance>> {
  const { data, error } = await supabase.rpc('get_user_finance', ids?.length ? { p_ids: ids } : {});
  if (error) { console.error('get_user_finance error:', JSON.stringify(error)); return {}; }
  if (!data) return {};
  const map: Record<string, UserFinance> = {};
  for (const row of data as UserFinance[]) map[row.id] = row;
  return map;
}

// Merge finance fields into user-like objects by id. Leaves objects untouched
// when the RPC returned no row for that id.
export function mergeFinance<T extends { id: string }>(users: T[], finance: Record<string, UserFinance>): T[] {
  return users.map((u) => (finance[u.id] ? { ...u, ...finance[u.id] } : u));
}
