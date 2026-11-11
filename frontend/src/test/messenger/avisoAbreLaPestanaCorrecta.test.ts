// LAS PESTAÑAS SE MOVÍAN JUNTAS (Keila, 02/10).
//
// Keila trabaja con dos pestañas de Maven: el Messenger en una y el Correo en
// la otra. La tarjeta del navegador de un mensaje nuevo la arma la pestaña
// OCULTA (la visible no, porque ya estás mirando), y su clic navegaba ESA
// pestaña. Con el Messenger a la vista y el Correo detrás, el aviso lo armaba
// el Correo: tocarlo mandaba el Correo al Messenger y las dos quedaban en lo
// mismo, aunque ya había una pestaña en el Messenger.
//
// Ahora, con la ruta, la tarjeta la muestra el service worker y su clic lo
// resuelve `notificationclick` de sw-push.js: la ventana que YA está en esa
// sección, y otra solo si no hay ninguna.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@/lib/notificationSound", () => ({ playMessageNotification: vi.fn() }));

import {
  useBrowserNotifications,
  KIND_AVISO_DE_PAGINA,
  TAG_AVISO_DE_PAGINA,
} from "@/hooks/useBrowserNotifications";

const swFuente = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob(["/frontend/public/sw-push.js"], { query: "?raw", import: "default", eager: true });
const sw = Object.values(swFuente)[0] ?? "";

const NotificacionDePagina = vi.fn();
let showNotification: ReturnType<typeof vi.fn>;
let getRegistration: ReturnType<typeof vi.fn>;

function pestanaOculta(oculta: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => oculta });
}

const esperar = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  NotificacionDePagina.mockReset();
  class FalsaNotificacion {
    static permission = "granted";
    onclick: (() => void) | null = null;
    constructor(titulo: string, opciones?: NotificationOptions) { NotificacionDePagina(titulo, opciones); }
    close() { /* noop */ }
  }
  vi.stubGlobal("Notification", FalsaNotificacion);
  showNotification = vi.fn().mockResolvedValue(undefined);
  getRegistration = vi.fn().mockResolvedValue({ showNotification, getNotifications: vi.fn().mockResolvedValue([]) });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration },
  });
  pestanaOculta(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  // @ts-expect-error — se borra la propiedad puesta para la prueba.
  delete navigator.serviceWorker;
  pestanaOculta(false);
});

describe("el aviso de un mensaje no se lleva la pestaña equivocada", () => {
  it("con ruta, la tarjeta la muestra el service worker (no la pestaña oculta)", async () => {
    const { result } = renderHook(() => useBrowserNotifications());
    const navegarEstaPestana = vi.fn();
    result.current.notify("Ana", "hola", navegarEstaPestana, false, "/messenger?c=c1&m=m1");
    await esperar();

    expect(showNotification).toHaveBeenCalledTimes(1);
    const [titulo, opciones] = showNotification.mock.calls[0];
    expect(titulo).toBe("Ana");
    expect(opciones.tag).toBe(TAG_AVISO_DE_PAGINA);
    expect(opciones.data).toMatchObject({ url: "/messenger?c=c1&m=m1", kind: KIND_AVISO_DE_PAGINA });
    // La pestaña oculta ya no arma su propia tarjeta ni se navega a sí misma.
    expect(NotificacionDePagina).not.toHaveBeenCalled();
    expect(navegarEstaPestana).not.toHaveBeenCalled();
  });

  it("sin service worker (desarrollo) queda la tarjeta de la página, como antes", async () => {
    getRegistration.mockResolvedValue(undefined);
    const { result } = renderHook(() => useBrowserNotifications());
    result.current.notify("Ana", "hola", vi.fn(), false, "/messenger?c=c1");
    await esperar();
    expect(NotificacionDePagina).toHaveBeenCalledTimes(1);
    expect(showNotification).not.toHaveBeenCalled();
  });

  it("si el service worker falla al mostrarla, cae a la de la página (nunca cero avisos)", async () => {
    showNotification.mockRejectedValue(new Error("sin permiso"));
    const { result } = renderHook(() => useBrowserNotifications());
    result.current.notify("Ana", "hola", vi.fn(), false, "/messenger?c=c1");
    await esperar();
    await esperar();
    expect(NotificacionDePagina).toHaveBeenCalledTimes(1);
  });

  it("con la pestaña a la vista no se muestra nada (ya lo estás viendo)", async () => {
    pestanaOculta(false);
    const { result } = renderHook(() => useBrowserNotifications());
    result.current.notify("Ana", "hola", vi.fn(), false, "/messenger?c=c1");
    await esperar();
    expect(showNotification).not.toHaveBeenCalled();
    expect(NotificacionDePagina).not.toHaveBeenCalled();
  });
});

describe("el service worker abre la pestaña que ya está en esa sección", () => {
  it("el fuente cargó (si no, lo de abajo pasaría en vacío)", () => {
    expect(sw).toContain("notificationclick");
  });

  it("cualquier aviso con `kind` y `url` pasa por el camino que elige la ventana", () => {
    expect(sw).toMatch(/if \(d\.kind\) \{\s*var url = d\.url \|\| "\/";/);
  });

  it("primero busca una ventana YA en esa sección; recién si no hay, usa otra", () => {
    const i = sw.indexOf("p === pathname");
    const j = sw.indexOf("if (list.length) return enfocarYNavegar(list[0], ruta)");
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
  });
});

// TOCAR UNA ALERTA EN EL IPHONE ABRE EXACTAMENTE SU URL (Alvaro, 11/11/2026).
//
// Los avisos de Argos y de «se salió de Cowork» llevan a la vista en vivo:
// /hr/en-vivo/<persona>?alerta=<id>. Aquí se CORRE el sw-push.js de verdad (con
// un `self` de mentira) y se toca el aviso: con Maven cerrado se abre esa url
// exacta; con Maven abierto, la ventana navega a esa ruta exacta, con su ?query.
// Una url absoluta de Maven (la manda el vigilante del equipo) se recorta a la
// ruta: antes la app la descartaba y tocar el aviso no llevaba a ningún lado.
describe("tocar una alerta abre EXACTAMENTE su url (iPhone, app instalada)", () => {
  const ORIGEN = "https://app.maven-ai.me";
  type Manejador = (e: unknown) => void;

  function cargarSw(urlsDeVentanas: string[]) {
    const manejadores: Record<string, Manejador> = {};
    const openWindow = vi.fn().mockResolvedValue(undefined);
    const mensajes: Array<{ ventana: string; data: unknown }> = [];
    const ventanas = urlsDeVentanas.map((url) => {
      const v = {
        url,
        visibilityState: "hidden",
        focus: vi.fn(async () => v),
        postMessage: vi.fn((data: unknown) => { mensajes.push({ ventana: url, data }); }),
      };
      return v;
    });
    const anotado: Record<string, string> = {};
    const caches = {
      open: vi.fn(async () => ({
        put: vi.fn(async (k: string, r: { texto: string }) => { anotado[k] = r.texto; }),
      })),
    };
    class RespuestaFalsa { texto: string; constructor(cuerpo: string) { this.texto = cuerpo; } }
    const self = {
      addEventListener: (tipo: string, m: Manejador) => { manejadores[tipo] = m; },
      location: { origin: ORIGEN },
      clients: { matchAll: vi.fn(async () => ventanas), openWindow },
      registration: {},
      navigator: {},
      caches,
    };
    new Function("self", "Response", "fetch", sw)(self, RespuestaFalsa, vi.fn());
    const tocar = async (data: Record<string, unknown>) => {
      let espera: Promise<unknown> = Promise.resolve();
      manejadores.notificationclick({ notification: { close: vi.fn(), data }, waitUntil: (p: Promise<unknown>) => { espera = p; } });
      await espera;
    };
    return { tocar, openWindow, mensajes, ventanas, anotado };
  }

  const ALERTA = "/hr/en-vivo/0473bcfa-6755-486f-8b07-bfdd1dd51bc8?alerta=11111111-2222-4333-8444-555555555555";

  it("con Maven cerrado, abre la url completa con su ?alerta=", async () => {
    const sw = cargarSw([]);
    await sw.tocar({ kind: "argos_alerta", url: ALERTA });
    expect(sw.openWindow).toHaveBeenCalledWith(`${ORIGEN}${ALERTA}`);
  });

  it("con Maven abierto en otra sección, esa ventana navega a la ruta EXACTA", async () => {
    const sw = cargarSw([`${ORIGEN}/dashboard`]);
    await sw.tocar({ kind: "argos_alerta", url: ALERTA });
    expect(sw.ventanas[0].focus).toHaveBeenCalled();
    expect(sw.mensajes).toEqual([{ ventana: `${ORIGEN}/dashboard`, data: { type: "abrir-url", url: ALERTA } }]);
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it("si ya hay una ventana en esa vista, usa esa (y le cambia la alerta)", async () => {
    const sw = cargarSw([`${ORIGEN}/messenger`, `${ORIGEN}/hr/en-vivo/0473bcfa-6755-486f-8b07-bfdd1dd51bc8?alerta=vieja`]);
    await sw.tocar({ kind: "argos_alerta", url: ALERTA });
    expect(sw.mensajes).toHaveLength(1);
    expect(sw.mensajes[0].ventana).toContain("/hr/en-vivo/");
    expect(sw.mensajes[0].data).toEqual({ type: "abrir-url", url: ALERTA });
  });

  it("«se salió de Cowork» abre su vista con ?fuera=", async () => {
    const url = "/hr/en-vivo/0473bcfa-6755-486f-8b07-bfdd1dd51bc8?fuera=99999999-2222-4333-8444-555555555555";
    const sw = cargarSw([`${ORIGEN}/cowork`]);
    await sw.tocar({ kind: "cowork_fuera", url });
    expect(sw.mensajes[0].data).toEqual({ type: "abrir-url", url });
  });

  it("una url ABSOLUTA de Maven se recorta a la ruta (si no, la app la descartaba)", async () => {
    const sw = cargarSw([`${ORIGEN}/dashboard`]);
    await sw.tocar({ kind: "equipo_video_grabado", url: `${ORIGEN}/hr/en-vivo/abc?clip=1#x` });
    expect(sw.mensajes[0].data).toEqual({ type: "abrir-url", url: "/hr/en-vivo/abc?clip=1#x" });
  });

  it("una url de OTRO sitio se abre aparte y no toca las ventanas de Maven", async () => {
    const sw = cargarSw([`${ORIGEN}/dashboard`]);
    await sw.tocar({ kind: "otro", url: "https://otro.example/algo" });
    expect(sw.mensajes).toEqual([]);
    expect(sw.openWindow).toHaveBeenCalledWith("https://otro.example/algo");
  });

  it("deja la ruta anotada para la app (iOS a veces pierde el mensaje o abre en el inicio)", async () => {
    const sw = cargarSw([`${ORIGEN}/dashboard`]);
    await sw.tocar({ kind: "argos_alerta", url: ALERTA });
    const nota = JSON.parse(sw.anotado["/__aviso-pendiente"] ?? "null") as { url: string; at: number } | null;
    expect(nota?.url).toBe(ALERTA);
    expect(typeof nota?.at).toBe("number");
  });
});

describe("quién pasa la ruta", () => {
  const fuentes = (import.meta as unknown as {
    glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
  }).glob([
    "/frontend/src/hooks/useMessengerNotifications.ts",
    "/frontend/src/hooks/useWaInboxNotifications.ts",
    "/frontend/src/hooks/useTgInboxNotifications.ts",
  ], { query: "?raw", import: "default", eager: true });

  it("los tres avisos de mensajes le pasan la ruta a notify", () => {
    expect(Object.keys(fuentes)).toHaveLength(3);
    for (const [archivo, c] of Object.entries(fuentes)) {
      expect(c, archivo).toMatch(/notifyRef\.current\(\s*title,\s*body,\s*\(\) => \w+(\.current)?\(ruta\),\s*soundOk,\s*ruta,\s*\)/);
    }
  });
});
