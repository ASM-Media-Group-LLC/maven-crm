import { describe, it, expect } from "vitest";
import { decidirAutoJoin } from "@/lib/coworkAutoJoin";

const base = { role: null, code: null, roomId: null, membresia: null, tieneAsignacion: false };

describe("decidirAutoJoin — la URL de Cowork nunca degrada a un host", () => {
  it("sin parámetros que pidan algo: nada", () => {
    expect(decidirAutoJoin(base)).toBe("nada");
    expect(decidirAutoJoin({ ...base, role: "host" })).toBe("nada"); // host sin código no vale
  });
  it("EL BUG: un host con ?room= en la URL se queda como host y no se une como participante", () => {
    expect(decidirAutoJoin({ ...base, roomId: "r1", membresia: { role: "host" } })).toBe("nada");
    expect(decidirAutoJoin({ ...base, roomId: "r1", membresia: { role: "host" }, tieneAsignacion: false })).toBe("nada");
  });
  it("host que llega con su propio código: ya es host, nada que hacer", () => {
    expect(decidirAutoJoin({ ...base, role: "host", code: "ABC", membresia: { role: "host" } })).toBe("nada");
  });
  it("participante con código de host sube a host", () => {
    expect(decidirAutoJoin({ ...base, role: "host", code: "ABC", membresia: { role: "participant" } })).toBe("unirse-como-host");
  });
  it("participante ya miembro: se une solo si le falta la sala", () => {
    expect(decidirAutoJoin({ ...base, roomId: "r1", membresia: { role: "participant" }, tieneAsignacion: false })).toBe("unirse-como-participante");
    expect(decidirAutoJoin({ ...base, roomId: "r1", membresia: { role: "participant" }, tieneAsignacion: true })).toBe("nada");
  });
  it("sin membresía: entra con el rol que pide la URL", () => {
    expect(decidirAutoJoin({ ...base, role: "host", code: "ABC" })).toBe("unirse-como-host");
    expect(decidirAutoJoin({ ...base, roomId: "r1" })).toBe("unirse-como-participante");
  });
});
