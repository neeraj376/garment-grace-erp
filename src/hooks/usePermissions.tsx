import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useStore } from "./useStore";

interface Permissions {
  role: string;
  can_invoicing: boolean;
  can_inventory: boolean;
  can_photos: boolean;
  can_customers: boolean;
}

const defaultOwner: Permissions = {
  role: "owner",
  can_invoicing: true,
  can_inventory: true,
  can_photos: true,
  can_customers: true,
};

const PermissionsContext = createContext<Permissions & { loading: boolean }>({
  ...defaultOwner,
  loading: true,
});

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { storeId } = useStore();
  const [permissions, setPermissions] = useState<Permissions>(defaultOwner);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !storeId) {
      setLoading(false);
      return;
    }

    const fetch = async () => {
      // Check profile role first
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (profile?.role === "owner") {
        setPermissions(defaultOwner);
        setLoading(false);
        return;
      }

      // Staff - get permissions
      const { data: perms } = await supabase
        .from("user_permissions")
        .select("*")
        .eq("user_id", user.id)
        .eq("store_id", storeId)
        .single();

      if (perms) {
        setPermissions({
          role: "staff",
          can_invoicing: perms.can_invoicing,
          can_inventory: perms.can_inventory,
          can_photos: perms.can_photos,
          can_customers: perms.can_customers,
        });
      } else {
        // Staff with no permissions record - deny all
        setPermissions({
          role: "staff",
          can_invoicing: false,
          can_inventory: false,
          can_photos: false,
          can_customers: false,
        });
      }
      setLoading(false);
    };

    fetch();
  }, [user?.id, storeId]);

  return (
    <PermissionsContext.Provider value={{ ...permissions, loading }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
