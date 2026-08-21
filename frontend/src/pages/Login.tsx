import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthLayout from "@/components/auth/AuthLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const Login = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // A dónde volver después de entrar. Sin esto, quien llega desde un link
  // compartido (una reunión de Meet, un correo, un ticket) aterrizaba en
  // el dashboard y tenía que volver a buscar el link — reportado por Jhon
  // con los links de Meet. Dos fuentes: el state que dejan las rutas
  // protegidas al expulsar, o ?returnTo= para links armados a mano.
  // SOLO rutas internas (empiezan con "/"): un returnTo absoluto sería un
  // open redirect — llegás de un phishing, te logueás en el Maven real y
  // te devuelve a un clon sin que notes el salto.
  const crudo =
    (location.state as { from?: { pathname?: string; search?: string } } | null)?.from
      ? `${(location.state as { from: { pathname: string; search?: string } }).from.pathname}${(location.state as { from: { search?: string } }).from.search ?? ""}`
      : new URLSearchParams(location.search).get("returnTo");
  const destino = crudo && crudo.startsWith("/") && !crudo.startsWith("//")
    ? crudo
    : "/dashboard";
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to={destino} replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      toast({ title: "Campos requeridos", description: "Por favor completa todos los campos.", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);

    if (error) {
      toast({ title: "Error al iniciar sesión", description: error.message, variant: "destructive" });
    } else {
      navigate(destino);
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-2xl font-bold text-white">Iniciar sesión</h2>
          <p className="text-sm text-white/50">Ingresa tus credenciales para acceder al CRM</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-white/70">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="bg-white/10 border-white/10 text-white placeholder:text-white/30"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-white/70">Contraseña</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="pr-10 bg-white/10 border-white/10 text-white placeholder:text-white/30"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-white/50 hover:text-white hover:bg-white/10"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Iniciar Sesión
          </Button>
        </form>

        <div className="flex flex-col items-center gap-2 text-sm">
          <Link to="/forgot-password" className="text-white/60 hover:text-white hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
          <span className="text-white/40">
            ¿No tienes cuenta?{" "}
            <Link to="/register" className="text-white/60 hover:text-white hover:underline">Regístrate</Link>
          </span>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Login;
