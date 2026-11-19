import { describe, expect, it } from "vitest";
import {
  aGuardar, alternarDia, cambio, mismaHoraTodos, ponerHoraATodos, semanaInicial, trabaja, validarSemana,
} from "@/lib/horarioSemana";
import { armarHoyDelEquipo } from "@/lib/llegadas";

// HORARIOS CONFIRMADOS (Alvaro, 19/11/2026): un horario por persona, día por día,
// con base en su puesto; RR. HH./supervisor lo confirma; sin confirmar no hay
// «tarde» ni «falta» (Yerson salía 8 h tarde porque cambió de turno).

describe("semana del editor", () => {
  it("sin semana guardada arranca con la base del puesto todos los días, lunes primero", () => {
    const d = semanaInicial({ semana: null, base_entrada: "08:00:00", base_salida: "16:00:00" });
    expect(d.map((x) => x.dia)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(d.every((x) => x.entrada === "08:00" && x.salida === "16:00")).toBe(true);
  });
  it("con semana guardada respeta los descansos", () => {
    const d = semanaInicial({ semana: [{ dia: 0, entrada: null, salida: null }, { dia: 1, entrada: "16:00:00", salida: "00:00:00" }], base_entrada: "08:00", base_salida: "16:00" });
    expect(d.find((x) => x.dia === 0)?.entrada).toBeNull();
    expect(d.find((x) => x.dia === 1)?.entrada).toBe("16:00");
  });
  it("marcar descanso, cambiar la hora a todos y volver a prender un día", () => {
    let d = semanaInicial({ semana: null, base_entrada: "08:00", base_salida: "16:00" });
    d = alternarDia(d, 0, null);
    expect(trabaja(d.find((x) => x.dia === 0)!)).toBe(false);
    d = ponerHoraATodos(d, "16:00", "00:00");
    expect(mismaHoraTodos(d)).toEqual({ entrada: "16:00", salida: "00:00" });
    d = alternarDia(d, 0, { entrada: "08:00", salida: "16:00" });
    expect(d.find((x) => x.dia === 0)?.entrada).toBe("16:00");
  });
  it("no se confirma una semana sin días de trabajo; se guardan los 7 días ordenados", () => {
    const vacia = semanaInicial({ semana: null, base_entrada: null, base_salida: null });
    expect(validarSemana(vacia)).toBe("sinDias");
    const d = semanaInicial({ semana: null, base_entrada: "08:00", base_salida: "16:00" });
    expect(validarSemana(d)).toBeNull();
    expect(aGuardar(d).map((x) => x.dia)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(cambio(d, alternarDia(d, 3, null))).toBe(true);
  });
});

describe("sin horario confirmado no hay tarde ni falta", () => {
  const donde = [
    { user_id: "yerson", nombre: "Yerson", equipo: "Chatters", entrada: "08:00:00", estado: "trabajando", estado_desde: null },
    { user_id: "ana", nombre: "Ana", equipo: "Chatters", entrada: "08:00:00", estado: "trabajando", estado_desde: null },
    { user_id: "nadie", nombre: "Nadie", equipo: "PR", entrada: "08:00:00", estado: "no_ha_entrado", estado_desde: null },
  ] as never[];
  const llegadas = new Map([["yerson", "2026-11-18T21:18:00Z"], ["ana", "2026-11-18T13:30:00Z"]]);
  it("con la lista de confirmados, solo cuenta a los confirmados", () => {
    const h = armarHoyDelEquipo(donde, llegadas, new Map(), new Set(["ana"]));
    expect(h.tarde.map((p) => p.userId)).toEqual(["ana"]);
    expect(h.faltan).toHaveLength(0);
  });
  it("si no se pudo leer la lista, se mide como antes", () => {
    const h = armarHoyDelEquipo(donde, llegadas, new Map(), null);
    expect(h.tarde.map((p) => p.userId).sort()).toEqual(["ana", "yerson"]);
    expect(h.faltan.map((p) => p.userId)).toEqual(["nadie"]);
  });
});
