import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { HubUser } from '@/lib/types';

interface AuthContextValue {
  session: Session | null;
  authUser: SupabaseUser | null;
  user: HubUser | null;
  hubUser: HubUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshHubUser: () => Promise<void>;
  devViewAs: 'owner' | 'admin' | 'contractor' | null;
  setDevViewAs: (role: 'owner' | 'admin' | 'contractor' | null) => void;
  effectiveRole: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authUser, setAuthUser] = useState<SupabaseUser | null>(null);
  const [hubUser, setHubUser] = useState<HubUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [devViewAs, setDevViewAs] = useState<'owner' | 'admin' | 'contractor' | null>(null);
  const mountedRef = useRef(true);
  const hubUserLoadedRef = useRef(false);

  const loadHubUser = async (userId: string): Promise<HubUser | null> => {
    try {
      const { data } = await supabase
        .from('hub_users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      return data ?? null;
    } catch {
      return null;
    }
  };

  const refreshHubUser = async () => {
    if (!authUser) return;
    const data = await loadHubUser(authUser.id);
    if (mountedRef.current) setHubUser(data);
  };

  useEffect(() => {
    mountedRef.current = true;

    const timeout = setTimeout(() => {
      if (mountedRef.current) setLoading(false);
    }, 8000);

    // Initial session load — single source of truth for first render
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (!mountedRef.current) return;
      setSession(s);
      setAuthUser(s?.user ?? null);
      if (s?.user) {
        const profile = await loadHubUser(s.user.id);
        if (mountedRef.current) {
          setHubUser(profile);
          hubUserLoadedRef.current = true;
        }
      }
      clearTimeout(timeout);
      if (mountedRef.current) setLoading(false);
    }).catch(() => {
      clearTimeout(timeout);
      if (mountedRef.current) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (!mountedRef.current) return;

      // Token refresh / user update — just update session, never clear hubUser
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setSession(s);
        setAuthUser(s?.user ?? null);
        return;
      }

      // Explicit sign-out
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setAuthUser(null);
        setHubUser(null);
        hubUserLoadedRef.current = false;
        if (mountedRef.current) setLoading(false);
        return;
      }

      // SIGNED_IN or INITIAL_SESSION — only load hub profile if not already loaded
      setSession(s);
      setAuthUser(s?.user ?? null);
      if (s?.user && !hubUserLoadedRef.current) {
        const profile = await loadHubUser(s.user.id);
        if (mountedRef.current) {
          setHubUser(profile);
          hubUserLoadedRef.current = true;
        }
      }
      if (mountedRef.current) setLoading(false);
    });

    return () => {
      mountedRef.current = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    hubUserLoadedRef.current = false;
    await supabase.auth.signOut();
  };

  const effectiveRole = hubUser?.is_developer && devViewAs ? devViewAs : hubUser?.role ?? null;

  return (
    <AuthContext.Provider value={{ session, authUser, user: hubUser, hubUser, loading, signIn, signOut, refreshHubUser, devViewAs, setDevViewAs, effectiveRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
