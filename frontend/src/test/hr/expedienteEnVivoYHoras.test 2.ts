import { describe, expect, it } from "vitest";

// EL EXPEDIENTE ABRE EN VIVO Y CON TODAS LAS HORAS (Alvaro, 18/11/2026):
//   · «¿De qué me sirven los pantallazos si tiene que tener la cámara encendida?
//     Dice live: la idea es que esté live» → arriba, su pantalla y su cámara en
//     VIDEO (observador oculto de su sala), no fotos. Sin Cowork, su último
//     pantallazo y se dice por qué.
//   · «Necesito ver todas las horas» → justo debajo, una fila por hora con seis
//     casillas de 10 min (modelo Hubstaff); las horas vacías seguidas en una línea.
//
// Las fuentes se leen con import.meta.glob (ruta y opciones literales): el
// tsconfig de la app no trae los tipos de Node.
type Glob = { glob: (p: string | string[], o: Record<string, unknown>) => Record<string, string> };
const fuentes = (import.meta as unknown as Glob).glob(
  ["/frontend/src/pages/hr/HRExpediente.tsx", "/frontend/src/components/hr/AhoraEnVivo.tsx", "/frontend/src/components/hr/CronologiaDelDia.tsx"],
  { query: "?raw", import: "default", eager: true },
);
const fuente = (fin: string) => Object.entries(fuentes).find(([ruta]) => ruta.endsWith(fin))?.[1] ?? "";

describe("arriba, en vivo", () => {
  it("usa el observador en vivo y el escenario de video", () => {
    const s = fuente("AhoraEnVivo.tsx");
    expect(s).toContain("useObservadorEnVivo(userId, true, escuchar)");
    expect(s).toContain("<EscenarioEnVivo");
  });
  it("va primero en el expediente, solo hoy, y la cronología ya no repite el pantallazo", () => {
    const s = fuente("HRExpediente.tsx");
    const vivo = s.indexOf("<AhoraEnVivo userId={userId} capturas={dia.capturas} />");
    const horas = s.indexOf('id="expediente-todo-el-dia"');
    const cron = s.indexOf("<CronologiaDelDia");
    expect(vivo).toBeGreaterThan(0);
    expect(horas).toBeGreaterThan(vivo);
    expect(cron).toBeGreaterThan(horas);
    expect(s).toContain("esHoy && <AhoraEnVivo");
    expect(fuente("CronologiaDelDia.tsx")).toContain("const mostrarAhora = false;");
  });
});

describe("todas las horas", () => {
  const s = fuente("HRExpediente.tsx");
  it("seis casillas de 10 minutos por hora", () => {
    expect(s).toContain("Array.from({ length: 6 }");
    expect(s).toContain("Math.floor(new Date(m.createdAt).getMinutes() / 10) === i");
  });
  it("las horas vacías seguidas se juntan en una línea", () => {
    expect(s).toContain('filas.push({ tipo: "hueco"');
  });
  it("solo se firma lo que se ve (una foto por casilla y el visor)", () => {
    expect(s).toContain("const aFirmar = useMemo(");
    expect(s).not.toContain("setAbiertas");
  });
});
