import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthLayout from "@/components/auth/AuthLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const Register = () => {
  const { t } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [company, setCompany] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim() || !email.trim() || !password) {
      toast({ title: t("auth.requiredFields"), description: t("auth.requiredFieldsRegisterDesc"), variant: "destructive" });
      return;
    }

    if (password.length < 6) {
      toast({ title: t("auth.passwordTooShort"), description: t("auth.passwordTooShortDesc"), variant: "destructive" });
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: t("auth.passwordsDontMatch"), description: t("auth.passwordsDontMatchDesc"), variant: "destructive" });
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      setLoading(false);
      toast({ title: t("auth.registerError"), description: error.message, variant: "destructive" });
      return;
    }

    if (!error && data.user?.identities?.length === 0) {
      setLoading(false);
      toast({
        title: t("auth.emailTaken"),
        description: t("auth.emailTakenDesc"),
        variant: "destructive",
      });
      return;
    }

    if (company.trim() && data.user) {
      const { data: companyData } = await supabase
        .from("companies")
        .insert({ name: company.trim() })
        .select("id")
        .single();

      if (companyData) {
        await supabase
          .from("profiles")
          .update({ company_id: companyData.id })
          .eq("id", data.user.id);
      }
    }

    setLoading(false);
    toast({ title: t("auth.accountCreated"), description: t("auth.accountCreatedDesc") });
    navigate("/login", { replace: true });
  };

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-2xl font-bold text-white">{t("auth.registerTitle")}</h2>
          <p className="text-sm text-white/50">{t("auth.registerSubtitle")}</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-white/70">{t("auth.fullName")}</Label>
            <Input id="fullName" placeholder={t("auth.fullNamePlaceholder")} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" className="bg-white/10 border-white/10 text-white placeholder:text-white/30" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-white/70">{t("auth.emailRequired")}</Label>
            <Input id="email" type="email" placeholder={t("auth.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="bg-white/10 border-white/10 text-white placeholder:text-white/30" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-white/70">{t("auth.passwordRequired")}</Label>
            <div className="relative">
              <Input id="password" type={showPassword ? "text" : "password"} placeholder={t("auth.passwordMinPlaceholder")} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="pr-10 bg-white/10 border-white/10 text-white placeholder:text-white/30" />
              <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-white/50 hover:text-white hover:bg-white/10" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-white/70">{t("auth.confirmPasswordRequired")}</Label>
            <div className="relative">
              <Input id="confirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder={t("auth.confirmPasswordPlaceholder")} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" className="pr-10 bg-white/10 border-white/10 text-white placeholder:text-white/30" />
              <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-white/50 hover:text-white hover:bg-white/10" onClick={() => setShowConfirmPassword(!showConfirmPassword)} tabIndex={-1}>
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="company" className="text-white/70">{t("auth.companyOptional")}</Label>
            <Input id="company" placeholder={t("auth.companyPlaceholder")} value={company} onChange={(e) => setCompany(e.target.value)} className="bg-white/10 border-white/10 text-white placeholder:text-white/30" />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("auth.registerButton")}
          </Button>
        </form>

        <div className="flex flex-col items-center gap-2 text-sm">
          <span className="text-white/40">
            {t("auth.haveAccount")}{" "}
            <Link to="/login" className="text-white/60 hover:text-white hover:underline">{t("auth.loginLink")}</Link>
          </span>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Register;
