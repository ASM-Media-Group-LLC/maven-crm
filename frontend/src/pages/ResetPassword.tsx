import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthLayout from "@/components/auth/AuthLayout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { Eye, EyeOff, Loader2, ArrowLeft, Check, X } from "lucide-react";

const ResetPassword = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const finish = (ready: boolean) => {
      if (!isMounted) return;
      setRecoveryReady(ready);
      setChecking(false);
    };

    // 1. Listen for the PASSWORD_RECOVERY event fired by Supabase client
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        finish(true);
      }
    });

    // 2. Try to extract tokens from the URL hash that Supabase puts there
    const hash = window.location.hash.substring(1);
    const hashParams = new URLSearchParams(hash);
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const type = hashParams.get("type");

    if (accessToken && refreshToken && type === "recovery") {
      // Manually set the session from the hash tokens
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (error) {
            console.error("ResetPassword: setSession failed", error.message);
            finish(false);
          } else {
            finish(true);
          }
        });
    } else {
      // No hash tokens — maybe the user already has a session (e.g. page reload)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          finish(true);
        } else {
          // Give the auth listener a bit more time (the SDK may still be processing)
          setTimeout(() => {
            if (isMounted && !recoveryReady) {
              supabase.auth.getSession().then(({ data: { session: s } }) => {
                finish(!!s);
              });
            }
          }, 3000);
        }
      });
    }

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const isValid = hasMinLength && hasUppercase && hasNumber && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValid) {
      toast({ title: t("auth.invalidPassword"), description: t("auth.invalidPasswordDesc"), variant: "destructive" });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast({ title: t("auth.updateError"), description: error.message, variant: "destructive" });
    } else {
      await supabase.auth.signOut();
      toast({ title: t("auth.passwordUpdated"), description: t("auth.passwordUpdatedDesc") });
      navigate("/login");
    }
  };

  const RequirementItem = ({ met, label }: { met: boolean; label: string }) => (
    <div className="flex items-center gap-1.5 text-xs">
      {met ? <Check className="h-3 w-3 text-green-500" /> : <X className="h-3 w-3 text-muted-foreground" />}
      <span className={met ? "text-green-500" : "text-muted-foreground"}>{label}</span>
    </div>
  );

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-2xl font-bold text-white">{t("auth.resetTitle")}</h2>
        </div>

        {!recoveryReady ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-red-400 font-medium">{t("auth.resetLinkInvalid")}</p>
            <p className="text-sm text-white/50">
              {t("auth.resetLinkInvalidHint")}
            </p>
            <Link to="/forgot-password">
              <Button variant="outline" className="w-full mt-2 border-white/10 text-white hover:bg-white/10">{t("auth.requestNewLink")}</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/70">{t("auth.newPassword")}</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="pr-10 bg-white/10 border-white/10 text-white placeholder:text-white/30" />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-white/50 hover:text-white hover:bg-white/10" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm" className="text-white/70">{t("auth.confirmPassword")}</Label>
              <div className="relative">
                <Input id="confirm" type={showConfirm ? "text" : "password"} placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" className="pr-10 bg-white/10 border-white/10 text-white placeholder:text-white/30" />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-white/50 hover:text-white hover:bg-white/10" onClick={() => setShowConfirm(!showConfirm)} tabIndex={-1}>
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <RequirementItem met={hasMinLength} label={t("auth.reqMinLength")} />
              <RequirementItem met={hasUppercase} label={t("auth.reqUppercase")} />
              <RequirementItem met={hasNumber} label={t("auth.reqNumber")} />
              <RequirementItem met={passwordsMatch} label={t("auth.reqMatch")} />
            </div>

            <Button type="submit" className="w-full" disabled={loading || !isValid}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("auth.updatePassword")}
            </Button>
          </form>
        )}

        <div className="flex flex-col items-center gap-2 text-sm">
          <Link to="/login" className="inline-flex items-center gap-2 text-white/60 hover:text-white hover:underline">
            <ArrowLeft className="h-4 w-4" />
            {t("auth.backToLogin")}
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
};

export default ResetPassword;
