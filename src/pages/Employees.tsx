import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, UserCog, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function Employees() {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", role: "sales", salary: "", joining_date: "" });

  const fetchEmployees = async () => {
    if (!storeId) return;
    const { data } = await supabase.from("employees").select("*").eq("store_id", storeId).order("created_at", { ascending: false });
    setEmployees(data ?? []);
  };

  useEffect(() => { fetchEmployees(); }, [storeId]);

  const openEdit = (emp: any) => {
    setEditing(emp);
    setForm({
      name: emp.name,
      phone: emp.phone || "",
      email: emp.email || "",
      role: emp.role,
      salary: emp.salary?.toString() || "",
      joining_date: emp.joining_date || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;

    const payload = {
      store_id: storeId,
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      role: form.role,
      salary: form.salary ? parseFloat(form.salary) : null,
      joining_date: form.joining_date || null,
    };

    try {
      if (editing) {
        const { error } = await supabase.from("employees").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast({ title: "Employee updated" });
      } else {
        const { error } = await supabase.from("employees").insert(payload);
        if (error) throw error;
        toast({ title: "Employee added" });
      }
      setDialogOpen(false);
      setEditing(null);
      setForm({ name: "", phone: "", email: "", role: "sales", salary: "", joining_date: "" });
      fetchEmployees();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (emp: any) => {
    const { error } = await supabase.from("employees").delete().eq("id", emp.id);
    if (error) {
      toast({ title: "Cannot delete", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Employee deleted" });
      fetchEmployees();
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Employees</h1>
          <p className="text-sm text-muted-foreground mt-1">{employees.length} employees</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Add Employee</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Employee" : "Add Employee"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Role</Label><Input value={form.role} onChange={e => setForm({...form, role: e.target.value})} /></div>
                <div><Label>Salary</Label><Input type="number" value={form.salary} onChange={e => setForm({...form, salary: e.target.value})} /></div>
              </div>
              <div><Label>Joining Date</Label><Input type="date" value={form.joining_date} onChange={e => setForm({...form, joining_date: e.target.value})} /></div>
              <Button type="submit" className="w-full">{editing ? "Update" : "Add"} Employee</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-xl overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Salary</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <UserCog className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No employees yet</p>
                </TableCell>
              </TableRow>
            ) : employees.map(emp => (
              <TableRow key={emp.id}>
                <TableCell className="font-medium">{emp.name}</TableCell>
                <TableCell className="capitalize">{emp.role}</TableCell>
                <TableCell>{emp.phone || "—"}</TableCell>
                <TableCell>{emp.email || "—"}</TableCell>
                <TableCell className="text-right">{emp.salary ? `₹${Number(emp.salary).toLocaleString("en-IN")}` : "—"}</TableCell>
                <TableCell>
                  <Badge variant={emp.is_active ? "default" : "secondary"}>
                    {emp.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(emp)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
