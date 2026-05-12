import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthLayout from "@/components/auth/AuthLayout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft } from "lucide-react";

const ForgotPassword = () => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast({ title: "Campo requerido", description: "Por favor ingresa tu email.", variant: "destructive" });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      toast({ title: "Email inválido", description: "Por favor ingresa un email válido.", variant: "destructive" });
      return;
    }

    setLoading(true);
    // Usamos la edge function 'forgot-password' que genera el link
    // via admin API + manda email custom Maven-branded via Resend.
    // Esto reemplaza al template default de Supabase que llegaba
    // genérico y a veces apuntaba mal.
    try {
      await supabase.functions.invoke("forgot-password", {
        body: { email: email.trim() },
      });
    } catch (err) {
      // Ignoramos errores acá — la edge function siempre devuelve 200
      // OK por anti-enumeration. Cualquier excepción de red es local,
      // no del backend.
      console.warn("[forgot-password] invoke failed", err);
    }
    setLoading(false);
    setSent(true);
  };

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-2xl font-bold text-white">Recuperar contraseña</h2>
        </div>

        {sent ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-white/70">
              Si el correo está registrado, recibirás un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada.
            </p>
            <Link to="/login" className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white hover:underline">
              <ArrowLeft className="h-4 w-4" />
              Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-white/50 text-center">
              Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.
            </p>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white/70">Email</Label>
                <Input id="email" type="email" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="bg-white/10 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar enlace de recuperación
              </Button>
            </form>
            <div className="flex flex-col items-center gap-2 text-sm">
              <Link to="/login" className="inline-flex items-center gap-2 text-white/60 hover:text-white hover:underline">
                <ArrowLeft className="h-4 w-4" />
                Volver a iniciar sesión
              </Link>
            </div>
          </>
        )}
      </div>
    </AuthLayout>
  );
};

export default ForgotPassword;
