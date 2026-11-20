import { describe, expect, it } from "vitest";
import { CIFRAS, esCifra, rutaDeCifra } from "@/lib/cifrasDeHoy";
import { armarHoyDelEquipo, diaDelTurno, llegadasDeHoy } from "@/lib/llegadas";
import type { FilaDondeEsta } from "@/hooks/useDondeEsta";

// Alvaro, 20/11/2026: «cada cosa debería mandarme a una pantalla» (no un
// desplegable), con la gente en tarjetas en vivo; y la lista no parpadea.
const pulso = import.meta.glob("../../components/centro/PulsoEquipoVivo.tsx", { query: "?raw", import: "default", eager: true });
const atajos = import.meta.glob("../../components/centro/AtajosDeHoy.tsx", { query: "?raw", import: "default", eager: true });
const centro = import.meta.glob("../../pages/centro/CentroDeOperaciones.tsx", { query: "?raw", import: "default", eager: true });
const app = import.meta.glob("../../App.tsx", { query: "?raw", import: "default", eager: true });
const fuente = (m: Record<string, unknown>) => Object.values(m)[0] as string;

describe("los números de hoy abren su pantalla", () => {
  it("hay una ruta por número", () => {
    expect(CIFRAS).toHaveLength(12);
    expect(rutaDeCifra("tarde")).toBe("/hoy/tarde");
    expect(esCifra("con-problemas")).toBe(true);
    expect(esCifra("cualquiera")).toBe(false);
    expect(fuente(app)).toContain('<Route path="/hoy/:cifra" element={<RutaDeVigilancia><CifraDeHoy /></RutaDeVigilancia>} />');
  });

  it("cada fila del inicio lleva a su pantalla", () => {
    const a = fuente(atajos);
    for (const c of ["tarde", "llegaron", "horarios", "nota-baja", "no-trabajan"]) expect(a).toContain(`href: rutaDeCifra("${c}")`);
    expect(a).not.toContain("desplegable:");
    const p = fuente(pulso);
    for (const c of ["en-cowork", "nota-equipo", "trabajando", "con-problemas"]) expect(p).toContain(`href: rutaDeCifra("${c}")`);
    const ce = fuente(centro);
    for (const c of ["cowork-hoy", "mensajes", "respuesta"]) expect(ce).toContain(`href: rutaDeCifra("${c}")`);
  });

  it("sin el contador de «última ronda» que hacía parpadear la lista", () => {
    const p = fuente(pulso);
    const inicio = p.slice(p.indexOf("export function NumerosDelInicio"), p.indexOf("export default function PulsoEquipoVivo"));
    expect(inicio).not.toContain("ultimaRonda");
    expect(inicio).toContain('t("dashboard.pulso.enVivoDetalle")');
  });
});


// «Está todo mezclado, de hoy y de ayer» (20/11/2026): el turno de 4 p. m. a 12
// a. m. salía «llegó a las 12:00 a. m., a tiempo» por los minutos de anoche.
describe("llegó = su marca de entrada del turno de hoy", () => {
  const hoy = "2026-11-20";
  const fila = (id: string, entrada: string | null, estado = "fuera_de_turno"): FilaDondeEsta => ({
    user_id: id, nombre: id, puesto: null, equipo: null, entrada, salida: entrada ? "00:00:00" : null, en_turno: false,
    estado, estado_desde: null, ultimo_latido: null, pantalla_at: null, pantalla_que: null, pantalla_fuera_de_lugar: null,
    captura_at: null, fuera_hoy_veces: 0, fuera_hoy_min: 0, exento: false,
  });

  it("el turno es del día en que empieza (con 30 min de margen antes de medianoche)", () => {
    expect(diaDelTurno("2026-11-19T21:00:00Z")).toBe("2026-11-19"); // 4:00 p. m. del 19
    expect(diaDelTurno("2026-11-20T04:50:00Z")).toBe("2026-11-20"); // 11:50 p. m. del 19, para el turno de las 12
  });

  it("la cola de anoche no cuenta como llegada; la marca de hoy sí", () => {
    const marcas = [{ user_id: "diego", inicio: "2026-11-19T20:59:00Z" }, { user_id: "ana", inicio: "2026-11-20T12:58:00Z" }];
    const primer = new Map([["diego", "2026-11-20T05:12:00Z"], ["luis", "2026-11-20T05:01:00Z"]]);
    const entrada = (id: string) => (id === "luis" || id === "diego" ? "16:00:00" : "08:00:00");
    const m = llegadasDeHoy(hoy, marcas, primer, entrada);
    expect(m.get("ana")).toBe("2026-11-20T12:58:00Z");
    expect(m.has("diego")).toBe(false); // marcó ayer; lo de las 12:12 a. m. es de anoche
    expect(m.has("luis")).toBe(false); // sin marca: su primera vez en Cowork es la cola de anoche
  });

  it("quien entra más tarde no falta ni llegó", () => {
    const r = armarHoyDelEquipo([fila("diego", "16:00:00"), fila("ana", "08:00:00", "no_ha_entrado")], new Map(), new Map(), null, 10 * 60);
    expect(r.entranMasTarde.map((p) => p.userId)).toEqual(["diego"]);
    expect(r.faltan.map((p) => p.userId)).toEqual(["ana"]);
    expect(r.llegaron).toHaveLength(0);
    expect(r.conTurno.map((p) => p.userId)).toEqual(["ana", "diego"]);
  });
});
