// El botón "Activar en este dispositivo". Dos reglas que no se ven a simple
// vista y que, rotas, dejan a alguien sin avisos para siempre:
//  · en iPhone sin instalar NO se pide el permiso (se quemaría la única
//    oportunidad y ni siquiera hay PushManager);
//  · el permiso se pide ANTES de cualquier otra cosa asíncrona (Safari exige que
//    sea dentro del gesto; un fetch previo lo invalida).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const orden: string[] = [];
const suscribir = vi.fn(async () => { orden.push("suscribir"); return {} as PushSubscription; });
const mutateAsync = vi.fn(async () => { orden.push("opt-in"); });
let plataforma: "ios-safari" | "android" = "android";
let instalada = false;

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ t: (k: string) => k }) }));
vi.mock("@/hooks/useNotificationSettings", () => ({
  useNotificationSettings: () => ({ settings: { push_enabled: false }, updateSettings: { mutateAsync } }),
}));
vi.mock("@/hooks/useInstalarMaven", () => ({ useInstalarMaven: () => ({ plataforma, instalada }) }));
vi.mock("@/lib/pushDispositivo", async (orig) => ({
  ...(await orig<typeof import("@/lib/pushDispositivo")>()),
  suscribirEsteDispositivo: (...a: unknown[]) => suscribir(...(a as [])),
  desuscribirEsteDispositivo: vi.fn(async () => {}),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { usePushDispositivo } from "@/hooks/usePushDispositivo";

function conNotification(permission: NotificationPermission) {
  const requestPermission = vi.fn(async () => { orden.push("permiso"); return "granted" as NotificationPermission; });
  Object.defineProperty(window, "Notification", { value: { permission, requestPermission }, configurable: true, writable: true });
  Object.defineProperty(window, "PushManager", { value: {}, configurable: true, writable: true });
  Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true });
  return requestPermission;
}

describe("usePushDispositivo.activar", () => {
  beforeEach(() => {
    orden.length = 0;
    suscribir.mockClear();
    mutateAsync.mockClear();
    localStorage.clear();
  });

  it("iPhone sin instalar: no pide permiso ni toca el servidor", async () => {
    plataforma = "ios-safari"; instalada = false;
    const requestPermission = conNotification("default");
    const { result } = renderHook(() => usePushDispositivo());
    expect(result.current.estado).toBe("necesita-instalar");
    let ok = true;
    await act(async () => { ok = await result.current.activar(); });
    expect(ok).toBe(false);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(suscribir).not.toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("Android: permiso PRIMERO, luego suscripción, luego opt-in, y deja la bandera", async () => {
    plataforma = "android"; instalada = false;
    conNotification("default");
    const { result } = renderHook(() => usePushDispositivo());
    expect(result.current.estado).toBe("inactivo");
    let ok = false;
    await act(async () => { ok = await result.current.activar(); });
    expect(ok).toBe(true);
    expect(orden).toEqual(["permiso", "suscribir", "opt-in"]);
    expect(mutateAsync).toHaveBeenCalledWith({ push_enabled: true });
    expect(localStorage.getItem("maven:push:u1")).toBe("1");
  });
});
