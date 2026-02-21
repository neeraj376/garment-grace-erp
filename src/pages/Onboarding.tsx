import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Store, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

export default function Onboarding() {
  const { user } = useAuth();
  const [storeName, setStoreName] = useState("");
  const [location, setLocation] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    try {
      const storeId = crypto.randomUUID();
      const { error: storeError } = await supabase
        .from("stores")
        .insert({ id: storeId, name: storeName, location, gst_number: gstNumber, phone });

      if (storeError) throw storeError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ store_id: storeId, role: "owner" })
        .eq("user_id", user.id);

      if (profileError) throw profileError;

      // Create default settings
      await supabase.from("store_settings").insert({ store_id: store.id });

      toast({ title: "Store created!", description: "Your store is ready to go." });
      navigate("/");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleLogout}
        className="absolute top-4 right-4 text-muted-foreground"
      >
        <LogOut className="h-4 w-4 mr-2" />
        Log out
      </Button>
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="rounded-xl bg-primary p-3">
              <Store className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold font-display">Set Up Your Store</h1>
          <p className="text-sm text-muted-foreground">Enter your store details to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="storeName">Store Name *</Label>
            <Input id="storeName" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="My Garment Store" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, State" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gst">GST Number</Label>
            <Input id="gst" value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} placeholder="22AAAAA0000A1Z5" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 9876543210" />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating..." : "Create Store"}
          </Button>
        </form>
      </div>
    </div>
  );
}
