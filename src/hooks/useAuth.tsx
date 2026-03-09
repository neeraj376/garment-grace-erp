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
  console.log("[Auth] init — cachedUser:", cachedUser?.email ?? "null");
  const [user, setUser] = useState<User | null>(cachedUser);
  const [loading, setLoading] = useState(!cachedUser);
  const initializedRef = useRef(false);

  useEffect(() => {
    console.log("[Auth] useEffect — calling getSession...");
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("[Auth] getSession result:", session?.user?.email ?? "null");
      if (session?.user) {
        setUser(session.user);
      }
      setLoading(false);
      initializedRef.current = true;
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[Auth] onAuthStateChange:", event, session?.user?.email ?? "null", "initialized:", initializedRef.current);
      if (!initializedRef.current) return;
      
      if (event === 'SIGNED_OUT') {
        console.log("[Auth] SIGNED_OUT — clearing user");
        setUser(null);
      } else if (session?.user) {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  console.log("[Auth] render — user:", user?.email ?? "null", "loading:", loading);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
