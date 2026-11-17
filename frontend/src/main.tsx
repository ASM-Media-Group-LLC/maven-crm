import { createRoot } from "react-dom/client";
import { hayLlamadaActiva } from "@/lib/llamadaActiva";
import App from "./App.tsx";
import "./index.css";
// Captura `beforeinstallprompt` (Android/escritorio Chrome) ANTES de montar React:
// el evento dispara durante la carga y un useEffect ya llega tarde.
import "./lib/promptDeInstalacion";
// Mide cuánto le falta a 100dvh para llegar al borde inferior en la PWA de iPhone.
import "./lib/altoDeLaApp";
// iOS: sin zoom automático al enfocar el cajón de texto (solo iOS; ver el archivo).
import "./lib/sinZoomAlEnfocar";
// Windows: Alt + números del teclado numérico (Alt+64 = «@») no navega hacia atrás.
import "./lib/codigosAlt";
import { applyStoredSkin, applyStoredAppearance } from "./hooks/useSkin";
import { irAlDominioCanonico } from "./lib/dominioCanonico";
import { traducir, cargarIdioma } from "./lib/i18n";
import { idiomaInicial } from "./hooks/useLanguage";

// Una sola URL: quien entre por maven-ai.me o www.maven-ai.me termina en
// app.maven-ai.me con la misma ruta. Va PRIMERO, antes de aplicar tema o montar
// React, para no pintar nada que se vaya a descartar.
irAlDominioCanonico();

// Skin de acento del usuario (Settings → Apariencia): aplicado ANTES del
// primer render para que la app no parpadee con el acento default. La
// sincronización con profiles.ui_skin llega después (useSkinSync en App);
// mientras tanto manda lo guardado en localStorage. applyStoredAppearance
// suma OLED/alto contraste/tono personalizado y el overlay de temporada
// (ui_prefs) — mismo contrato: local primero, el perfil sincroniza después.
applyStoredSkin();
applyStoredAppearance();

// --- Deploy con la app abierta ---
//
// Las páginas se cargan bajo demanda, y cada deploy reemplaza los archivos del
// servidor con nombres nuevos. Quien tenga Maven abierto de antes sigue pidiendo
// los viejos: al navegar a otra sección, ese archivo ya no existe y la pantalla
// queda rota sin decir por qué. Recargar trae la versión nueva y lo resuelve.
//
// El candado en sessionStorage es lo que impide un bucle: si al recargar vuelve
// a fallar, no es un deploy a mitad de camino sino un problema de verdad, y hay
// que dejar que se vea en vez de recargar para siempre.
//
// Los textos van por traducir(): esto salta al navegar, con la app ya montada,
// y para entonces el LanguageProvider ya fijó el idioma de la persona. (El texto
// sale del diccionario, no de nadie de afuera: por eso se puede meter en innerHTML.)
function mostrarAvisoDeRecarga() {
  if (document.getElementById("maven-recarga-aviso")) return;
  const aviso = document.createElement("div");
  aviso.id = "maven-recarga-aviso";
  aviso.setAttribute("role", "status");
  aviso.style.cssText =
    "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:99999;" +
    "background:#1a1a2e;color:#fff;padding:12px 20px;border-radius:12px;" +
    "display:flex;align-items:center;gap:10px;font-size:14px;font-family:system-ui,sans-serif;" +
    "box-shadow:0 4px 20px rgba(0,0,0,.4)";
  aviso.innerHTML =
    '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.35);' +
    'border-top-color:#fff;border-radius:50%;animation:maven-giro .8s linear infinite"></span>' +
    `<span>${traducir("int.reload.updating")}</span>` +
    "<style>@keyframes maven-giro{to{transform:rotate(360deg)}}</style>";
  document.body.appendChild(aviso);
}

/** Hay versión nueva pero la persona está en llamada: aviso fijo con botón, sin
 *  recargar por su cuenta. DOM pelado por el mismo motivo que el aviso de arriba. */
function mostrarAvisoDeRecargaPendiente() {
  if (document.getElementById("maven-recarga-pendiente")) return;
  const aviso = document.createElement("div");
  aviso.id = "maven-recarga-pendiente";
  aviso.setAttribute("role", "status");
  aviso.style.cssText =
    "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:99999;" +
    "background:#1a1a2e;color:#fff;padding:12px 16px;border-radius:12px;" +
    "display:flex;align-items:center;gap:12px;font-size:14px;font-family:system-ui,sans-serif;" +
    "box-shadow:0 4px 20px rgba(0,0,0,.4);max-width:calc(100vw - 32px)";
  const texto = document.createElement("span");
  texto.textContent = traducir("int.reload.pending");
  const boton = document.createElement("button");
  boton.type = "button";
  boton.textContent = traducir("int.reload.now");
  boton.style.cssText =
    "background:#fff;color:#1a1a2e;border:0;border-radius:999px;padding:6px 12px;" +
    "font-weight:600;font-size:13px;cursor:pointer;white-space:nowrap";
  boton.addEventListener("click", () => window.location.reload());
  const cerrar = document.createElement("button");
  cerrar.type = "button";
  cerrar.setAttribute("aria-label", traducir("int.reload.dismiss"));
  cerrar.textContent = "×";
  cerrar.style.cssText = "background:transparent;color:rgba(255,255,255,.7);border:0;font-size:18px;cursor:pointer;line-height:1";
  cerrar.addEventListener("click", () => aviso.remove());
  aviso.append(texto, boton, cerrar);
  document.body.appendChild(aviso);
}

window.addEventListener("vite:preloadError", (e) => {
  const CLAVE = "maven.recarga-por-deploy";
  const ANTIBUCLE_MS = 15_000;
  try {
    const ultima = Number(sessionStorage.getItem(CLAVE) ?? 0);
    // Si acabamos de recargar por esto, recargar otra vez no va a arreglarlo:
    // no es un deploy a mitad de camino sino un problema de verdad, y hay que
    // dejar que se vea. Con marca de TIEMPO y no un candado suelto porque el
    // candado habia que limpiarlo en algun momento, y limpiarlo al 'load' era
    // demasiado pronto: el chunk falla despues de que la pagina cargo, asi que
    // se limpiaba justo antes de volver a fallar y recargaba para siempre.
    if (Date.now() - ultima < ANTIBUCLE_MS) return;
    sessionStorage.setItem(CLAVE, String(Date.now()));
    e.preventDefault();
    // EN LLAMADA NO SE RECARGA SOLO. Cada merge a main despliega, y una pestaña
    // abierta se recargaba al primer chunk que ya no existía: en una tabla es un
    // parpadeo, en un Meet o en Cowork es que se te caiga la llamada sin aviso
    // (Jhon, 10/09/2026, en un día con diez deploys). Acá se avisa y se deja el
    // botón: la persona recarga cuando cuelgue.
    if (hayLlamadaActiva()) {
      mostrarAvisoDeRecargaPendiente();
      return;
    }
    // Un aviso de un segundo antes de recargar. Sin él, el refresh parecía un
    // glitch ("entro a Maven y a los segundos se me refresca solo"); con él se
    // entiende que es Maven actualizándose a la versión que se acaba de
    // desplegar. Es DOM pelado a propósito: esto corre antes de que React
    // monte y el sistema de toasts de la app no existe todavía.
    mostrarAvisoDeRecarga();
    window.setTimeout(() => window.location.reload(), 1200);
  } catch {
    /* sin sessionStorage se deja pasar el error, que es el comportamiento previo */
  }
});

// --- PWA / Service Worker guard ---
// In iframes (preview hosts, embedded contexts) we disable the service
// worker so it doesn't interfere with the parent frame.
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

if (isInIframe) {
  // Unregister all service workers and clear caches in preview/iframe
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((r) => r.unregister());
    });
  }
  if ("caches" in window) {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
} else if (import.meta.env.PROD) {
  import("./pwa");
}

// Las traducciones van en un paquete por idioma (lib/i18n.ts). Se baja el de
// esta persona ANTES de pintar, así la primera pantalla ya sale traducida. Si
// falla la red, se pinta igual (t() muestra lo que haya).
const raizDeLaApp = createRoot(document.getElementById("root")!);
void cargarIdioma(idiomaInicial()).finally(() => raizDeLaApp.render(<App />));
