import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

// Read cached session synchronously to avoid loading flash
function getCachedUser(): User | null {
  try {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const raw = localStorage.getItem(`sb-${projectId}-auth-token`);
    if (raw) {
      const session = JSON.parse(raw) as Session;
      if (session?.user && session.expires_at && session.expires_at * 1000 > Date.now()) {
        return session.user;
      }
    }
  } catch {}
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const cachedUser = getCachedUser();
  const [user, setUser] = useState<User | null>(cachedUser);
  const [loading, setLoading] = useState(!cachedUser); // no loading if we have a cached user
  const initializedRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      initializedRef.current = true;
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!initializedRef.current) {
        setLoading(false);
        initializedRef.current = true;
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
