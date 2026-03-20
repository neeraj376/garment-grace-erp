import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

function getCachedUser(): User | null {
  try {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const raw = localStorage.getItem(`sb-${projectId}-auth-token`);

    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed?.user ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getCachedUser());
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  useEffect(() => {
    let isActive = true;

    const applySession = (nextUser: User | null) => {
      if (!isActive) return;
      setUser(nextUser);
      setLoading(false);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isActive) return;

      if (!initializedRef.current && event === "SIGNED_OUT" && !session) {
        return;
      }

      applySession(session?.user ?? null);
    });

    const syncSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isActive) return;

      initializedRef.current = true;
      applySession(session?.user ?? null);
    };

    void syncSession();

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
