import { describe, expect, it } from "vitest";

// EL EXPEDIENTE SE EXPLICA SOLO (Alvaro, 18/11/2026):
//   · «left 416 minutes early, ¿qué significa eso?» → con el turno en curso no
//     se dice «salió antes» (todavía puede volver): se dice «fuera de Cowork
//     desde las 14:58». «Salió X min antes» solo cuando el turno ya terminó.
//   · «si lo presiono, quiero ver el detallado con un buen diseño» → cada
//     etiqueta (momentos, asistencia, pantalla, cámara) abre su detalle.
//
// Las fuentes se leen con import.meta.glob (ruta y opciones literales): el
// tsconfig de la app no trae los tipos de Node.
type Glob = { glob: (p: string | string[], o: Record<string, unknown>) => Record<string, string> };
const fuentes = (import.meta as unknown as Glob).glob(
  ["/frontend/src/components/hr/TarjetaArgos.tsx", "/frontend/src/lib/i18n/hr.ts"],
  { query: "?raw", import: "default", eager: true },
);
const fuente = (fin: string) => Object.entries(fuentes).find(([ruta]) => ruta.endsWith(fin))?.[1] ?? "";

describe("salió antes, solo con el turno terminado", () => {
  const s = fuente("TarjetaArgos.tsx");
  it("sabe si el turno ya terminó (también si es de noche)", () => {
    expect(s).toContain("const turnoNocturno = entMin != null && salMin != null && salMin <= entMin;");
    expect(s).toContain("const turnoTerminado = dia.fecha !== hoyB || (!turnoNocturno && salMin != null && ahoraMin >= salMin);");
  });
  it("con el turno en curso dice «fuera desde», no «salió antes»", () => {
    expect(s).toMatch(/else if \(turnoTerminado && difSal != null && difSal < -5\) hechos\.push\(\{ k: "hr\.exp\.mgr\.hecho\.salioAntes"/);
    expect(s).toMatch(/else if \(!turnoTerminado && dia\.salioAt && hhmm\(dia\.salioAt\)\) hechos\.push\(\{ k: "hr\.exp\.mgr\.hecho\.fueraDesde"/);
    expect(fuente("hr.ts")).toContain('"hr.exp.mgr.hecho.fueraDesde": { es: "fuera de Cowork desde las {h}"');
  });
});

describe("cada etiqueta abre su detalle", () => {
  const s = fuente("TarjetaArgos.tsx");
  it("las etiquetas son botones que abren y cierran", () => {
    expect(s).toContain("aria-expanded={h.detalle === \"fuera\" ? undefined : abierto}");
  });
  it("hay un detalle para momentos, asistencia, pantalla y cámara", () => {
    expect(s).toContain('{detalle === "momentos" && (');
    expect(s).toContain('{detalle === "asistencia" && <DetalleAsistencia a={r.asistencia} dia={dia} />}');
    expect(s).toContain('{detalle === "pantalla" && (');
    expect(s).toContain('{detalle === "camara" && (');
  });
});
