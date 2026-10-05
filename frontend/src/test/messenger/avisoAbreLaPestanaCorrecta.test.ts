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
    const j = sw.indexOf("if (list.length) return enfocarYNavegar(list[0], url)");
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
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
