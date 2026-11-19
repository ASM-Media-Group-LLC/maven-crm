import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthLayout from "@/components/auth/AuthLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { traducirErrorAuth } from "@/lib/authErrors";
import { entrarConReintentos, esReintentableAlEntrar } from "@/lib/entrarConPaciencia";
import { escritorio } from "@/lib/escritorio";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import {
  almacenDelNavegador, correoGuardado, destinoDeEstaPestana, destinoDeRespuesta, envDeLaApp, guardarDestino, olvidarDestino,
  inicioTrasEntrar, preguntarDirectorio, puertaActiva,
} from "@/lib/puerta";

const Login = () => {
  const { t } = useLanguage();
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
  // Sin returnTo: Kash va al tablero de siempre. Una pestaña del EDIFICIO va a la casa de
  // la plataforma (19/11/2026): el dueño y su equipo a «Tus clientes», el admin de un
  // cliente a /mi-empresa (lo reparte PlataformaRaiz) y cualquier otro de vuelta a /dashboard.
  const destino = crudo && crudo.startsWith("/") && !crudo.startsWith("//")
    ? crudo
    : inicioTrasEntrar(destinoDeEstaPestana());
  const { toast } = useToast();
  // LA PUERTA (vagón 7): prendida, el login pide primero el correo y el directorio del
  // edificio dice si va a Kash (lo de siempre) o al edificio. Apagada, esta pantalla es
  // exactamente la de siempre (paso «clave» con el correo editable).
  const puerta = puertaActiva(envDeLaApp());
  const recordado = puerta ? correoGuardado(almacenDelNavegador()) : null;
  const [paso, setPaso] = useState<"correo" | "clave">(puerta && !recordado ? "correo" : "clave");
  const [buscando, setBuscando] = useState(false);
  const [email, setEmail] = useState(recordado ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Cambio de turno (simulacro 19/11/2026): si el servidor dice «espera», se
  // reintenta solo y se avisa con calma en vez de un error rojo.
  const [reintentando, setReintentando] = useState(false);

  // En la app de computador (Alvaro, 18/11/2026: «que el app recuerde tu login
  // y password»): la app no trae el gestor de contraseñas de Chrome, así que
  // ella misma guarda el correo y la contraseña en este equipo, cifrados con el
  // llavero del sistema (desktop/src/acceso.js), y aquí vuelven puestos. En el
  // navegador no hay nada de esto: ahí los recuerda el navegador.
  const accesoDeLaApp = escritorio()?.acceso;
  useEffect(() => {
    if (!accesoDeLaApp) return;
    let vivo = true;
    accesoDeLaApp.leer().then((guardado) => {
      if (!vivo || !guardado) return;
      setEmail((actual) => actual || guardado.correo);
      if (guardado.clave) setPassword((actual) => actual || guardado.clave);
    }).catch(() => { /* sin acceso guardado: se escribe como siempre */ });
    return () => { vivo = false; };
  }, [accesoDeLaApp]);

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

  const continuarConCorreo = async (e: React.FormEvent) => {
    e.preventDefault();
    const correo = email.trim().toLowerCase();
    if (!correo) {
      toast({ title: t("auth.requiredFields"), description: t("auth.requiredFieldsDesc"), variant: "destructive" });
      return;
    }
    setBuscando(true);
    const respuesta = await preguntarDirectorio(correo, envDeLaApp());
    setBuscando(false);
    // Un fallo del directorio NO saca a nadie de Kash: sigue por la entrada de siempre.
    if (respuesta === "error") toast({ title: t("cobros.puerta.sinRespuesta") });
    const destinoBase = destinoDeRespuesta(respuesta);
    guardarDestino(almacenDelNavegador(), destinoBase, correo);
    if (destinoBase !== destinoDeEstaPestana()) {
      // Cambiar de base = arrancar de nuevo contra la otra (client.ts lee la elección al cargar).
      const vuelta = destino !== inicioTrasEntrar(destinoDeEstaPestana()) ? `?returnTo=${encodeURIComponent(destino)}` : "";
      window.location.replace(`/login${vuelta}`);
      return;
    }
    setPaso("clave");
  };

  const usarOtroCorreo = () => {
    olvidarDestino(almacenDelNavegador());
    if (destinoDeEstaPestana() !== "kash") {
      window.location.replace("/login");
      return;
    }
    setEmail("");
    setPassword("");
    setPaso("correo");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      toast({ title: t("auth.requiredFields"), description: t("auth.requiredFieldsDesc"), variant: "destructive" });
      return;
    }

    setLoading(true);
    setReintentando(false);
    const { error } = await entrarConReintentos(
      () => supabase.auth.signInWithPassword({ email: email.trim(), password }),
      { alReintentar: () => setReintentando(true) },
    );
    setLoading(false);
    setReintentando(false);

    if (error && esReintentableAlEntrar(error)) {
      // Se insistió ~30 s y el servidor sigue lleno: aviso tranquilo, no error.
      toast({ title: t("auth.muchaGenteTitulo"), description: t("auth.muchaGenteDesc") });
    } else if (error) {
      toast({ title: t("auth.loginError"), description: traducirErrorAuth(error), variant: "destructive" });
    } else {
      // Entró bien: la app lo recuerda para la próxima (solo en la app de computador).
      void accesoDeLaApp?.guardar(email.trim(), password).catch(() => { /* no se pudo guardar: no frena la entrada */ });
      navigate(destino);
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-2xl font-bold text-white">{t("auth.loginTitle")}</h2>
          <p className="text-center text-sm text-white/50">{t("auth.loginSubtitle")}</p>
        </div>

        <form onSubmit={paso === "correo" ? continuarConCorreo : handleLogin} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-white/70">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              readOnly={puerta && paso === "clave"}
              className="bg-white/10 border-white/10 text-white placeholder:text-white/30"
            />
            {puerta && paso === "clave" && (
              <button type="button" onClick={usarOtroCorreo} className="text-xs text-white/50 hover:text-white hover:underline">
                {t("cobros.puerta.otroCorreo")}
              </button>
            )}
          </div>
          {paso === "clave" && (
          <div className="space-y-2">
            <Label htmlFor="password" className="text-white/70">{t("auth.password")}</Label>
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
                className="absolute right-0.5 top-1/2 -translate-y-1/2 h-10 w-10 text-white/50 hover:text-white hover:bg-white/10"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          )}
          {paso === "clave" ? (
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("auth.loginButton")}
            </Button>
          ) : (
            <Button type="submit" className="w-full" disabled={buscando}>
              {buscando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {buscando ? t("cobros.puerta.buscando") : t("cobros.puerta.continuar")}
            </Button>
          )}
          {reintentando && (
            <p role="status" aria-live="polite" className="text-center text-sm text-white/60">
              {t("auth.muchaGenteReintentando")}
            </p>
          )}
          {accesoDeLaApp && <p className="text-center text-xs text-white/40">{t("auth.recordadoEnApp")}</p>}
        </form>

        <div className="flex flex-col items-center text-sm">
          <Link to="/forgot-password" className="inline-flex min-h-11 items-center px-2 text-white/60 hover:text-white hover:underline">
            {t("auth.forgotPassword")}
          </Link>
          {/* Sin "crear cuenta": las cuentas de Maven las crea un admin desde
              el panel de control, y el registro público está cerrado en la
              base (guard `bloquear_alta_publica`). Ofrecerlo aquí mandaba a la
              gente a una puerta que no abre. Quien no tiene cuenta y quiere
              probar Maven pide una demo desde la portada. */}
          <Link to="/#demo" className="inline-flex min-h-11 items-center justify-center px-2 text-center text-white/40 hover:text-white hover:underline">
            {t("auth.pideDemo")}
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Login;
