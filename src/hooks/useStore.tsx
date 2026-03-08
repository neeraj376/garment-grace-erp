import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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

  useEffect(() => {
    if (!user) {
      setStoreId(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("user_id", user.id)
        .maybeSingle();
      
      setStoreId(data?.store_id ?? null);
      setLoading(false);
    };

    fetchProfile();
  }, [user]);

  return (
    <StoreContext.Provider value={{ storeId, loading }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
