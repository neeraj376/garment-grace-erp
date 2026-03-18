import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Mail, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function ShopLogin() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

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

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (otpError) throw otpError;

      toast.success("OTP sent! Check your email for the verification code.");
      setStep("otp");
      startCountdown();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerify = async () => {
    if (otp.length !== 6) return;
    setLoading(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: "email",
      });
      if (error) throw error;
      toast.success("Welcome back!");
      navigate("/");
    } catch (error: any) {
      toast.error(error.message);
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      toast.success("OTP resent! Check your email.");
      startCountdown();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 flex justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="font-display text-2xl">
            {step === "credentials" ? "Login" : "Verify OTP"}
          </CardTitle>
          <CardDescription>
            {step === "credentials"
              ? "Welcome back to Originee"
              : "Enter the verification code sent to your email"}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                We've sent a 6-digit code to{" "}
                <span className="font-medium text-foreground">{email}</span>
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
                  onClick={() => { setStep("credentials"); setOtp(""); }}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  ← Back
                </button>
                {countdown > 0 ? (
                  <span className="text-sm text-muted-foreground">
                    Resend in {countdown}s
                  </span>
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
        </CardContent>
      </Card>
    </div>
  );
}
