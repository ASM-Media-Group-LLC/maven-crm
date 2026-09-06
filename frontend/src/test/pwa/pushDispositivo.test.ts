// La bandera "este dispositivo recibe push" decide si la app deja de mostrar su
// propia tarjeta con la pestaña oculta (la pone el service worker). Si la bandera
// miente hacia "sí" sin haber push, el usuario se queda sin aviso; por eso ante
// cualquier fallo de storage la respuesta es "no".
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  clavePushDispositivo,
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
