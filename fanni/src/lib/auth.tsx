import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { syncPush, unlinkPush } from './push';
import type { Profile, Provider } from './types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  provider: Provider | null; // provider row when role = provider (null until onboarding is done)
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setProvider(null);
      return;
    }
    const { data: p } = await supabase.from('users').select('*').eq('id', s.user.id).maybeSingle();
    setProfile(p as Profile | null);
    void syncPush(); // device already allowed notifications -> link it to this account
    if (p?.role === 'provider') {
      const { data: pr } = await supabase
        .from('providers')
        .select('*, services(id, slug, name_ar, icon)')
        .eq('id', s.user.id)
        .maybeSingle();
      setProvider(pr as Provider | null);
    } else {
      setProvider(null);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // defer: supabase-js warns against awaiting other calls inside this callback
        setTimeout(() => loadProfile(s), 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await loadProfile(data.session);
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await unlinkPush(); // this device stops getting this account's notifications
    await supabase.auth.signOut();
    setProfile(null);
    setProvider(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, provider, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
