import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface ShopCustomer {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

interface ShopAuthContextType {
  user: User | null;
  customer: ShopCustomer | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const ShopAuthContext = createContext<ShopAuthContextType>({
  user: null,
  customer: null,
  loading: true,
  signOut: async () => {},
});

export function ShopAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [customer, setCustomer] = useState<ShopCustomer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchCustomer(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchCustomer(session.user.id);
      else {
        setCustomer(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchCustomer(userId: string) {
    const { data } = await supabase
      .from("shop_customers")
      .select("id, name, email, phone")
      .eq("user_id", userId)
      .maybeSingle();
    setCustomer(data);
    setLoading(false);
  }

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setCustomer(null);
  };

  return (
    <ShopAuthContext.Provider value={{ user, customer, loading, signOut }}>
      {children}
    </ShopAuthContext.Provider>
  );
}

export function useShopAuth() {
  return useContext(ShopAuthContext);
}
