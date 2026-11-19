import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { planDeLaUrl, registrarEmpresa, type PlanRegistro } from "@/lib/cobros";
import { almacenDelNavegador, envDeLaApp, guardarDestino, puertaActiva } from "@/lib/puerta";

// REGISTRO SOLO DESDE LA PORTADA (Alvaro, 19/11/2026, tanda 8): elige el plan, nombre de
// la empresa, su nombre, correo y contraseña → la empresa nace en el EDIFICIO (activa,
// con su admin) → Checkout de Stripe (tarjeta obligatoria, 14 días gratis) → /bienvenido.
// Con la puerta apagada no se puede registrar nadie todavía: se ofrece la demo.
const SETUP_USD = "3.000";

export default function Empezar() {
  const { t, language } = useLanguage();
  const location = useLocation();
  const abierto = puertaActiva(envDeLaApp());
  const cancelado = new URLSearchParams(location.search).get("cancelado") === "1";
  const [plan, setPlan] = useState<PlanRegistro>(() => planDeLaUrl(location.search));
  const [empresa, setEmpresa] = useState("");
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const r = await registrarEmpresa({ plan, empresa, nombre, correo, contrasena, idioma: language }, envDeLaApp());
    if (r.ok) {
      // Desde ya, este navegador entra por el edificio (la empresa vive allí).
      guardarDestino(almacenDelNavegador(), "edificio", correo);
      window.location.assign(r.url);
      return;
    }
    setEnviando(false);
    setError("error" in r ? r.error : "general");
  };

  const opcion = (id: PlanRegistro, clave: TranslationKey) => (
    <label
      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
        plan === id ? "border-white/40 bg-white/15 text-white" : "border-white/10 bg-white/5 text-white/70"
      }`}
    >
      <input type="radio" name="plan" value={id} checked={plan === id} onChange={() => setPlan(id)} className="accent-current" />
      <span>{t(clave)}</span>
    </label>
  );

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-2xl font-bold text-white">{t("cobros.empezar.titulo")}</h2>
          <p className="text-sm text-white/60">{t("cobros.empezar.sub")}</p>
        </div>

        {cancelado && (
          <p role="status" className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/70">
            {t("cobros.empezar.cancelado")}
          </p>
        )}

        {!abierto ? (
          <p className="text-center text-sm text-white/70">{t("cobros.empezar.apagado")}</p>
        ) : (
          <form onSubmit={enviar} className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm text-white/70">{t("cobros.empezar.plan")}</legend>
              {opcion("equipo", "cobros.empezar.planEquipo")}
              {opcion("empresa", "cobros.empezar.planEmpresa")}
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="empresa" className="text-white/70">{t("cobros.empezar.empresa")}</Label>
              <Input id="empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} autoComplete="organization" required
                className="bg-white/10 border-white/10 text-white placeholder:text-white/30" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nombre" className="text-white/70">{t("cobros.empezar.nombre")}</Label>
              <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" required
                className="bg-white/10 border-white/10 text-white placeholder:text-white/30" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="correo" className="text-white/70">{t("cobros.empezar.correo")}</Label>
              <Input id="correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="email" required
                placeholder={t("auth.emailPlaceholder")} className="bg-white/10 border-white/10 text-white placeholder:text-white/30" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contrasena" className="text-white/70">{t("cobros.empezar.contrasena")}</Label>
              <Input id="contrasena" type="password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} autoComplete="new-password"
                minLength={8} required className="bg-white/10 border-white/10 text-white placeholder:text-white/30" />
            </div>
            <p className="text-xs text-white/50">{t("cobros.empezar.setup", { usd: SETUP_USD })}</p>
            {error && (
              <p role="alert" className="text-sm text-red-300">
                {t(`cobros.error.${error}` as TranslationKey)}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {enviando ? t("cobros.empezar.creando") : t("cobros.empezar.boton")}
            </Button>
          </form>
        )}

        <div className="flex flex-col items-center text-sm">
          <Link to="/#demo" className="inline-flex min-h-11 items-center px-2 text-center text-white/60 hover:text-white hover:underline">
            {t("cobros.empezar.demo")}
          </Link>
          <Link to="/login" className="inline-flex min-h-11 items-center px-2 text-white/40 hover:text-white hover:underline">
            {t("cobros.empezar.yaTengo")}
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
