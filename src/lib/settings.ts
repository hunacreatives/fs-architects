import { supabase } from './supabase';

export async function getSetting(key: string, fallback: string): Promise<string> {
  const { data } = await supabase.from('hub_settings').select('value').eq('key', key).single();
  return data?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await supabase.from('hub_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}
