import { describe, it, expect } from "vitest";
import translations from "@/lib/i18n";
import {
  cambiosDe,
  CAMPOS_FICHA,
  ETIQUETA_AGENCIA,
  etiquetasDe,
  type Ficha,
  respondidas,
  SECCIONES,
  textoDeEtiquetas,
  TONOS,
} from "@/lib/portal/ficha";

// LA FICHA DEL PORTAL: la lista del frontend (lib/portal/ficha.ts) tiene que ser
// la misma de la base (portal_campos_ficha() y el WHEN del trigger del historial,
// en 20261006100000). Si se separan, el portal dibuja una pregunta que la base
// rechaza al guardar, o la base acepta un campo que nadie ve ni anota.
//
// ⚠️ El fuente se lee con un glob literal y ?raw (no con fs: tsc del CI no tiene
// tipos de Node). Un glob que no carga nada pasaría en verde: se comprueba.
const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob(["/supabase/migrations/20261006100000_portal_creadoras_cuentas.sql"], { query: "?raw", import: "default", eager: true });
const migracion = Object.values(fuentes)[0] ?? "";

describe("la ficha del portal es la misma en el frontend y en la base", () => {
  it("se cargó la migración", () => {
    expect(migracion).toContain("create function public.portal_campos_ficha()");
  });

  it("portal_campos_ficha() tiene las mismas 22 columnas, en el mismo orden", () => {
    const cuerpo = migracion.slice(migracion.indexOf("create function public.portal_campos_ficha()"));
    const lista = cuerpo.slice(cuerpo.indexOf("select array["), cuerpo.indexOf("]::text[]"));
    const columnas = [...lista.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(columnas).toEqual([...CAMPOS_FICHA]);
    expect(CAMPOS_FICHA).toHaveLength(22);
  });

  it("el trigger del historial mira las 22 (si falta una, sus cambios no se anotan)", () => {
    const when = migracion.slice(migracion.indexOf("create trigger creators_ficha_historial"), migracion.indexOf("execute function public.creators_ficha_historial()"));
    const columnas = [...when.matchAll(/old\.([a-z_]+) is distinct from new\.\1/g)].map((m) => m[1]);
    expect(new Set(columnas)).toEqual(new Set(CAMPOS_FICHA));
  });
});

describe("las secciones y sus textos", () => {
  it("cada columna está en una sola sección", () => {
    const enSecciones = SECCIONES.flatMap((s) => s.campos.map((c) => c.clave));
    expect(enSecciones.sort()).toEqual([...CAMPOS_FICHA].sort());
  });

  it("toda pregunta, ayuda y ejemplo existe en los dos idiomas", () => {
    const dic = translations as Record<string, { es: string; en: string }>;
    const claves = SECCIONES.flatMap((s) => [s.titulo, s.descripcion, ...s.campos.flatMap((c) => [c.pregunta, c.ayuda, c.ejemplo])])
      .filter(Boolean) as string[];
    const faltan = claves.filter((k) => !dic[k]?.es || !dic[k]?.en);
    expect(faltan).toEqual([]);
    const agencia = Object.values(ETIQUETA_AGENCIA).filter((k) => !dic[k]?.es || !dic[k]?.en);
    expect(agencia).toEqual([]);
    expect(TONOS.filter((o) => !dic[o.etiqueta])).toEqual([]);
  });
});

describe("los ayudantes", () => {
  const vacia = Object.fromEntries(CAMPOS_FICHA.map((c) => [c, null])) as Ficha;

  it("etiquetas: se leen y se escriben como «a, b, c», sin repetidas ni comas sueltas", () => {
    expect(etiquetasDe(" nena,  princesa ,, ")).toEqual(["nena", "princesa"]);
    expect(textoDeEtiquetas(["nena", "Nena", " princesa ", "", "a,b"])).toBe("nena, princesa, a b");
    expect(etiquetasDe(null)).toEqual([]);
  });

  it("cambios: solo lo que cambió de verdad, recortado", () => {
    const guardada = { ...vacia, tono_voz: "Dulce", hobbies: "yoga" };
    expect(cambiosDe(guardada, { tono_voz: " Dulce ", hobbies: "yoga y pasta", comida_favorita: "" })).toEqual({ hobbies: "yoga y pasta" });
    expect(cambiosDe(guardada, { tono_voz: "" })).toEqual({ tono_voz: "" });
  });

  it("respondidas: cuenta solo lo que tiene texto", () => {
    expect(respondidas({ ...vacia, tono_voz: "Dulce", hobbies: "   ", comida_favorita: "pasta" })).toBe(2);
    expect(respondidas(null)).toBe(0);
  });
});
