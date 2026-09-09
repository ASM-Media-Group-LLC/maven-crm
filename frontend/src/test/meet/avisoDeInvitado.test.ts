import { describe, it, expect } from "vitest";
import { invitadosNuevos } from "@/lib/avisoDeInvitado";

describe("invitadosNuevos — a quién le toca sonar", () => {
  it("la primera mirada NO suena: guarda la foto y calla", () => {
    // Entrar a la reunión y que suene de golpe por gente que ya estaba
    // golpeando —y que se ve apenas entrás— es ruido, no aviso.
    const r = invitadosNuevos(new Set(), ["a", "b"], true);
    expect(r.nuevos).toEqual([]);
    expect([...r.vistas].sort()).toEqual(["a", "b"]);
  });

  it("suena solo por el que llegó nuevo", () => {
    const r = invitadosNuevos(new Set(["a"]), ["a", "b"], false);
    expect(r.nuevos).toEqual(["b"]);
  });

  it("recargar la misma lista NO vuelve a sonar", () => {
    // El panel recarga por realtime y además cada 5 s: sin esto sería un
    // timbre cada 5 segundos mientras alguien espera.
    const r = invitadosNuevos(new Set(["a", "b"]), ["a", "b"], false);
    expect(r.nuevos).toEqual([]);
  });

  it("al admitir a alguien, la lista se achica y no suena", () => {
    const r = invitadosNuevos(new Set(["a", "b"]), ["b"], false);
    expect(r.nuevos).toEqual([]);
    expect([...r.vistas]).toEqual(["b"]);
  });

  it("quien se fue y vuelve a golpear con otro id, suena de nuevo", () => {
    const r = invitadosNuevos(new Set(["a"]), ["c"], false);
    expect(r.nuevos).toEqual(["c"]);
  });

  it("varios a la vez se reportan todos", () => {
    const r = invitadosNuevos(new Set(), ["x", "y"], false);
    expect(r.nuevos).toEqual(["x", "y"]);
  });

  it("la primera mirada calla aunque ya tengamos algo anotado", () => {
    // El turno de "primera" lo reclama quien EMPIEZA la consulta. Si lo
    // decidiera quien termina primero, una respuesta que se adelanta se
    // declararía la primera, no sonaría, y ese invitado no haría sonar nada
    // nunca.
    const r = invitadosNuevos(new Set(["a"]), ["a", "b"], true);
    expect(r.nuevos).toEqual([]);
    expect([...r.vistas].sort()).toEqual(["a", "b"]);
  });
});
