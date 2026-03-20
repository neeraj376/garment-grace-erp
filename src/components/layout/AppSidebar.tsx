import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  FileText,
  Users,
  BarChart3,
  UserCog,
  Settings,
  Boxes,
  Award,
  LogOut,
  Store,
  ImagePlus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";

export default function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, can_invoicing, can_inventory, can_photos, can_customers } = usePermissions();

  const isOwner = role === "owner";

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/administrator", visible: isOwner },
    { icon: Package, label: "Inventory", path: "/administrator/inventory", visible: isOwner || can_inventory },
    { icon: FileText, label: "Invoicing", path: "/administrator/invoicing", visible: isOwner || can_invoicing },
    { icon: Boxes, label: "Stock Summary", path: "/administrator/stock", visible: isOwner || can_inventory },
    { icon: Users, label: "Customers", path: "/administrator/customers", visible: isOwner || can_customers },
    { icon: Award, label: "Loyalty", path: "/administrator/loyalty", visible: isOwner },
    { icon: BarChart3, label: "Reports", path: "/administrator/reports", visible: isOwner },
    { icon: UserCog, label: "Employees", path: "/administrator/employees", visible: isOwner },
    { icon: ImagePlus, label: "Photo Manager", path: "/administrator/photos", visible: isOwner || can_photos },
    { icon: Settings, label: "Settings", path: "/administrator/settings", visible: isOwner },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/administrator/auth");
  };

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col bg-sidebar border-r border-sidebar-border">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-sidebar-border">
        <Store className="h-7 w-7 text-sidebar-primary" />
        <span className="text-lg font-bold text-sidebar-primary-foreground font-display">
          RetailERP
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.filter(item => item.visible).map(({ icon: Icon, label, path }) => {
          const isActive = location.pathname === path || 
            (path !== "/administrator" && location.pathname.startsWith(path));
          return (
            <Link
              key={path}
              to={path}
              className={`sidebar-link ${isActive ? "sidebar-link-active" : "sidebar-link-inactive"}`}
            >
              <Icon className="h-4.5 w-4.5 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-sidebar-border">
        <button
          onClick={handleLogout}
          className="sidebar-link sidebar-link-inactive w-full"
        >
          <LogOut className="h-4.5 w-4.5 shrink-0" />
          Logout
        </button>
      </div>
    </aside>
  );
}
