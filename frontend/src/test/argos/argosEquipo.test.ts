import { describe, it, expect } from "vitest";
import { armarDeptosDelDia, armarEquipoHoy, motivosDelDia, type FilaDonde, type FilaTurno } from "@/lib/argosEquipo";

// GUARDA de «Equipo hoy» y de los departamentos de «El día» (Alvaro, 11/11/2026:
// «me pierdo», «solo un 89 no me dice nada»). Va mal = cualquiera de cuatro: falla
// abierta ahora, nota de hoy bajo 60, fuera de Cowork en su turno o llegó tarde.
// La pausa en su tiempo NO es ir mal.

const AHORA = Date.parse("2026-11-11T15:00:00-05:00");
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();
const d = (nombre: string, estado: string, extra: Partial<FilaDonde> = {}): FilaDonde => ({
  user_id: nombre, nombre, equipo: "Chatters", entrada: "08:00:00", salida: "16:00:00", en_turno: true, estado, estado_desde: hace(14), pantalla_que: null, ...extra,
});
const p = (nombre: string, nota: number, extra: Partial<FilaTurno> = {}): FilaTurno => ({
  userId: nombre, nombre, equipo: "Chatters", nota: { valor: nota }, pantallaPct: 95, camaraPct: 95, horasTurno: 6.5, tardeMin: null,
  segActivo: 6.5 * 3600, segSinPantalla: 0, segSinCamara: 0, segFueraCamara: 0, juzgadas: 60, juzgadasOk: 60, ...extra,
});

describe("Equipo hoy (en vivo)", () => {
  const armado = armarEquipoHoy([
    d("Ana", "activo"),
    d("Isabel", "sin_camara"),
    d("Karem", "fuera_de_cowork", { estado_desde: hace(25) }),
    d("Caro", "pausa"),
    d("Eva", "no_ha_entrado", { estado_desde: null }),
    d("Beto", "activo", { equipo: "PR" }),
    d("Luis", "fuera_de_turno", { en_turno: false }),
    d("Dani", "activo"),
  ], [p("Ana", 92, { tardeMin: 7 })], [
    { user_id: "Dani", tipo: "celular", abierta_at: hace(3), detalle: "Usa el celular" },
    { user_id: "Ana", tipo: "sin_senal", abierta_at: hace(9), detalle: null },
  ], AHORA);

  it("las cifras de todo el equipo", () => {
    expect(armado.resumen).toEqual({ total: 7, conectados: 5, bien: 2, mal: 4, tarde: 1, noEstan: 2 });
  });

  it("va mal con su porqué en minutos (llegar tarde también); la pausa en su tiempo y «sin señal» no cuentan", () => {
    const chatters = armado.deptos.find((x) => x.nombre === "Chatters")!;
    const de = (n: string) => chatters.personas.find((x) => x.nombre === n)!;
    expect(de("Isabel")).toMatchObject({ grupo: "mal", motivos: [{ clave: "sinCamara", n: 14 }] });
    expect(de("Karem")).toMatchObject({ grupo: "mal", motivos: [{ clave: "fueraCowork", n: 25 }] });
    expect(de("Dani").motivos[0]).toMatchObject({ clave: "alerta", tipo: "celular", n: 3 });
    expect(de("Caro").grupo).toBe("bien");
    expect(de("Ana")).toMatchObject({ grupo: "mal", motivos: [{ clave: "tarde", n: 7 }] });
    // Su nota de hoy es sobre lo que va de su turno (8:00 → 15:00), no sobre el día entero.
    expect(de("Ana").nota).toBeGreaterThanOrEqual(90);
    expect(de("Eva")).toMatchObject({ grupo: "noEsta", motivos: [{ clave: "noEntro", n: 420 }] });
    expect(de("Luis").grupo).toBe("fueraDeTurno");
  });

  it("el departamento con más gente yendo mal va primero, y adentro el que lleva más tiempo", () => {
    expect(armado.deptos.map((x) => x.nombre)).toEqual(["Chatters", "PR"]);
    const mal = armado.deptos[0].personas.filter((x) => x.grupo === "mal").map((x) => x.nombre);
    expect(mal).toEqual(["Karem", "Isabel", "Ana", "Dani"]);
  });
});

describe("El día (por fecha)", () => {
  it("fue mal quien sacó menos de 60, con el porqué en minutos; quien no vino va aparte", () => {
    const armado = armarDeptosDelDia([
      p("Isabel", 33, { pantallaPct: 16, horasTurno: 1.48, segActivo: 5288, segSinCamara: 60, tardeMin: 2, juzgadas: 18, juzgadasOk: 18 }),
      p("Ana", 92),
    ], [{ userId: "Eva", nombre: "Eva", equipo: "Chatters" }, { userId: "Ana", nombre: "Ana", equipo: "Chatters" }], 10);
    const c = armado.deptos[0];
    expect(c).toMatchObject({ total: 3, conectados: 2, bien: 1, mal: 1, noEstan: 1, tarde: 1 });
    const isa = c.personas.find((x) => x.nombre === "Isabel")!;
    // La nota de siempre sobre su turno de 10 h: la misma 33 del expediente.
    expect(isa.nota).toBe(33);
    expect(isa.motivos.map((m) => [m.clave, m.n])).toEqual([["conectado", 89], ["tarde", 2], ["sinCamara", 1]]);
  });

  it("los pantallazos fuera de lugar entran al porqué", () => {
    expect(motivosDelDia(p("X", 50, { juzgadas: 20, juzgadasOk: 17 }), 8)).toEqual([{ clave: "flojos", n: 3 }]);
  });
});
