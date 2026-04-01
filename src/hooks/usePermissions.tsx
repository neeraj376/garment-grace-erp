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
  can_dashboard: boolean;
  can_reports: boolean;
  can_loyalty: boolean;
  can_employees: boolean;
  can_stock_summary: boolean;
  can_settings: boolean;
  can_edit_invoices: boolean;
  can_upload_inventory: boolean;
}

const defaultOwner: Permissions = {
  role: "owner",
  can_invoicing: true,
  can_inventory: true,
  can_photos: true,
  can_customers: true,
  can_dashboard: true,
  can_reports: true,
  can_loyalty: true,
  can_employees: true,
  can_stock_summary: true,
  can_settings: true,
  can_edit_invoices: true,
  can_upload_inventory: true,
};

const defaultStaff: Permissions = {
  role: "staff",
  can_invoicing: false,
  can_inventory: false,
  can_photos: false,
  can_customers: false,
  can_dashboard: false,
  can_reports: false,
  can_loyalty: false,
  can_employees: false,
  can_stock_summary: false,
  can_settings: false,
  can_edit_invoices: false,
  can_upload_inventory: false,
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
          can_dashboard: perms.can_dashboard,
          can_reports: perms.can_reports,
          can_loyalty: perms.can_loyalty,
          can_employees: perms.can_employees,
          can_stock_summary: perms.can_stock_summary,
          can_settings: perms.can_settings,
          can_edit_invoices: (perms as any).can_edit_invoices ?? false,
          can_upload_inventory: (perms as any).can_upload_inventory ?? false,
        });
      } else {
        setPermissions(defaultStaff);
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
