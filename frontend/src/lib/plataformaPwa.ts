// Qué dispositivo es y si Maven ya está instalada como app. Funciones puras
// (reciben navigator/window para poder probarlas) que usan el banner de
// instalación, el panel de push y el gate del permiso de notificaciones.
//
// Por qué importa: en iPhone el Web Push SOLO funciona con la app instalada en
// la pantalla de inicio desde Safari (iOS 16.4+), y el permiso solo se puede
// pedir tras un toque. En Android Chrome alcanza con el navegador, pero el
// prompt automático sin gesto se degrada a un aviso silencioso.

export type Plataforma = "ios-safari" | "ios-otro" | "android" | "escritorio";

export const CLAVE_INSTALAR_POSPUESTO = "maven:instalar:pospuesto";
export const POSPONER_INSTALAR_MS = 7 * 24 * 60 * 60 * 1000;

type NavMinimo = {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
};

export function detectarPlataforma(nav: NavMinimo = navigator): Plataforma {
  const ua = nav.userAgent || "";
  // iPadOS se presenta como Mac; la pantalla táctil lo delata.
  const esIpad = nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1;
  if (/iPhone|iPad|iPod/i.test(ua) || esIpad) {
    return /CriOS|FxiOS|EdgiOS|OPT\/|DuckDuckGo/i.test(ua) ? "ios-otro" : "ios-safari";
  }
  if (/Android/i.test(ua)) return "android";
  return "escritorio";
}

/** Instalada = abierta desde el icono (standalone), no desde una pestaña. */
export function estaInstalada(win: Window = window): boolean {
  try {
    if (win.matchMedia?.("(display-mode: standalone)")?.matches) return true;
  } catch {
    /* sin matchMedia */
  }
  return (win.navigator as NavMinimo).standalone === true;
}

/** Teléfono o tableta, por plataforma (no por ancho de ventana: una ventana
 *  angosta de escritorio no es un celular y no debe ver la guía de instalar). */
export function esMovil(nav: NavMinimo = navigator): boolean {
  return detectarPlataforma(nav) !== "escritorio";
}

export function instalacionPospuesta(ahora = Date.now()): boolean {
  try {
    const v = localStorage.getItem(CLAVE_INSTALAR_POSPUESTO);
    if (!v) return false;
    const hasta = Number(v);
    return Number.isFinite(hasta) && ahora < hasta;
  } catch {
    return false;
  }
}

export function posponerInstalacion(ahora = Date.now()): void {
  try {
    localStorage.setItem(CLAVE_INSTALAR_POSPUESTO, String(ahora + POSPONER_INSTALAR_MS));
  } catch {
    /* sin storage: el banner vuelve la próxima vez, no pasa nada grave */
  }
}

/** Pantalla táctil sin mouse (teléfono, tableta). */
export function esTactil(win: Window = window): boolean {
  try {
    return win.matchMedia("(hover: none) and (pointer: coarse)").matches;
  } catch {
    return false;
  }
}

/** ¿Este navegador puede suscribirse a push AHORA? iOS solo instalada. */
export function puedeActivarPushAqui(p: Plataforma, instalada: boolean, win: Window = window): boolean {
  if ((p === "ios-safari" || p === "ios-otro") && !instalada) return false;
  return "PushManager" in win && "Notification" in win && "serviceWorker" in win.navigator;
}
