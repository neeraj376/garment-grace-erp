import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useStore() {
  const { user } = useAuth();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setStoreId(null);
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("user_id", user.id)
        .single();
      
      setStoreId(data?.store_id ?? null);
      setLoading(false);
    };

    fetchProfile();
  }, [user]);

  return { storeId, loading };
}
