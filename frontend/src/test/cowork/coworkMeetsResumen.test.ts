import { describe, it, expect } from "vitest";
import { agregarMeetsPorPersona, agruparMeets, totalesMeets, fechaHoraCorta, type FilaMeetPersona } from "@/lib/coworkMeetsResumen";

const fila = (extra: Partial<FilaMeetPersona>): FilaMeetPersona => ({
  meet_id: "m1", session_id: "s1", session_name: "CHATTERS KASH", created_by: "sup", creador: "Jhon Lopez",
  meet_started_at: "2026-09-10T19:52:00Z", meet_ended_at: "2026-09-10T20:20:00Z", meet_seconds: 1680,
  user_id: "u1", nombre: "Diego Martinez", room_id: "r1", room_name: "PLUS 2",
  joined_at: "2026-09-10T19:52:00Z", left_at: "2026-09-10T20:10:00Z", is_open: false, seconds: 1080,
  ...extra,
});

describe("coworkMeetsResumen — lo que dice el diálogo de Pausas y meets", () => {
  const filas = [
    fila({}),
    fila({ user_id: "u2", nombre: "Claudia Giraldo", room_name: "PLUS 5", seconds: 1680 }),
    fila({ meet_id: "m2", meet_started_at: "2026-09-10T22:00:00Z", meet_ended_at: null, meet_seconds: 300, user_id: "u1", left_at: null, is_open: true, seconds: 300 }),
  ];

  it("por persona suma meets y segundos, de más a menos", () => {
    const p = agregarMeetsPorPersona(filas);
    expect(p.map((x) => [x.nombre, x.meets, x.segMeet])).toEqual([["Claudia Giraldo", 1, 1680], ["Diego Martinez", 2, 1380]]);
  });

  it("por meet agrupa a la gente, el más reciente primero, y marca el abierto", () => {
    const m = agruparMeets(filas);
    expect(m.map((x) => x.meetId)).toEqual(["m2", "m1"]);
    expect(m[0].abierto).toBe(true);
    expect(m[1].gente.map((g) => g.nombre)).toEqual(["Claudia Giraldo", "Diego Martinez"]);
    expect(m[1].creador).toBe("Jhon Lopez");
    expect(m[1].segundos).toBe(1680);
  });

  it("totales: meets distintos, personas distintas y segundos", () => {
    expect(totalesMeets(filas)).toEqual({ meets: 2, personas: 2, segMeet: 3060 });
    expect(totalesMeets([])).toEqual({ meets: 0, personas: 0, segMeet: 0 });
  });

  it("sin nombre no rompe y la fecha corta no revienta con basura", () => {
    expect(agregarMeetsPorPersona([fila({ nombre: null })])[0].nombre).toBe("Sin nombre");
    expect(fechaHoraCorta("no es fecha")).toBe("");
    expect(fechaHoraCorta("2026-09-10T19:52:00Z")).toMatch(/·/);
  });
});
