import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface StoreContextType {
  storeId: string | null;
  loading: boolean;
}

const StoreContext = createContext<StoreContextType>({ storeId: null, loading: true });

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedForUser = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.id ?? null;

    if (!userId) {
      fetchedForUser.current = null;
      setStoreId(null);
      setLoading(false);
      return;
    }

    // Don't refetch if we already have data for this user
    if (fetchedForUser.current === userId) return;

    // Only show loading on first fetch, not subsequent ones
    if (fetchedForUser.current === null && storeId === null) {
      // Keep loading true only on initial load
    }

    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("user_id", userId)
        .maybeSingle();
      
      fetchedForUser.current = userId;
      setStoreId(data?.store_id ?? null);
      setLoading(false);
    };

    fetchProfile();
  }, [user?.id]);

  return (
    <StoreContext.Provider value={{ storeId, loading }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
