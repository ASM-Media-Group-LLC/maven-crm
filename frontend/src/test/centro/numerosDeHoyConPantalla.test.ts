import { describe, expect, it } from "vitest";
import { CIFRAS, esCifra, rutaDeCifra } from "@/lib/cifrasDeHoy";

// Alvaro, 20/11/2026: «cada cosa debería mandarme a una pantalla» (no un
// desplegable), con la gente en tarjetas en vivo; y la lista no parpadea.
const pulso = import.meta.glob("../../components/centro/PulsoEquipoVivo.tsx", { query: "?raw", import: "default", eager: true });
const atajos = import.meta.glob("../../components/centro/AtajosDeHoy.tsx", { query: "?raw", import: "default", eager: true });
const centro = import.meta.glob("../../pages/centro/CentroDeOperaciones.tsx", { query: "?raw", import: "default", eager: true });
const app = import.meta.glob("../../App.tsx", { query: "?raw", import: "default", eager: true });
const fuente = (m: Record<string, unknown>) => Object.values(m)[0] as string;

describe("los números de hoy abren su pantalla", () => {
  it("hay una ruta por número", () => {
    expect(CIFRAS).toHaveLength(11);
    expect(rutaDeCifra("tarde")).toBe("/hoy/tarde");
    expect(esCifra("con-problemas")).toBe(true);
    expect(esCifra("cualquiera")).toBe(false);
    expect(fuente(app)).toContain('<Route path="/hoy/:cifra" element={<RutaDeVigilancia><CifraDeHoy /></RutaDeVigilancia>} />');
  });

  it("cada fila del inicio lleva a su pantalla", () => {
    const a = fuente(atajos);
    for (const c of ["tarde", "llegaron", "nota-baja", "no-trabajan"]) expect(a).toContain(`href: rutaDeCifra("${c}")`);
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
