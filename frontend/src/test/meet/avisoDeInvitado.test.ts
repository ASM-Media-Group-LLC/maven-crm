import { describe, it, expect } from "vitest";
import { invitadosNuevos } from "@/lib/avisoDeInvitado";

describe("invitadosNuevos — a quién le toca sonar", () => {
  it("la primera mirada NO suena: guarda la foto y calla", () => {
    // Entrar a la reunión y que suene de golpe por gente que ya estaba
    // golpeando —y que se ve apenas entrás— es ruido, no aviso.
    const r = invitadosNuevos(null, ["a", "b"]);
    expect(r.nuevos).toEqual([]);
    expect([...r.vistas].sort()).toEqual(["a", "b"]);
  });

  it("suena solo por el que llegó nuevo", () => {
    const r = invitadosNuevos(new Set(["a"]), ["a", "b"]);
    expect(r.nuevos).toEqual(["b"]);
  });

  it("recargar la misma lista NO vuelve a sonar", () => {
    // El panel recarga por realtime y además cada 5 s: sin esto sería un
    // timbre cada 5 segundos mientras alguien espera.
    const r = invitadosNuevos(new Set(["a", "b"]), ["a", "b"]);
    expect(r.nuevos).toEqual([]);
  });

  it("al admitir a alguien, la lista se achica y no suena", () => {
    const r = invitadosNuevos(new Set(["a", "b"]), ["b"]);
    expect(r.nuevos).toEqual([]);
    expect([...r.vistas]).toEqual(["b"]);
  });

  it("quien se fue y vuelve a golpear con otro id, suena de nuevo", () => {
    const r = invitadosNuevos(new Set(["a"]), ["c"]);
    expect(r.nuevos).toEqual(["c"]);
  });

  it("varios a la vez se reportan todos", () => {
    const r = invitadosNuevos(new Set(), ["x", "y"]);
    expect(r.nuevos).toEqual(["x", "y"]);
  });
});
