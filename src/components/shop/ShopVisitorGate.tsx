import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { useShopVisitor } from "@/hooks/useShopVisitor";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

type Channel = "email" | "mobile";

export function ShopVisitorGate({ children }: { children: React.ReactNode }) {
  const { visitor, setVisitor, ready } = useShopVisitor();
  const [channel, setChannel] = useState<Channel>("email");
  const [step, setStep] = useState<"form" | "otp">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [normalizedEmail, setNormalizedEmail] = useState("");
  const [normalizedPhone, setNormalizedPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);

  if (!ready) return null;
  if (visitor) return <>{children}</>;

  function startCooldown() {
    setCooldown(30);
    const t = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) { clearInterval(t); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  async function sendOtp() {
    if (name.trim().length < 2) { toast.error("Please enter your full name"); return; }
    setDeliveryError(null);

    if (channel === "email") {
      const cleanEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        toast.error("Enter a valid email address");
        return;
      }
      setSending(true);
      try {
        const { data, error } = await supabase.functions.invoke("send-visitor-email-otp", {
          body: { name: name.trim(), email: cleanEmail },
        });
        const fnErr = (data as any)?.error;
        if (fnErr) { setDeliveryError(fnErr); toast.error(fnErr); return; }
        if (error) throw error;
        setNormalizedEmail((data as any).email);
        setStep("otp");
        startCooldown();
        toast.success("OTP sent to your email");
      } catch (e: any) {
        const msg = e?.message ?? "Failed to send OTP";
        setDeliveryError(msg);
        toast.error(msg);
      } finally {
        setSending(false);
      }
    } else {
      const digits = phone.replace(/\D/g, "");
      if (digits.length !== 10 || !/^[6-9]/.test(digits)) {
        toast.error("Enter a valid 10-digit Indian mobile number");
        return;
      }
      setSending(true);
      try {
        const { data, error } = await supabase.functions.invoke("send-mobile-otp", {
          body: { phone: digits },
        });
        const fnErr = (data as any)?.error;
        if (fnErr) { setDeliveryError(fnErr); toast.error(fnErr); return; }
        if (error) throw error;
        setNormalizedPhone((data as any).phone);
        setStep("otp");
        startCooldown();
        toast.success("OTP sent to your mobile");
      } catch (e: any) {
        const msg = e?.message ?? "Failed to send OTP";
        setDeliveryError(msg);
        toast.error(msg);
      } finally {
        setSending(false);
      }
    }
  }

  async function verifyOtp() {
    if (code.length !== 6) { toast.error("Enter the 6-digit OTP"); return; }
    setVerifying(true);
    try {
      const fn = channel === "email" ? "verify-visitor-email-otp" : "verify-mobile-otp";
      const body: any = channel === "email"
        ? { name: name.trim(), email: normalizedEmail, phone: phone.replace(/\D/g, "") || null, code }
        : { name: name.trim(), phone: normalizedPhone, code };
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error) throw error;
      const res = data as any;
      if (!res?.valid) throw new Error(res?.error || "Invalid OTP");
      setVisitor(res.visitor);
      toast.success("Verified! Welcome.");
    } catch (e: any) {
      toast.error(e?.message ?? "Verification failed");
      setCode("");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-6 sm:p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-bold">Welcome to Originee</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {step === "form"
              ? "Please verify to continue shopping"
              : channel === "email"
                ? `Enter the 6-digit code sent to ${normalizedEmail}`
                : `Enter the 6-digit code sent to +${normalizedPhone}`}
          </p>
        </div>

        {step === "form" ? (
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); sendOtp(); }}
          >
            <div>
              <Label htmlFor="v-name">Full name</Label>
              <Input
                id="v-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={100}
                autoFocus
              />
            </div>

            <Tabs value={channel} onValueChange={(v) => { setChannel(v as Channel); setDeliveryError(null); }}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="email">Email OTP</TabsTrigger>
                <TabsTrigger value="mobile">Mobile OTP</TabsTrigger>
              </TabsList>

              <TabsContent value="email" className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="v-email">Email</Label>
                  <Input
                    id="v-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    maxLength={255}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <Label htmlFor="v-phone-opt">Mobile number (optional)</Label>
                  <div className="flex">
                    <div className="px-3 inline-flex items-center bg-muted border border-r-0 border-input rounded-l-md text-sm text-muted-foreground">
                      +91
                    </div>
                    <Input
                      id="v-phone-opt"
                      className="rounded-l-none"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="10-digit mobile"
                      inputMode="numeric"
                      maxLength={10}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="mobile" className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="v-phone">Mobile number</Label>
                  <div className="flex">
                    <div className="px-3 inline-flex items-center bg-muted border border-r-0 border-input rounded-l-md text-sm text-muted-foreground">
                      +91
                    </div>
                    <Input
                      id="v-phone"
                      className="rounded-l-none"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="10-digit mobile"
                      inputMode="numeric"
                      maxLength={10}
                      autoComplete="tel"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {deliveryError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-sm p-3">
                {deliveryError}
              </div>
            )}

            <div className="rounded-md border border-border bg-muted/40 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                Sample {channel === "email" ? "email" : "SMS"} you'll receive
              </div>
              {channel === "email" ? (
                <div className="text-sm bg-background border border-border rounded p-3 space-y-1">
                  <div className="font-medium">Your Originee verification code</div>
                  <div className="text-muted-foreground">Hi {name.trim() || "there"},</div>
                  <div>
                    Your one-time code is{" "}
                    <span className="font-mono font-bold tracking-widest">123456</span>.
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Valid for 10 minutes. Do not share this code with anyone.
                  </div>
                </div>
              ) : (
                <div className="text-sm bg-background border border-border rounded p-3 font-mono leading-relaxed">
                  123456 is your OTP for verifying you profile with Klout Club by Zirclez Innovation
                </div>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={sending}>
              {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send {channel === "email" ? "Email" : "SMS"} OTP
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              By continuing, you agree to receive a verification {channel === "email" ? "email" : "SMS"}.
            </p>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={code} onChange={setCode}>
                <InputOTPGroup>
                  {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button className="w-full" onClick={verifyOtp} disabled={verifying || code.length !== 6}>
              {verifying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Verify & Continue
            </Button>
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground underline"
                onClick={() => { setStep("form"); setCode(""); }}
              >
                {channel === "email" ? "Change email" : "Change number"}
              </button>
              <button
                type="button"
                className="text-primary disabled:text-muted-foreground disabled:no-underline underline"
                disabled={cooldown > 0 || sending}
                onClick={sendOtp}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
