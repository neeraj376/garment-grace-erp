import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface StoreContextType {
  storeId: string | null;
  loading: boolean;
}

const StoreContext = createContext<StoreContextType>({ storeId: null, loading: true });
const STORE_CACHE_PREFIX = "cached_store_id:";

function getCachedStoreId(userId: string | null): string | null {
  if (!userId) return null;

  try {
    return localStorage.getItem(`${STORE_CACHE_PREFIX}${userId}`);
  } catch {
    return null;
  }
}

function setCachedStoreId(userId: string, storeId: string | null) {
  try {
    const key = `${STORE_CACHE_PREFIX}${userId}`;

    if (storeId) {
      localStorage.setItem(key, storeId);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access errors.
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [storeId, setStoreId] = useState<string | null>(getCachedStoreId(userId));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!userId) {
      setStoreId(null);
      setLoading(false);
      return;
    }

    const initialCachedStoreId = getCachedStoreId(userId);
    setStoreId(initialCachedStoreId);
    setLoading(!initialCachedStoreId);

    let isActive = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    const MAX_PROFILE_RETRIES = 5;
    const getLatestCachedStoreId = () => getCachedStoreId(userId);

    const scheduleRetry = () => {
      if (!isActive || retryTimer || retryCount >= MAX_PROFILE_RETRIES) return;

      retryTimer = setTimeout(() => {
        retryTimer = null;
        retryCount += 1;
        if (!isActive) return;
        void fetchProfile();
      }, 400);
    };

    const fetchProfile = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isActive) return;

      const latestCachedStoreId = getLatestCachedStoreId();

      if (!session) {
        if (latestCachedStoreId) {
          setStoreId(latestCachedStoreId);
          setLoading(false);
        } else {
          setLoading(true);
        }
        scheduleRetry();
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (!isActive) return;

      if (error) {
        console.error("[Store] failed to load profile", error);

        if (retryCount < MAX_PROFILE_RETRIES) {
          if (latestCachedStoreId) {
            setStoreId(latestCachedStoreId);
            setLoading(false);
          } else {
            setLoading(true);
          }
          scheduleRetry();
          return;
        }

        if (latestCachedStoreId) {
          setStoreId(latestCachedStoreId);
          setLoading(false);
          return;
        }

        setStoreId(null);
        setLoading(false);
        return;
      }

      const nextStoreId = data?.store_id ?? null;

      if (!data && retryCount < MAX_PROFILE_RETRIES) {
        console.warn("[Store] profile row not available yet during session warm-up, retrying", {
          userId,
          retryCount,
        });

        if (latestCachedStoreId) {
          setStoreId(latestCachedStoreId);
          setLoading(false);
        } else {
          setLoading(true);
        }

        scheduleRetry();
        return;
      }

      setStoreId(nextStoreId);
      setLoading(false);
      setCachedStoreId(userId, nextStoreId);
    };

    void fetchProfile();

    return () => {
      isActive = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [authLoading, userId]);

  return <StoreContext.Provider value={{ storeId, loading }}>{children}</StoreContext.Provider>;
}

export function useStore() {
  return useContext(StoreContext);
}
