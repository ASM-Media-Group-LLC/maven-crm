import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { tokenDelEnlace } from "@/lib/puerta";

// «CREAR MI CONTRASEÑA» (tanda 25/11): el enlace de la invitación del Dueño de un cliente
// nuevo (https://app.maven-ai.me/crear-contrasena#t=…). Sirve una vez y vence en 7 días.
// La puerta ya dejó esta pestaña contra el edificio (lib/conexionSupabase.ts lo decide por
// la ruta), así que `supabase` aquí es el del edificio. La función «plataforma» usa el
// enlace y pone la contraseña; después se entra con ella y /plataforma reparte.

const ERRORES = ["enlace_no_existe", "enlace_usado", "enlace_vencido", "demasiados_intentos", "contrasena_corta"] as const;

export default function CrearContrasena() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const token = useMemo(() => tokenDelEnlace(typeof window !== "undefined" ? window.location.hash : ""), []);
  const [clave, setClave] = useState("");
  const [otra, setOtra] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(false);

  const mandar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (clave.length < 8) { setError(t("plataforma.clave.corta")); return; }
    if (clave !== otra) { setError(t("plataforma.clave.noCoinciden")); return; }
    setCargando(true);
    try {
      const { data, error: err } = await supabase.functions.invoke<{ ok: boolean; data?: { correo: string }; error?: string }>("plataforma", {
        body: { accion: "canjear_enlace", token, contrasena: clave },
      });
      if (err || !data) { setError(t("plataforma.error.generico")); return; }
      if (!data.ok || !data.data?.correo) {
        const k = (ERRORES as readonly string[]).includes(data.error ?? "") ? data.error : null;
        setError(k ? t((k === "contrasena_corta" ? "plataforma.clave.corta" : `plataforma.clave.${k}`) as TranslationKey) : t("plataforma.error.generico"));
        return;
      }
      setListo(true);
      // El token ya no sirve: que no quede en la barra de direcciones.
      try { window.history.replaceState(null, "", window.location.pathname); } catch { /* igual */ }
      const { error: e2 } = await supabase.auth.signInWithPassword({ email: data.data.correo, password: clave });
      if (e2) { navigate("/login", { replace: true }); return; }
      navigate("/plataforma", { replace: true });
    } catch {
      setError(t("plataforma.error.generico"));
    } finally {
      setCargando(false);
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-6" data-crear-contrasena>
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-2xl font-bold text-white">{t("plataforma.clave.titulo")}</h2>
          <p className="text-sm text-white/60">{t("plataforma.clave.sub")}</p>
        </div>

        {!token ? (
          <p className="text-center text-sm font-medium text-destructive" data-sin-enlace>{t("plataforma.clave.sinEnlace")}</p>
        ) : listo ? (
          <p className="flex items-center justify-center gap-2 text-center text-sm text-white/80"><Loader2 className="h-4 w-4 animate-spin" />{t("plataforma.clave.listo")}</p>
        ) : (
          <form onSubmit={mandar} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="cc-clave" className="text-white/70">{t("plataforma.clave.nueva")}</Label>
              <div className="relative">
                <Input id="cc-clave" type={ver ? "text" : "password"} value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" autoFocus
                  className="border-white/10 bg-white/10 pr-10 text-white placeholder:text-white/30" />
                <Button type="button" variant="ghost" size="icon" tabIndex={-1} onClick={() => setVer(!ver)}
                  className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-white/50 hover:bg-white/10 hover:text-white">
                  {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cc-otra" className="text-white/70">{t("plataforma.clave.repetir")}</Label>
              <Input id="cc-otra" type={ver ? "text" : "password"} value={otra} onChange={(e) => setOtra(e.target.value)} autoComplete="new-password"
                className="border-white/10 bg-white/10 text-white placeholder:text-white/30" />
            </div>
            {error && <p className="text-sm font-medium text-destructive" role="alert" data-error>{error}</p>}
            <Button type="submit" className="w-full" disabled={cargando}>
              {cargando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("plataforma.clave.boton")}
            </Button>
          </form>
        )}

        <div className="flex flex-col items-center gap-2 text-sm">
          <Link to="/login" className="inline-flex items-center gap-2 text-white/60 hover:text-white hover:underline">
            <ArrowLeft className="h-4 w-4" />{t("plataforma.clave.irAEntrar")}
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
