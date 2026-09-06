// La bandera "este dispositivo recibe push" decide si la app deja de mostrar su
// propia tarjeta con la pestaña oculta (la pone el service worker). Si la bandera
// miente hacia "sí" sin haber push, el usuario se queda sin aviso; por eso ante
// cualquier fallo de storage la respuesta es "no".
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  clavePushDispositivo,
  estadoPushActual,
  marcarPushEnEsteDispositivo,
  tienePushEnEsteDispositivo,
} from "@/lib/pushDispositivo";

describe("pushDispositivo", () => {
  beforeEach(() => localStorage.clear());

  it("la clave lleva el prefijo maven: y el usuario", () => {
    expect(clavePushDispositivo("u1")).toBe("maven:push:u1");
  });

  it("sin usuario o sin bandera → false", () => {
    expect(tienePushEnEsteDispositivo(null)).toBe(false);
    expect(tienePushEnEsteDispositivo(undefined)).toBe(false);
    expect(tienePushEnEsteDispositivo("u1")).toBe(false);
  });

  it("marcar activo → true; marcar inactivo → false y sin rastro", () => {
    marcarPushEnEsteDispositivo("u1", true);
    expect(tienePushEnEsteDispositivo("u1")).toBe(true);
    expect(tienePushEnEsteDispositivo("u2")).toBe(false);
    marcarPushEnEsteDispositivo("u1", false);
    expect(tienePushEnEsteDispositivo("u1")).toBe(false);
    expect(localStorage.getItem("maven:push:u1")).toBeNull();
  });

  it("storage roto → leer da false y escribir no lanza", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(tienePushEnEsteDispositivo("u1")).toBe(false);
    expect(() => marcarPushEnEsteDispositivo("u1", true)).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });
});

describe("estadoPushActual", () => {
  const win = (permission: NotificationPermission, soporta = true) =>
    ({
      ...(soporta ? { PushManager: {}, navigator: { serviceWorker: {} } } : { navigator: {} }),
      Notification: { permission },
    }) as unknown as Window;
  beforeEach(() => localStorage.clear());

  it("iPhone sin instalar → necesita-instalar, aunque el resto esté bien", () => {
    marcarPushEnEsteDispositivo("u1", true);
    expect(estadoPushActual({ userId: "u1", plataforma: "ios-safari", instalada: false, optIn: true, win: win("granted") })).toBe("necesita-instalar");
    expect(estadoPushActual({ userId: "u1", plataforma: "ios-otro", instalada: false, optIn: true, win: win("granted") })).toBe("necesita-instalar");
  });
  it("sin soporte → no-soportado; permiso denegado → bloqueado", () => {
    expect(estadoPushActual({ userId: "u1", plataforma: "android", instalada: false, optIn: false, win: win("default", false) })).toBe("no-soportado");
    expect(estadoPushActual({ userId: "u1", plataforma: "escritorio", instalada: false, optIn: false, win: win("denied") })).toBe("bloqueado");
  });
  it("activo solo con opt-in + permiso + bandera de este dispositivo", () => {
    const base = { userId: "u1", plataforma: "android" as const, instalada: true };
    expect(estadoPushActual({ ...base, optIn: true, win: win("granted") })).toBe("inactivo");
    marcarPushEnEsteDispositivo("u1", true);
    expect(estadoPushActual({ ...base, optIn: true, win: win("granted") })).toBe("activo");
    expect(estadoPushActual({ ...base, optIn: false, win: win("granted") })).toBe("inactivo");
    expect(estadoPushActual({ ...base, optIn: true, win: win("default") })).toBe("inactivo");
  });
});
