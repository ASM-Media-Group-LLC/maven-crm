import { describe, it, expect } from "vitest";
import { debeIrAlSuyo, decidirAutoJoin, salaParaAutoUnir } from "@/lib/coworkAutoJoin";

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

// EL BUG (19/10/2026): Grace solo había estado en COORDINADORES. getMyLastRoomId
// resucita asignaciones INACTIVAS, así que su "última sala" era un fantasma, y la
// lógica vieja (última sala manda) la devolvía a Coordinadores ignorando el link
// de Chatters. Ahora el link del coordinador manda; la última sala solo se usa si
// el link no trae sala. Para mover a propósito está el código (joinByCode).
describe("salaParaAutoUnir — el link del coordinador manda sobre la última sala", () => {
  it("si el link trae sala, ESA manda aunque tengas una última sala (fantasma)", () => {
    expect(salaParaAutoUnir("sala-del-link", "mi-sala")).toBe("sala-del-link");
  });
  it("link sin sala: reanuda tu última sala", () => {
    expect(salaParaAutoUnir(null, "mi-sala")).toBe("mi-sala");
  });
  it("sin link ni historial: nada", () => {
    expect(salaParaAutoUnir(null, null)).toBe(null);
  });
});

// EL ENLACE NO ES SU COWORK (14/11/2026): 7 personas quedaron en «Unirse» desde el
// Cowork por departamento (13/11) porque su pestaña tenía el enlace del de antes.

describe("debeIrAlSuyo: un enlace que no es su Cowork la manda al suyo", () => {
  const base = {
    sessionId: "s-vieja", veTodasLasSesiones: false, cargando: false, sesionNoVisible: false,
    estado: "active" as string | null, membresiasCargadas: true, tieneMembresia: false, conCodigo: false,
  };
  it("la sesión no es visible (0 filas), se cerró, o no es miembro → al suyo", () => {
    expect(debeIrAlSuyo({ ...base, sesionNoVisible: true, estado: null })).toBe(true);
    expect(debeIrAlSuyo({ ...base, estado: "ended", tieneMembresia: true })).toBe(true);
    expect(debeIrAlSuyo(base)).toBe(true);
  });
  it("en su propio Cowork se queda", () => {
    expect(debeIrAlSuyo({ ...base, tieneMembresia: true })).toBe(false);
  });
  it("nunca mientras carga, sin membresías leídas, con código, sin enlace, ni a quien ve todas", () => {
    expect(debeIrAlSuyo({ ...base, cargando: true })).toBe(false);
    expect(debeIrAlSuyo({ ...base, membresiasCargadas: false })).toBe(false);
    expect(debeIrAlSuyo({ ...base, conCodigo: true, sesionNoVisible: true })).toBe(false);
    expect(debeIrAlSuyo({ ...base, sessionId: null })).toBe(false);
    expect(debeIrAlSuyo({ ...base, veTodasLasSesiones: true, sesionNoVisible: true })).toBe(false);
  });
});
