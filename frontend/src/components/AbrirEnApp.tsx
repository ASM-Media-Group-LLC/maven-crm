import { RUTA_DESCARGAR_CON_GUIA } from "@/lib/guiaApp";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ExternalLink, Loader2, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { escritorio } from "@/lib/escritorio";
import { debeOfrecerApp, enlaceDeApp, guardarPreferencia, leerPreferencia } from "@/lib/abrirEnApp";
import { useSoloNavegador } from "@/hooks/useExigencias";

// LOS LINKS DE MAVEN ABREN EN LA APP DE COMPUTADOR (Alvaro, 17/11/2026). Ver
// lib/abrirEnApp.ts. Dos mitades:
//  · dentro de la app: recibe la ruta que pidió un link maven:// y navega a ella;
//  · en el navegador de un computador: ofrece «Abrir en la app» (una vez por
//    pestaña) o la abre sola si la persona eligió «Siempre».


export function AbrirEnApp() {
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [modo, setModo] = useState<"oculto" | "ofrecer" | "abriendo">("oculto");
  const decidido = useRef<string | null>(null);
  // Su Posición le deja trabajar solo en el navegador: nunca se le ofrece la app.
  const soloNavegador = useSoloNavegador(!!user && !escritorio());

  // Dentro de la app: un link maven:// abre su ruta sin recargar (no corta llamadas).
  useEffect(() => {
    const app = escritorio();
    if (!app?.alAbrirRuta) return;
    return app.alAbrirRuta((ruta) => navigate(ruta));
  }, [navigate]);

  // Cada enlace de reunión puede ofrecer la app aunque la sesión solo exista allí.
  useEffect(() => {
    const ruta = `${pathname}${search}${hash}`;
    if (decidido.current === ruta) return;
    const ua = navigator.userAgent || "";
    const tactil = /Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1; // iPad se hace pasar por Mac
    if (soloNavegador || tactil || !debeOfrecerApp({ ua, enApp: !!escritorio(), conSesion: !!user, ruta: pathname })) {
      setModo("oculto");
      return;
    }
    decidido.current = ruta;
    const pref = leerPreferencia();
    if (pref === "nunca") return;
    if (pref === "siempre") {
      window.location.href = enlaceDeApp(ruta);
      setModo("abriendo");
      return;
    }
    setModo("ofrecer");
  }, [user, pathname, search, hash, soloNavegador]);

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
  // «No se abrió» = no la tiene: la guía la baja sola y muestra los pasos.
  const descarga = RUTA_DESCARGAR_CON_GUIA;

  // 27/11/2026 (Alvaro: «que no quede tan intenso»): ya no es un cuadro grande
  // con tres botones. Es un BOTONCITO discreto arriba a la derecha: «Abrir en
  // la app» y una × para quitarlo. Quien quiera la app, la abre; nadie se siente
  // empujado. «Siempre en la app» sigue funcionando para quien ya lo eligió.
  if (modo === "ofrecer") {
    return (
      <div
        role="region"
        aria-label={t("pwa.app.titulo")}
        data-abrir-en-app
        className="fixed right-3 top-3 z-[200] flex items-center rounded-full border border-border/50 bg-card/70 text-[11px] text-muted-foreground opacity-80 shadow-sm backdrop-blur-sm transition-opacity hover:opacity-100"
      >
        <button
          type="button"
          onClick={() => abrir(false)}
          title={t("pwa.app.descripcion")}
          className="flex items-center gap-1.5 rounded-l-full py-1 pl-2.5 pr-2 hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" aria-hidden /> {t("pwa.app.abrir")}
        </button>
        <button
          type="button"
          onClick={quedarme}
          aria-label={t("pwa.app.quedarme")}
          title={t("pwa.app.quedarme")}
          className="rounded-r-full border-l border-border/50 py-1 pl-1.5 pr-2 hover:text-foreground"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="fixed right-3 top-3 z-[200] flex items-center gap-3 rounded-full border border-border/50 bg-card/80 px-3 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm"
    >
      <span className="flex items-center gap-1.5 text-foreground">
        <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden /> {t("pwa.app.abriendo")}
      </span>
      <a href={descarga} className="text-primary underline-offset-2 hover:underline">{t("pwa.app.noSeAbrio")}</a>
      <button type="button" onClick={quedarme} aria-label={t("pwa.app.quedarme")} className="hover:text-foreground">
        <X className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}

export default AbrirEnApp;
