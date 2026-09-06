// El service worker le pide a la app que navegue al tocar una notificación. La
// url viene de nuestro propio servidor, pero un postMessage lo puede mandar
// cualquier script del origen: solo se aceptan las secciones que tienen avisos.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { rutaSegura, useNavegarDesdeNotificacion, TIPO_ABRIR_URL } from "@/hooks/useNavegarDesdeNotificacion";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateMock,
}));

describe("rutaSegura", () => {
  it("acepta las cuatro secciones con avisos, con y sin query", () => {
    for (const url of [
      "/messenger?c=8a6b3d1e-0000-4000-8000-000000000001",
      "/inbox?c=abc",
      "/telegram/bandeja?c=abc",
      "/cowork?session=abc",
      "/correo",
      "/messenger",
    ]) {
      expect(rutaSegura({ type: TIPO_ABRIR_URL, url })).toBe(url);
    }
  });

  it("rechaza otro tipo, sin url, urls externas y secciones fuera de la lista", () => {
    expect(rutaSegura({ type: "otro", url: "/messenger" })).toBeNull();
    expect(rutaSegura({ type: TIPO_ABRIR_URL })).toBeNull();
    expect(rutaSegura({ type: TIPO_ABRIR_URL, url: "https://evil.example/messenger" })).toBeNull();
    expect(rutaSegura({ type: TIPO_ABRIR_URL, url: "//evil.example" })).toBeNull();
    expect(rutaSegura({ type: TIPO_ABRIR_URL, url: "/dashboard" })).toBeNull();
    expect(rutaSegura({ type: TIPO_ABRIR_URL, url: "/messengerx" })).toBeNull();
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
    swFalso.dispatchEvent(new MessageEvent("message", { data: { type: TIPO_ABRIR_URL, url: "/dashboard" } }));
    expect(navigateMock).toHaveBeenCalledTimes(1);
    unmount();
    swFalso.dispatchEvent(new MessageEvent("message", { data: { type: TIPO_ABRIR_URL, url: "/inbox?c=2" } }));
    expect(navigateMock).toHaveBeenCalledTimes(1);
  });
});
