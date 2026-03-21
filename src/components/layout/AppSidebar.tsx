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
import { useNavigate, useLocation } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

export default function AppSidebar() {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
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
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <div className="flex items-center gap-2.5">
          <Store className="h-7 w-7 shrink-0 text-sidebar-primary" />
          {!collapsed && (
            <span className="text-lg font-bold text-sidebar-primary-foreground font-display">
              RetailERP
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.filter(item => item.visible).map(({ icon: Icon, label, path }) => (
                <SidebarMenuItem key={path}>
                  <SidebarMenuButton asChild tooltip={label}>
                    <NavLink
                      to={path}
                      end={path === "/administrator"}
                      className="hover:bg-sidebar-accent/50 text-sidebar-foreground/70 hover:text-sidebar-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-primary-foreground"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} tooltip="Logout">
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
