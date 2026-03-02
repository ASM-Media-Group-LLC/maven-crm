import { useState } from "react";
import { useLocation, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import AuthLayout from "@/components/auth/AuthLayout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MailCheck } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const VerifyEmail = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const email = (location.state as { email?: string })?.email;
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  if (!email) {
    return <Navigate to="/register" replace />;
  }

  const handleVerify = async () => {
    if (otp.length !== 6) return;
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "signup",
    });
    setLoading(false);

    if (error) {
      toast({ title: "Código inválido", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Cuenta verificada", description: "Bienvenido a Maven." });
    navigate("/dashboard", { replace: true });
  };

  const handleResend = async () => {
    setResending(true);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setResending(false);

    if (error) {
      toast({ title: "Error al reenviar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Código reenviado", description: "Revisa tu bandeja de entrada." });
  };

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <MailCheck className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-white">Verificar email</h2>
          <p className="text-sm text-white/50 text-center max-w-xs">
            Enviamos un código de 6 dígitos a <span className="text-white/70 font-medium">{email}</span>
          </p>
        </div>

        <div className="flex justify-center">
          <InputOTP maxLength={6} value={otp} onChange={setOtp} onComplete={handleVerify}>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot
                  key={i}
                  index={i}
                  className="h-12 w-12 bg-white/10 border-white/10 text-white text-lg"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        <Button
          className="w-full"
          disabled={otp.length !== 6 || loading}
          onClick={handleVerify}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Verificar cuenta
        </Button>

        <div className="flex flex-col items-center gap-2 text-sm">
          <span className="text-white/40">
            ¿No recibiste el código?{" "}
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-white/60 hover:text-white hover:underline disabled:opacity-50"
            >
              {resending ? "Reenviando…" : "Reenviar código"}
            </button>
          </span>
        </div>
      </div>
    </AuthLayout>
  );
};

export default VerifyEmail;
