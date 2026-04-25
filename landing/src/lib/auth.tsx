import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Profile } from "./database.types";

type AuthState = {
  /** undefined while the initial session check is in flight; null when signed out. */
  session: Session | null | undefined;
  user: User | null;
  /** undefined while loading; null when row doesn't exist yet (pre-onboarding). */
  profile: Profile | null | undefined;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Fetch (or refetch) the profile row whenever the auth user changes.
  // Profile may not exist yet — that's the "needs onboarding" signal.
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    if (session === undefined) return; // still loading
    if (!userId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setProfile(undefined);
    supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[auth] profile fetch failed", error);
          setProfile(null);
          return;
        }
        setProfile((data as Profile | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [session, userId]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      refreshProfile: async () => {
        if (!userId) return;
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .maybeSingle();
        if (error) {
          console.error("[auth] profile refresh failed", error);
          return;
        }
        setProfile((data as Profile | null) ?? null);
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, profile, userId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
