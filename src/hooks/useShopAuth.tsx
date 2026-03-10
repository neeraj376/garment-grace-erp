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
    let { data } = await supabase
      .from("shop_customers")
      .select("id, name, email, phone")
      .eq("user_id", userId)
      .maybeSingle();
    
    // Auto-create shop_customer profile if missing
    if (!data) {
      const { data: session } = await supabase.auth.getSession();
      const email = session?.session?.user?.email ?? null;
      const name = session?.session?.user?.user_metadata?.full_name ?? null;
      const { data: created } = await supabase
        .from("shop_customers")
        .insert({ user_id: userId, email, name })
        .select("id, name, email, phone")
        .single();
      data = created;
    }
    
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
