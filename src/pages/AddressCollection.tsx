import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface InvoiceInfo {
  invoice_number: string;
  total_amount: number;
  expires_at: string | null;
  store: { name: string | null; logo_url: string | null };
  shipping: {
    name: string | null; phone: string | null; email: string | null;
    address_line1: string | null; address_line2: string | null;
    city: string | null; state: string | null; pincode: string | null;
  };
}

export default function AddressCollection() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<InvoiceInfo | null>(null);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    name: "", phone: "", email: "",
    line1: "", line2: "", city: "", state: "", pincode: "",
  });

  useEffect(() => {
    document.title = "Add Delivery Address";
    (async () => {
      if (!token) { setError("Invalid link"); setLoading(false); return; }
      const { data, error } = await supabase.rpc("get_invoice_by_address_token", { p_token: token });
      if (error) { setError(error.message); setLoading(false); return; }
      const d = data as any;
      if (d?.error === "invalid_token") setError("This link is invalid.");
      else if (d?.error === "expired") setError("This link has expired. Please request a new one.");
      else {
        setInfo(d as InvoiceInfo);
        setForm({
          name: d.shipping.name || "",
          phone: d.shipping.phone || "",
          email: d.shipping.email || "",
          line1: d.shipping.address_line1 || "",
          line2: d.shipping.address_line2 || "",
          city: d.shipping.city || "",
          state: d.shipping.state || "",
          pincode: d.shipping.pincode || "",
        });
      }
      setLoading(false);
    })();
  }, [token]);

  const submit = async () => {
    if (!token) return;
    if (!form.name.trim() || !form.phone.trim() || !form.line1.trim() ||
        !form.city.trim() || !form.state.trim() || !form.pincode.trim()) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    if (!/^\d{6}$/.test(form.pincode.trim())) {
      toast({ title: "Enter a valid 6-digit pincode", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc("submit_invoice_address", {
      p_token: token,
      p_name: form.name, p_phone: form.phone, p_email: form.email,
      p_line1: form.line1, p_line2: form.line2,
      p_city: form.city, p_state: form.state, p_pincode: form.pincode,
    });
    setSaving(false);
    if (error) { toast({ title: "Failed to save", description: error.message, variant: "destructive" }); return; }
    const d = data as any;
    if (d?.error) {
      const msg = d.error === "expired" ? "Link expired" : d.error === "invalid_token" ? "Invalid link" : d.error;
      toast({ title: msg, variant: "destructive" });
      return;
    }
    setSaved(true);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">Unable to open link</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }
  if (saved) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <CheckCircle2 className="h-14 w-14 mx-auto text-green-600" />
          <h1 className="text-xl font-semibold">Address saved!</h1>
          <p className="text-muted-foreground">Thank you — we'll ship your order soon.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-lg mx-auto bg-background rounded-lg shadow-sm border p-6 space-y-5">
        <div className="text-center space-y-1">
          {info?.store.logo_url && <img src={info.store.logo_url} alt="" className="h-12 mx-auto mb-2" />}
          <h1 className="text-xl font-semibold">{info?.store.name || "Delivery Address"}</h1>
          <p className="text-sm text-muted-foreground">
            Order <strong>{info?.invoice_number}</strong> · ₹{Number(info?.total_amount || 0).toFixed(2)}
          </p>
        </div>

        <div className="grid gap-3">
          <div>
            <Label>Full name *</Label>
            <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mobile *</Label>
              <Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Address line 1 *</Label>
            <Input value={form.line1} onChange={(e) => setForm(f => ({ ...f, line1: e.target.value }))} />
          </div>
          <div>
            <Label>Address line 2</Label>
            <Input value={form.line2} onChange={(e) => setForm(f => ({ ...f, line2: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>City *</Label>
              <Input value={form.city} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div>
              <Label>State *</Label>
              <Input value={form.state} onChange={(e) => setForm(f => ({ ...f, state: e.target.value }))} />
            </div>
            <div>
              <Label>Pincode *</Label>
              <Input value={form.pincode} maxLength={6} onChange={(e) => setForm(f => ({ ...f, pincode: e.target.value.replace(/\D/g, "") }))} />
            </div>
          </div>
        </div>

        <Button className="w-full" onClick={submit} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save address
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          Link valid until {info?.expires_at ? new Date(info.expires_at).toLocaleString() : "—"}
        </p>
      </div>
    </div>
  );
}
