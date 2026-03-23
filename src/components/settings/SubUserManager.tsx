import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Loader2, Trash2, KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface SubUser {
  user_id: string;
  full_name: string | null;
  email: string;
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
  permission_id: string;
}

const PERMISSION_MODULES = [
  { key: "can_dashboard", label: "Dashboard" },
  { key: "can_invoicing", label: "Invoicing" },
  { key: "can_inventory", label: "Inventory & Stock" },
  { key: "can_stock_summary", label: "Stock Summary" },
  { key: "can_customers", label: "Customers" },
  { key: "can_loyalty", label: "Loyalty" },
  { key: "can_reports", label: "Reports" },
  { key: "can_employees", label: "Employees" },
  { key: "can_photos", label: "Photo Manager" },
  { key: "can_settings", label: "Settings" },
];

export default function SubUserManager() {
  const { storeId } = useStore();
  const { role } = usePermissions();
  const { toast } = useToast();
  const [subUsers, setSubUsers] = useState<SubUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const [pwUserId, setPwUserId] = useState("");
  const [pwUserName, setPwUserName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resettingPw, setResettingPw] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    fullName: "",
    can_invoicing: true,
    can_inventory: false,
    can_photos: false,
    can_customers: false,
    can_dashboard: false,
    can_reports: false,
    can_loyalty: false,
    can_employees: false,
    can_stock_summary: false,
    can_settings: false,
  });

  const fetchSubUsers = async () => {
    if (!storeId) return;
    setLoading(true);

    // Get all staff profiles for this store
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .eq("store_id", storeId)
      .eq("role", "staff");

    if (!profiles?.length) {
      setSubUsers([]);
      setLoading(false);
      return;
    }

    const userIds = profiles.map((p) => p.user_id);

    const { data: perms } = await supabase
      .from("user_permissions")
      .select("*")
      .eq("store_id", storeId)
      .in("user_id", userIds);

    const users: SubUser[] = profiles.map((p) => {
      const perm = perms?.find((pm) => pm.user_id === p.user_id);
      return {
        user_id: p.user_id,
        full_name: p.full_name,
        email: "",
        can_invoicing: perm?.can_invoicing ?? false,
        can_inventory: perm?.can_inventory ?? false,
        can_photos: perm?.can_photos ?? false,
        can_customers: perm?.can_customers ?? false,
        can_dashboard: perm?.can_dashboard ?? false,
        can_reports: perm?.can_reports ?? false,
        can_loyalty: perm?.can_loyalty ?? false,
        can_employees: perm?.can_employees ?? false,
        can_stock_summary: perm?.can_stock_summary ?? false,
        can_settings: perm?.can_settings ?? false,
        permission_id: perm?.id ?? "",
      };
    });

    setSubUsers(users);
    setLoading(false);
  };

  useEffect(() => {
    if (role === "owner") fetchSubUsers();
  }, [storeId, role]);

  if (role !== "owner") return null;

  const handleCreate = async () => {
    if (!form.email || !form.password) {
      toast({ title: "Error", description: "Email and password are required", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-sub-user", {
        body: {
          email: form.email,
          password: form.password,
          fullName: form.fullName,
          permissions: {
            can_invoicing: form.can_invoicing,
            can_inventory: form.can_inventory,
            can_photos: form.can_photos,
            can_customers: form.can_customers,
            can_dashboard: form.can_dashboard,
            can_reports: form.can_reports,
            can_loyalty: form.can_loyalty,
            can_employees: form.can_employees,
            can_stock_summary: form.can_stock_summary,
            can_settings: form.can_settings,
          },
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Sub-user created", description: `${form.email} can now log in.` });
      setForm({ email: "", password: "", fullName: "", can_invoicing: true, can_inventory: false, can_photos: false, can_customers: false, can_dashboard: false, can_reports: false, can_loyalty: false, can_employees: false, can_stock_summary: false, can_settings: false });
      setDialogOpen(false);
      fetchSubUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const updatePermission = async (userId: string, field: string, value: boolean) => {
    const { error } = await supabase
      .from("user_permissions")
      .update({ [field]: value })
      .eq("user_id", userId)
      .eq("store_id", storeId!);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setSubUsers((prev) =>
        prev.map((u) => (u.user_id === userId ? { ...u, [field]: value } : u))
      );
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setResettingPw(true);
    try {
      const { data, error } = await supabase.functions.invoke("reset-sub-user-password", {
        body: { userId: pwUserId, newPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Password updated", description: `Password changed for ${pwUserName || "staff member"}.` });
      setPwDialogOpen(false);
      setNewPassword("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setResettingPw(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="section-title">Sub-Users</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="h-4 w-4 mr-2" /> Add Sub-User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Sub-User</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Full Name</Label>
                  <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Staff member name" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="staff@example.com" required />
                </div>
                <div>
                  <Label>Password</Label>
                  <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" required minLength={6} />
                </div>
                <div className="space-y-3 pt-2">
                  <p className="text-sm font-medium">Module Permissions</p>
                  {PERMISSION_MODULES.map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm">{label}</span>
                      <Switch
                        checked={(form as any)[key]}
                        onCheckedChange={(v) => setForm({ ...form, [key]: v })}
                      />
                    </div>
                  ))}
                </div>
                <Button onClick={handleCreate} className="w-full" disabled={creating}>
                  {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                  Create Sub-User
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : subUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sub-users yet. Add one to let staff access specific modules.</p>
        ) : (
          <div className="space-y-4">
            {subUsers.map((u) => (
              <div key={u.user_id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{u.full_name || "Staff"}</p>
                    <Badge variant="outline" className="text-xs mt-1">Staff</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {PERMISSION_MODULES.map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span>{label}</span>
                      <Switch
                        checked={(u as any)[key]}
                        onCheckedChange={(v) => updatePermission(u.user_id, key, v)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
