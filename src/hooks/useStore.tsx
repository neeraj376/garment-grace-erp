import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface StoreContextType {
  storeId: string | null;
  loading: boolean;
}

const StoreContext = createContext<StoreContextType>({ storeId: null, loading: true });

const STORE_CACHE_KEY = "cached_store_id";

function getCachedStoreId(): string | null {
  try {
    return localStorage.getItem(STORE_CACHE_KEY);
  } catch { return null; }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const cachedStoreId = getCachedStoreId();
  const [storeId, setStoreId] = useState<string | null>(user ? cachedStoreId : null);
  const [loading, setLoading] = useState(user ? !cachedStoreId : false);
  const fetchedForUser = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.id ?? null;

    if (!userId) {
      fetchedForUser.current = null;
      setStoreId(null);
      setLoading(false);
      localStorage.removeItem(STORE_CACHE_KEY);
      return;
    }

    if (fetchedForUser.current === userId) return;

    const fetchProfile = async () => {
      console.log("[Store] fetching profile for user:", userId);
      const { data, error } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("user_id", userId)
        .maybeSingle();
      
      console.log("[Store] profile result:", data, "error:", error);
      const sid = data?.store_id ?? null;
      fetchedForUser.current = userId;
      setStoreId(sid);
      setLoading(false);
      if (sid) {
        localStorage.setItem(STORE_CACHE_KEY, sid);
      } else {
        localStorage.removeItem(STORE_CACHE_KEY);
      }
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
