import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

// Read cached session synchronously — trust it for instant render even if expired
// (getSession will handle refresh in background)
function getCachedUser(): User | null {
  try {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const raw = localStorage.getItem(`sb-${projectId}-auth-token`);
    if (raw) {
      const session = JSON.parse(raw) as Session;
      if (session?.user) {
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
      // Only accept auth state changes after getSession has initialized
      // This prevents premature SIGNED_OUT events from clearing cached user
      if (initializedRef.current) {
        setUser(session?.user ?? null);
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
