import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { traducirErrorAuth } from "@/lib/authErrors";
import { esCuentaDeCreadora } from "@/lib/portal/cuenta";
import { PORTAL_CERRADO } from "@/lib/modulosOcultos";

// Entrar al portal de creadoras: su correo personal y su contraseña. La cuenta la
// crea la agencia (pestaña Portal del perfil); aquí no hay registro.
// Si entra alguien del equipo por esta puerta, termina en su Maven de siempre.

export default function PortalEntrar() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user, loading: cargandoSesion } = useAuth();
  const navigate = useNavigate();
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [ver, setVer] = useState(false);
  const [entrando, setEntrando] = useState(false);

  if (cargandoSesion) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }
  // Portal cerrado (recorte reversible): nadie entra ni opera; el equipo que
  // caiga aquí vuelve a su Maven. Reabrir = PORTAL_CERRADO = false en
  // lib/modulosOcultos.ts. Va antes del redirect de sesión para que una
  // creadora ya logueada vea el aviso en vez de rebotar a /portal.
  if (PORTAL_CERRADO) {
    if (user && !esCuentaDeCreadora(user)) return <Navigate to="/dashboard" replace />;
    return (
      <AuthLayout>
        <div className="space-y-4 text-center">
          <h1 className="text-2xl font-bold text-white">{t("portal.cerrado.titulo")}</h1>
          <p className="text-sm text-white/60">{t("portal.cerrado.detalle")}</p>
        </div>
      </AuthLayout>
    );
  }
  if (user) return <Navigate to={esCuentaDeCreadora(user) ? "/portal" : "/dashboard"} replace />;

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correo.trim() || !clave) {
      toast({ title: t("portal.entrar.faltan"), variant: "destructive" });
      return;
    }
    setEntrando(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave });
    setEntrando(false);
    if (error) {
      toast({ title: t("portal.entrar.error"), description: traducirErrorAuth(error), variant: "destructive" });
      return;
    }
    navigate(esCuentaDeCreadora(data.user) ? "/portal" : "/dashboard", { replace: true });
  };

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-bold text-white">{t("portal.entrar.titulo")}</h1>
          <p className="text-sm text-white/60">{t("portal.entrar.subtitulo")}</p>
        </div>

        <form onSubmit={entrar} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="portal-correo" className="text-white/70">{t("portal.entrar.correo")}</Label>
            <Input
              id="portal-correo"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className="min-h-11 bg-white/10 text-base text-white border-white/10 placeholder:text-white/30"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="portal-clave" className="text-white/70">{t("portal.entrar.contrasena")}</Label>
            <div className="relative">
              <Input
                id="portal-clave"
                type={ver ? "text" : "password"}
                autoComplete="current-password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                className="min-h-11 bg-white/10 pr-11 text-base text-white border-white/10 placeholder:text-white/30"
              />
              <button
                type="button"
                onClick={() => setVer((v) => !v)}
                aria-label={t(ver ? "portal.contrasena.ocultar" : "portal.contrasena.mostrar")}
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-control text-white/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {ver ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
            <div className="flex justify-end">
              <Link to="/forgot-password?desde=portal" className="py-1 text-sm text-white/60 hover:text-white hover:underline">
                {t("portal.entrar.olvide")}
              </Link>
            </div>
          </div>
          <Button type="submit" className="min-h-11 w-full" disabled={entrando}>
            {entrando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t("portal.entrar.entrar")}
          </Button>
        </form>

        <p className="rounded-panel bg-white/[0.04] px-4 py-3 text-center text-sm text-white/60">{t("portal.entrar.primeraVez")}</p>
        <p className="text-center text-sm text-white/40">
          {t("portal.entrar.equipo")}{" "}
          <Link to="/login" className="text-white/70 hover:text-white hover:underline">{t("portal.entrar.equipoLink")}</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
