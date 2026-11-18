import { describe, expect, it } from "vitest";
import { armarHoyDelEquipo, contarPuntualidad, minutosTarde, TOLERANCIA_TARDE_MIN } from "@/lib/llegadas";
import { ultimos7 } from "@/hooks/usePuntualidadSemana";
import type { FilaDondeEsta } from "@/hooks/useDondeEsta";

// EL INICIO DICE LO QUE ALVARO QUIERE SABER PRIMERO (18/11/2026, preguntas y
// respuestas): quién llegó tarde (más de 5 min), quién llegó, quién va abajo en
// puntos y quién no está trabajando; la gráfica de horas totales se cambió por
// la puntualidad de la semana; y «Salas en vivo» muestra las caras de quién
// está adentro de verdad.
//
// Las fuentes se leen con import.meta.glob (ruta y opciones literales): el
// tsconfig de la app no trae los tipos de Node.
type Glob = { glob: (p: string | string[], o: Record<string, unknown>) => Record<string, string> };
const fuentes = (import.meta as unknown as Glob).glob(
  [
    "/frontend/src/pages/centro/CentroDeOperaciones.tsx",
    "/frontend/src/components/centro/PulsoEquipoVivo.tsx",
    "/supabase/functions/_shared/cors.ts",
    "/supabase/functions/cowork-session/index.ts",
  ],
  { query: "?raw", import: "default", eager: true },
);
const fuente = (fin: string) => Object.entries(fuentes).find(([ruta]) => ruta.endsWith(fin))?.[1] ?? "";

// 10:00 en Bogotá = 15:00 UTC.
const a = (hhmm: string, dia = "2026-11-18") => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10)), h + 5, m)).toISOString();
};

const fila = (nombre: string, estado: string, entrada: string | null, extra: Partial<FilaDondeEsta> = {}): FilaDondeEsta => ({
  user_id: `u-${nombre}`, nombre, puesto: "Chatter", equipo: "Chatters", entrada, salida: "18:00:00", en_turno: true,
  estado, estado_desde: a("12:00"), ultimo_latido: null, pantalla_at: null, pantalla_que: null,
  pantalla_fuera_de_lugar: null, captura_at: null, fuera_hoy_veces: 0, fuera_hoy_min: 0, exento: false, ...extra,
});

describe("¿llegó tarde?", () => {
  it("más de 5 min después de su hora es tarde; 5 justos, todavía no", () => {
    expect(TOLERANCIA_TARDE_MIN).toBe(5);
    expect(minutosTarde("10:00:00", a("10:05"))).toBeNull();
    expect(minutosTarde("10:00:00", a("10:06"))).toBe(6);
    expect(minutosTarde("10:00", a("09:40"))).toBeNull();
  });
  it("sin horario o sin llegada no se inventa nada", () => {
    expect(minutosTarde(null, a("11:00"))).toBeNull();
    expect(minutosTarde("10:00:00", null)).toBeNull();
  });
  it("el turno de noche que sigue después de medianoche no es «tarde»", () => {
    expect(minutosTarde("22:00:00", a("00:00"))).toBeNull();
  });
});

describe("los cuatro atajos de hoy", () => {
  const donde = [
    fila("Ana", "activo", "08:00:00"),
    fila("Beto", "fuera_de_cowork", "10:00:00"),
    fila("Caro", "no_ha_entrado", "09:00:00"),
    fila("Dani", "sin_pantalla", "08:00:00"),
    fila("Eva", "fuera_de_turno", "16:00:00"),
  ];
  const llegadas = new Map([["u-Ana", a("07:58")], ["u-Beto", a("10:40")], ["u-Dani", a("08:10")]]);
  const notas = new Map<string, number | null>([["u-Ana", 85], ["u-Beto", 40], ["u-Dani", 55]]);
  const hoy = armarHoyDelEquipo(donde, llegadas, notas);

  it("llegaron, en orden de llegada; y quién falta", () => {
    expect(hoy.llegaron.map((p) => p.nombre)).toEqual(["Ana", "Dani", "Beto"]);
    expect(hoy.faltan.map((p) => p.nombre)).toEqual(["Caro"]);
  });
  it("tarde: el más tarde primero, con sus minutos", () => {
    expect(hoy.tarde.map((p) => [p.nombre, p.tardeMin])).toEqual([["Beto", 40], ["Dani", 10]]);
  });
  it("no están trabajando: fuera, sin pantalla o sin entrar; fuera de turno no cuenta", () => {
    expect(hoy.noTrabajan.map((p) => p.nombre).sort()).toEqual(["Beto", "Caro", "Dani"]);
  });
  it("por nota, de la más baja a la más alta", () => {
    expect(hoy.porNota.map((p) => [p.nombre, p.nota])).toEqual([["Beto", 40], ["Dani", 55], ["Ana", 85]]);
  });
});

describe("puntualidad de la semana", () => {
  it("los 7 días terminan hoy, también al cruzar de mes", () => {
    expect(ultimos7("2026-12-02")).toEqual(["2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
  });
  it("cuenta por día con el horario de ESE día; el día libre no cuenta", () => {
    const dias = ["2026-11-17", "2026-11-18"];
    const filas = [
      { dia: "2026-11-17", user_id: "u1", nombre: "Ana", primer_ingreso: a("08:20", "2026-11-17") },
      { dia: "2026-11-17", user_id: "u2", nombre: "Beto", primer_ingreso: a("09:00", "2026-11-17") },
      { dia: "2026-11-18", user_id: "u1", nombre: "Ana", primer_ingreso: a("08:02") },
      { dia: "2026-11-18", user_id: "u2", nombre: "Beto", primer_ingreso: a("11:00") },
    ];
    // Beto el 18 tenía libre (sin entrada): no cuenta ni como llegada ni como tarde.
    const entrada = (dia: string, id: string) => (id === "u2" && dia === "2026-11-18" ? null : id === "u2" ? "09:00:00" : "08:00:00");
    const r = contarPuntualidad(dias, "2026-11-18", filas, entrada);
    expect(r.map((d) => [d.dia, d.llegaron, d.tarde.map((p) => p.nombre)])).toEqual([
      ["2026-11-17", 2, ["Ana"]],
      ["2026-11-18", 1, []],
    ]);
    expect(r[1].esHoy).toBe(true);
  });
});

describe("en el inicio", () => {
  it("la gráfica de horas totales se fue; está la puntualidad", () => {
    const s = fuente("CentroDeOperaciones.tsx");
    expect(s).toContain("<PuntualidadSemana />");
    expect(s).not.toContain("useProductividad7Dias");
  });
  it("los atajos van primero en «Los números de hoy»", () => {
    expect(fuente("PulsoEquipoVivo.tsx")).toContain("filas={[...atajos, ...filas, ...extra]}");
  });
  it("si las salas no cargan, «En Cowork ahora» dice «–», no 0", () => {
    expect(fuente("CentroDeOperaciones.tsx")).toContain("coworkConectados={sesionesQ.isLoading || sesionesQ.isError ? null : vivo.conectados}");
  });
  it("las salas traen quién está adentro de verdad (LiveKit), sin los que miran escondidos", () => {
    const e = fuente("cowork-session/index.ts");
    expect(e).toContain("livekit.RoomService/ListParticipants");
    expect(e).toMatch(/p\.permission\?\.hidden \|\| \/__\(vigia\|incognito\)\/\.test\(identidad\)/);
    expect(e).toContain("adentro: adentroPorSala.has(r.id)");
  });
  it("la vista local en 8081 puede hablar con las funciones", () => {
    expect(fuente("_shared/cors.ts")).toContain('"http://localhost:8081"');
  });
});
