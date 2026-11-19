import { describe, expect, it } from "vitest";
import { chipsDelCaso, fotosDelCaso, fraseValida, hoyBogota, tonoAviso, veRevision } from "@/lib/casosArgos";
import { CATALOGO_POSICIONES } from "@/lib/posiciones/catalogo";

// Revisión de RR. HH. (19/11/2026): un caso por persona y día; RR. HH. juzga
// con frase obligatoria; todo cuelga del puesto; cada paso avisa.

const migraciones = import.meta.glob("../../../../supabase/migrations/20261119140000_argos_casos_rrhh.sql", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const sql = Object.values(migraciones)[0] ?? "";

describe("chips del caso", () => {
  it("ordena de lo grave a lo suave y salta lo vacío", () => {
    const chips = chipsDelCaso({
      alertas: { sin_senal: { n: 2, min: 20 }, celular: { n: 2, min: 14 }, distraido: { n: 0, min: 0 } },
      reportes_n: 1,
      actividad: { ajenas_min: 40, sin_tocar_min: 35, top_ajenas: [{ nombre: "YouTube", min: 30 }] },
      llamados_n: 3,
    });
    expect(chips.map((c) => c.clave)).toEqual(["celular", "reportes", "ajenas", "sin_tocar", "sin_senal", "llamados"]);
    expect(chips[0].tono).toBe("grave");
    expect(chips.find((c) => c.clave === "ajenas")?.vars).toEqual({ app: "YouTube", min: 40 });
  });

  it("no inventa chips si no hay nada", () => {
    expect(chipsDelCaso({})).toEqual([]);
    expect(chipsDelCaso(null)).toEqual([]);
  });

  it("no entró a Cowork va primero", () => {
    expect(chipsDelCaso({ no_entro: { llamados: 3 } })[0].clave).toBe("no_entro");
  });
});

describe("reglas de la revisión", () => {
  it("la frase es obligatoria", () => {
    expect(fraseValida("  ")).toBe(false);
    expect(fraseValida("ok")).toBe(false);
    expect(fraseValida("Tenía permiso")).toBe(true);
  });

  it("fotos sin repetir, la principal primero", () => {
    expect(fotosDelCaso({ foto_path: "a.jpg", resumen: { fotos: ["b.jpg", "a.jpg"] } })).toEqual(["a.jpg", "b.jpg"]);
  });

  it("ve la pestaña quien tenga alguna función o es dueño", () => {
    const nada = { juzgar: false, obligado: false, corregir: false, reporte: false, jefe: false, dueno: false };
    expect(veRevision(nada)).toBe(false);
    expect(veRevision({ ...nada, juzgar: true })).toBe(true);
    expect(veRevision({ ...nada, dueno: true })).toBe(true);
    expect(veRevision(null)).toBe(false);
  });

  it("color del aviso por lo que pasó", () => {
    expect(tonoAviso("argos_caso_cometio")).toBe("cometio");
    expect(tonoAviso("argos_caso_limpio")).toBe("no_cometio");
    expect(tonoAviso("argos_caso_justificado")).toBe("justificado");
    expect(tonoAviso("argos_casos_atraso")).toBe("atencion");
    expect(tonoAviso("argos_reporte_rrhh")).toBe("info");
  });

  it("hoy es el día de Bogotá, no el de la máquina", () => {
    expect(hoyBogota(new Date("2026-11-20T03:30:00Z"))).toBe("2026-11-19");
  });
});

describe("todo va por el puesto", () => {
  it("las cinco funciones están en Ajustes → Posiciones", () => {
    const claves = CATALOGO_POSICIONES.flatMap((s) => s.grupos.flatMap((g) => g.filas.flatMap((f) => f.funciones.map((x) => x.clave))));
    for (const c of ["N:argos.casos.juzgar", "N:argos.casos.obligado", "N:argos.casos.corregir", "N:argos.casos.reporte", "N:argos.casos.jefe"]) {
      expect(claves).toContain(c);
    }
  });

  it("la base decide por función del puesto, no por persona", () => {
    expect(sql).toContain("function public.tiene_funcion(_uid uuid, _clave text)");
    expect(sql).toMatch(/pb\.checks ->> _clave/);
    expect(sql).not.toMatch(/full_name\s*=\s*'/);
  });
});

describe("la base: casos, frase y avisos", () => {
  it("un caso por persona y día", () => {
    expect(sql).toContain("unique (user_id, dia)");
    expect(sql).toMatch(/veredicto in \('cometio', 'no_cometio', 'justificado'\)/);
  });

  it("lo juzgado no se mueve al rearmar", () => {
    expect(sql).toMatch(/on conflict \(user_id, dia\) do update[\s\S]*where public\.argos_casos\.veredicto is null/);
  });

  it("no se juzga un día que no terminó y la frase es obligatoria", () => {
    expect(sql).toContain("el día todavía no termina");
    expect(sql).toContain("falta la frase de por qué");
  });

  it("cada paso avisa a quien toca", () => {
    for (const tipo of ["argos_caso_cometio", "argos_caso_limpio", "argos_caso_justificado", "argos_caso_equipo",
      "argos_caso_grave", "argos_caso_corregido", "argos_casos_del_dia", "argos_reporte_rrhh", "argos_casos_atraso"]) {
      expect(sql).toContain(`'${tipo}'`);
    }
  });

  it("7 am a quien revisa y 9 am el reporte (hora de Bogotá)", () => {
    expect(sql).toContain("'argos-casos-7am', '0 12 * * *'");
    expect(sql).toContain("'argos-casos-9am', '0 14 * * *'");
  });

  it("el dueño nunca carga con el cartel", () => {
    expect(sql).toMatch(/obligado'\) and not public\.es_dueno/);
  });
});

const carteles = import.meta.glob(["../../components/hr/CasosObligatorios.tsx", "../../components/horarios/HorariosObligatorios.tsx"], {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

describe("los carteles no tapan «Marcar entrada»", () => {
  it("esperan a que la persona esté en turno", () => {
    const fuentes = Object.values(carteles);
    expect(fuentes).toHaveLength(2);
    for (const src of fuentes) expect(src).toMatch(/if \(!b\?\.debe \|\| !enTurno\) return null;/);
  });
});
