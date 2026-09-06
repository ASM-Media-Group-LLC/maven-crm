// El service worker le pide a la app que navegue al tocar una notificación. La
// url viene de nuestro propio servidor, pero un postMessage lo puede mandar
// cualquier script del origen: solo se aceptan rutas internas de Maven.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { rutaSegura, useNavegarDesdeNotificacion, TIPO_ABRIR_URL } from "@/hooks/useNavegarDesdeNotificacion";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateMock,
}));

describe("rutaSegura", () => {
  it("acepta cualquier ruta interna de Maven, con y sin query", () => {
    for (const url of [
      "/messenger?c=8a6b3d1e-0000-4000-8000-000000000001",
      "/inbox?c=abc",
      "/telegram/bandeja?c=abc",
      "/cowork?session=abc",
      "/correo",
      "/messenger",
      // deep links de la campana, que ahora también llegan al celular
      "/closers?id=ffccefcb-ed38-484e-abf6-cc1f308320db",
      "/creadores/1a6e15f6-c567-4e53-97b6-3c809935cb28",
      "/chatter-evaluator/workspace?session=Y8L79TAR",
      "/notificaciones",
    ]) {
      expect(rutaSegura({ type: TIPO_ABRIR_URL, url })).toBe(url);
    }
  });

  it("rechaza otro tipo, sin url, y todo lo que no sea una ruta interna", () => {
    expect(rutaSegura({ type: "otro", url: "/messenger" })).toBeNull();
    expect(rutaSegura({ type: TIPO_ABRIR_URL })).toBeNull();
    expect(rutaSegura({ type: TIPO_ABRIR_URL, url: "https://evil.example/messenger" })).toBeNull();
    expect(rutaSegura({ type: TIPO_ABRIR_URL, url: "//evil.example" })).toBeNull();
    expect(rutaSegura({ type: TIPO_ABRIR_URL, url: "/\\evil.example" })).toBeNull();
    expect(rutaSegura({ type: TIPO_ABRIR_URL, url: "javascript:alert(1)" })).toBeNull();
    expect(rutaSegura({ type: TIPO_ABRIR_URL, url: "messenger" })).toBeNull();
    expect(rutaSegura({ type: TIPO_ABRIR_URL, url: "/con espacio" })).toBeNull();
    expect(rutaSegura(null)).toBeNull();
    expect(rutaSegura("texto")).toBeNull();
  });
});

describe("useNavegarDesdeNotificacion", () => {
  const swFalso = new EventTarget();
  beforeEach(() => {
    navigateMock.mockReset();
    Object.defineProperty(navigator, "serviceWorker", { value: swFalso, configurable: true });
  });
  afterEach(() => {
    // @ts-expect-error limpiar el stub
    delete navigator.serviceWorker;
  });

  it("navega con un mensaje válido del SW y no con uno inválido", () => {
    const { unmount } = renderHook(() => useNavegarDesdeNotificacion());
    swFalso.dispatchEvent(new MessageEvent("message", { data: { type: TIPO_ABRIR_URL, url: "/messenger?c=1" } }));
    expect(navigateMock).toHaveBeenCalledWith("/messenger?c=1");
    swFalso.dispatchEvent(new MessageEvent("message", { data: { type: TIPO_ABRIR_URL, url: "//evil.example" } }));
    expect(navigateMock).toHaveBeenCalledTimes(1);
    unmount();
    swFalso.dispatchEvent(new MessageEvent("message", { data: { type: TIPO_ABRIR_URL, url: "/inbox?c=2" } }));
    expect(navigateMock).toHaveBeenCalledTimes(1);
  });
});
