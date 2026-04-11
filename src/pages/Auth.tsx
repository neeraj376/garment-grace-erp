import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Store, Loader2, Mail, Lock, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STORE_CACHE_PREFIX = "cached_store_id:";

function cacheStoreId(userId: string, storeId: string | null) {
  try {
    const key = `${STORE_CACHE_PREFIX}${userId}`;

    if (storeId) {
      localStorage.setItem(key, storeId);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage errors.
  }
}

export default function Auth() {
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const { toast } = useToast();

  const startCountdown = useCallback(() => {
    setCountdown(60);
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
        "verify-password",
        { body: { email, password } }
      );
      if (verifyError || !verifyData?.valid) {
        throw new Error(verifyData?.error || verifyError?.message || "Invalid credentials");
      }

      const { error: otpError } = await supabase.functions.invoke("send-otp", {
        body: { email },
      });
      if (otpError) throw otpError;

      toast({
        title: "OTP Sent",
        description: "A 6-digit verification code has been sent to your email.",
      });
      setStep("otp");
      startCountdown();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerify = async () => {
    if (otp.length !== 6) return;
    setLoading(true);

    try {
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
        "verify-custom-otp",
        { body: { email, code: otp } }
      );
      if (verifyError || !verifyData?.valid) {
        throw new Error(verifyData?.error || verifyError?.message || "Invalid OTP");
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;

      const signedInUser = signInData.user;
      if (!signedInUser) {
        throw new Error("Could not restore your session");
      }

      const nextStoreId = typeof verifyData?.storeId === "string" ? verifyData.storeId : null;
      cacheStoreId(signedInUser.id, nextStoreId);

      window.location.replace(nextStoreId ? "/administrator" : "/administrator/onboarding");
      return;
    } catch (error: any) {
      toast({
        title: "Invalid OTP",
        description: error.message,
        variant: "destructive",
      });
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("send-otp", {
        body: { email },
      });
      if (error) throw error;
      toast({ title: "OTP Resent", description: "Check your email for the new code." });
      startCountdown();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="rounded-xl bg-primary p-3">
              <Store className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold font-display">RetailERP</h1>
          <p className="text-sm text-muted-foreground">
            {step === "credentials" ? "Sign in to your store" : "Enter the verification code"}
          </p>
        </div>

        {step === "credentials" ? (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="pl-9"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9"
                  required
                  minLength={6}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {loading ? "Verifying..." : "Continue"}
            </Button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-4">
                <ShieldCheck className="h-8 w-8 text-primary" />
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              We've sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>
            </p>
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={otp} onChange={setOtp} onComplete={handleOtpVerify}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button onClick={handleOtpVerify} className="w-full" disabled={loading || otp.length !== 6}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {loading ? "Verifying..." : "Verify & Sign In"}
            </Button>
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setStep("credentials");
                  setOtp("");
                }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ← Back
              </button>
              {countdown > 0 ? (
                <span className="text-sm text-muted-foreground">Resend in {countdown}s</span>
              ) : (
                <button
                  onClick={handleResendOtp}
                  className="text-sm text-primary font-medium hover:underline"
                  disabled={loading}
                >
                  Resend code
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
