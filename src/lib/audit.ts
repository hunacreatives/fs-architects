import { supabase } from './supabase';

export async function logAudit(params: {
  actor_id?: string;
  actor_name?: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  await supabase.from('hub_audit_log').insert(params);
}
