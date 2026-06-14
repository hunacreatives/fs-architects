import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  (import.meta.env.VITE_PUBLIC_SUPABASE_URL as string)
  || (import.meta.env.VITE_SUPABASE_URL as string)
  || '';
const supabaseAnonKey =
  (import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string)
  || (import.meta.env.VITE_SUPABASE_ANON_KEY as string)
  || '';

export const supabaseAnonKey_ = supabaseAnonKey;
export const supabaseUrl_ = supabaseUrl;
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function getSupabaseProjectRef() {
  try {
    const hostname = new URL(supabaseUrl).hostname;
    return hostname.split('.')[0] || '';
  } catch {
    return '';
  }
}

// IndexedDB-backed storage so iOS PWAs don't lose the session when
// the OS evicts localStorage (happens after ~7 days of inactivity).
const IDB_NAME = 'sentro-auth';
const IDB_STORE = 'kv';

function openAuthDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const idbStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const db = await openAuthDb();
      return await new Promise((resolve, reject) => {
        const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return window.localStorage.getItem(key);
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      const db = await openAuthDb();
      await new Promise<void>((resolve, reject) => {
        const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      window.localStorage.setItem(key, value);
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      const db = await openAuthDb();
      await new Promise<void>((resolve, reject) => {
        const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      window.localStorage.removeItem(key);
    }
  },
};

export function clearSupabaseAuthStorage() {
  if (typeof window === 'undefined') return;

  const projectRef = getSupabaseProjectRef();
  const candidates = new Set<string>();

  if (projectRef) {
    candidates.add(`sb-${projectRef}-auth-token`);
    candidates.add(`sb-${projectRef}-auth-token-code-verifier`);
  }

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith('sb-') && (key.endsWith('-auth-token') || key.endsWith('-auth-token-code-verifier'))) {
      candidates.add(key);
    }
  }

  for (let i = 0; i < window.sessionStorage.length; i += 1) {
    const key = window.sessionStorage.key(i);
    if (key && key.startsWith('sb-') && (key.endsWith('-auth-token') || key.endsWith('-auth-token-code-verifier'))) {
      candidates.add(key);
    }
  }

  candidates.forEach((key) => {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
    idbStorage.removeItem(key).catch(() => {});
  });
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof indexedDB !== 'undefined' ? idbStorage : undefined,
  },
});
