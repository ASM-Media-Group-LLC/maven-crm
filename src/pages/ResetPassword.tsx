import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Logo from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2, ArrowLeft, Check, X } from "lucide-react";

const ResetPassword = () => {
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
    let retryInterval: ReturnType<typeof setInterval> | null = null;
    let safetyTimeout: ReturnType<typeof setTimeout> | null = null;

    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const isRecoveryRedirect = hashParams.get("type") === "recovery";

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (!isMounted) return;
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryReady(true);
        setChecking(false);
        if (retryInterval) clearInterval(retryInterval);
        if (safetyTimeout) clearTimeout(safetyTimeout);
      }
    });

    if (isRecoveryRedirect) {
      // Hash fragments present — poll getSession until Supabase processes them
      const startTime = Date.now();
      retryInterval = setInterval(async () => {
        if (!isMounted) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setRecoveryReady(true);
          setChecking(false);
          if (retryInterval) clearInterval(retryInterval);
          if (safetyTimeout) clearTimeout(safetyTimeout);
        }
      }, 500);

      // Safety timeout: stop waiting after 5 seconds
      safetyTimeout = setTimeout(() => {
        if (!isMounted) return;
        if (retryInterval) clearInterval(retryInterval);
        setChecking(false); // Will show "invalid link" if recoveryReady is still false
      }, 5000);
    } else {
      // No hash fragments — single check
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!isMounted) return;
        if (session) setRecoveryReady(true);
        setChecking(false);
      });
    }

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      if (retryInterval) clearInterval(retryInterval);
      if (safetyTimeout) clearTimeout(safetyTimeout);
    };
  }, []);

  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const isValid = hasMinLength && hasUppercase && hasNumber && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValid) {
      toast({ title: "Contraseña inválida", description: "Verifica que cumpla todos los requisitos.", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast({ title: "Error al actualizar", description: error.message, variant: "destructive" });
    } else {
      await supabase.auth.signOut();
      toast({ title: "Contraseña actualizada", description: "Tu contraseña ha sido cambiada exitosamente. Inicia sesión con tu nueva contraseña." });
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-4">
          <Link to="/">
            <Logo size="sm" />
          </Link>
          <h2 className="text-2xl font-bold">Restablecer contraseña</h2>
        </div>

        {!recoveryReady ? (
          <div className="rounded-lg border border-border bg-card p-6 space-y-4 text-center">
            <p className="text-sm text-destructive font-medium">El enlace es inválido o ha expirado.</p>
            <p className="text-sm text-muted-foreground">
              Solicita un nuevo enlace de recuperación para restablecer tu contraseña.
            </p>
            <Link to="/forgot-password">
              <Button variant="outline" className="w-full mt-2">Solicitar nuevo enlace</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password">Nueva contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmar contraseña</Label>
              <div className="relative">
                <Input
                  id="confirm"
                  type={showConfirm ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowConfirm(!showConfirm)}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <RequirementItem met={hasMinLength} label="Mínimo 8 caracteres" />
              <RequirementItem met={hasUppercase} label="Al menos 1 mayúscula" />
              <RequirementItem met={hasNumber} label="Al menos 1 número" />
              <RequirementItem met={passwordsMatch} label="Las contraseñas coinciden" />
            </div>

            <Button type="submit" className="w-full" disabled={loading || !isValid}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Actualizar contraseña
            </Button>
          </form>
        )}

        <div className="flex flex-col items-center gap-2 text-sm">
          <Link to="/login" className="inline-flex items-center gap-2 text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" />
            Volver a iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
