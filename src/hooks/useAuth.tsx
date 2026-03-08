import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  useEffect(() => {
    console.log("[AuthProvider] useEffect running, mounting");

    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("[AuthProvider] getSession resolved, user:", session?.user?.id ?? "null");
      setUser(session?.user ?? null);
      setLoading(false);
      initializedRef.current = true;
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[AuthProvider] onAuthStateChange event:", event, "user:", session?.user?.id ?? "null");
      setUser(session?.user ?? null);
      if (!initializedRef.current) {
        setLoading(false);
        initializedRef.current = true;
      }
    });

    return () => {
      console.log("[AuthProvider] UNMOUNTING - this should NOT happen on tab switch");
      subscription.unsubscribe();
    };
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
