import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ExternalLink, Loader2, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { escritorio } from "@/lib/escritorio";
import { debeOfrecerApp, enlaceDeApp, guardarPreferencia, leerPreferencia } from "@/lib/abrirEnApp";

// LOS LINKS DE MAVEN ABREN EN LA APP DE COMPUTADOR (Alvaro, 17/11/2026). Ver
// lib/abrirEnApp.ts. Dos mitades:
//  · dentro de la app: recibe la ruta que pidió un link maven:// y navega a ella;
//  · en el navegador de un computador: ofrece «Abrir en la app» (una vez por
//    pestaña) o la abre sola si la persona eligió «Siempre».

const DESCARGAS = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/descargas`;

export function AbrirEnApp() {
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [modo, setModo] = useState<"oculto" | "ofrecer" | "abriendo">("oculto");
  const decidido = useRef(false);

  // Dentro de la app: un link maven:// abre su ruta sin recargar (no corta llamadas).
  useEffect(() => {
    const app = escritorio();
    if (!app?.alAbrirRuta) return;
    return app.alAbrirRuta((ruta) => navigate(ruta));
  }, [navigate]);

  // En el navegador: se decide UNA vez por pestaña, con la primera ruta con sesión.
  useEffect(() => {
    if (decidido.current || !user) return;
    decidido.current = true;
    const ua = navigator.userAgent || "";
    const tactil = (navigator.maxTouchPoints ?? 0) > 1; // iPad se hace pasar por Mac
    if (tactil || !debeOfrecerApp({ ua, enApp: !!escritorio(), conSesion: true, ruta: pathname })) return;
    const pref = leerPreferencia();
    if (pref === "nunca") return;
    const ruta = `${pathname}${search}${hash}`;
    if (pref === "siempre") {
      window.location.href = enlaceDeApp(ruta);
      setModo("abriendo");
      return;
    }
    setModo("ofrecer");
  }, [user, pathname, search, hash]);

  useEffect(() => {
    if (modo !== "abriendo") return;
    const id = window.setTimeout(() => setModo("oculto"), 12_000);
    return () => window.clearTimeout(id);
  }, [modo]);

  if (modo === "oculto") return null;

  const abrir = (siempre: boolean) => {
    if (siempre) guardarPreferencia("siempre");
    window.location.href = enlaceDeApp(`${pathname}${search}${hash}`);
    setModo("abriendo");
  };
  const quedarme = () => setModo("oculto");
  const esMac = /Macintosh/i.test(navigator.userAgent || "");
  const descarga = `${DESCARGAS}/${esMac ? "Maven-Mac.dmg" : "Maven-Windows.exe"}`;

  return (
    <div
      role="dialog"
      aria-label={t("pwa.app.titulo")}
      className="vidrio fixed right-4 top-4 z-[200] w-[min(360px,calc(100vw-32px))] rounded-2xl border border-border/60 p-4 shadow-2xl"
    >
      {modo === "ofrecer" ? (
        <div className="grid gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="grid gap-1">
              <p className="text-sm font-semibold text-foreground">{t("pwa.app.titulo")}</p>
              <p className="text-xs text-muted-foreground">{t("pwa.app.descripcion")}</p>
            </div>
            <button type="button" onClick={quedarme} aria-label={t("pwa.app.quedarme")} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => abrir(true)} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
              <ExternalLink className="h-3.5 w-3.5" /> {t("pwa.app.siempre")}
            </button>
            <button type="button" onClick={() => abrir(false)} className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
              {t("pwa.app.abrir")}
            </button>
            <button type="button" onClick={quedarme} className="rounded-full px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              {t("pwa.app.quedarme")}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> {t("pwa.app.abriendo")}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <button type="button" onClick={quedarme} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              {t("pwa.app.quedarme")}
            </button>
            <a href={descarga} className="text-primary underline-offset-2 hover:underline">{t("pwa.app.noSeAbrio")}</a>
          </div>
        </div>
      )}
    </div>
  );
}

export default AbrirEnApp;
