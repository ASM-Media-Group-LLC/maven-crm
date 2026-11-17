import { describe, it, expect } from "vitest";
import translations from "@/lib/i18n";
import {
  puedeAvisar,
  GRUPOS_AVISO,
  SITUACIONES_AVISO,
  SITUACION_POR_SLUG,
  situacionesDe,
  type GrupoAviso,
} from "@/lib/coworkAvisos";
import { CLIPS_VOZ } from "@/lib/clipsVoz";

// El botón "Avisar": un supervisor le manda a un chatter una de estas
// situaciones y le llega en voz (Mario) y por escrito. Lo que esta guarda
// protege es que el texto ESCRITO de cada situación —y el título de cada
// grupo— exista de verdad en el diccionario: una clave mal tecleada no se ve
// hasta que alguien abre el menú en vivo, y ahí ya es tarde.

const grupos = new Set<GrupoAviso>(GRUPOS_AVISO.map((g) => g.grupo));

describe("situaciones de Avisar", () => {
  it("cada situación tiene su texto escrito en el diccionario (ES y EN)", () => {
    const faltan = SITUACIONES_AVISO
      .filter((s) => !(s.etiqueta in translations))
      .map((s) => `${s.slug} → ${s.etiqueta}`);
    expect(faltan, `Agrega estas claves en lib/i18n/cowork.ts:\n${faltan.join("\n")}`).toEqual([]);
  });

  it("cada título de grupo existe en el diccionario", () => {
    const faltan = GRUPOS_AVISO.filter((g) => !(g.titulo in translations)).map((g) => g.titulo);
    expect(faltan).toEqual([]);
  });

  it("toda situación cae en un grupo declarado", () => {
    const huerfanas = SITUACIONES_AVISO.filter((s) => !grupos.has(s.grupo)).map((s) => s.slug);
    expect(huerfanas).toEqual([]);
  });

  it("ningún grupo del menú queda vacío", () => {
    const vacios = GRUPOS_AVISO.filter((g) => situacionesDe(g.grupo).length === 0).map((g) => g.grupo);
    expect(vacios).toEqual([]);
  });

  it("los slugs son únicos (viajan a la base como cowork_avisos.situacion)", () => {
    const slugs = SITUACIONES_AVISO.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(Object.keys(SITUACION_POR_SLUG).length).toBe(slugs.length);
  });

  it("cada situación tiene una frase de voz (lo que dice Mario)", () => {
    const sinVoz = SITUACIONES_AVISO.filter((s) => !s.vozEs.trim()).map((s) => s.slug);
    expect(sinVoz).toEqual([]);
  });

  it("cada situación tiene su clip Mario pregrabado (lib/clipsVoz)", () => {
    // Si alguien agrega o cambia una frase sin generar/re-mapear su clip, sonaría
    // con la voz robótica del navegador y se notaría el salto. Esta guarda lo caza.
    const sinClip = SITUACIONES_AVISO
      .filter((s) => !CLIPS_VOZ[s.vozEs])
      .map((s) => `${s.slug} → «${s.vozEs}»`);
    expect(
      sinClip,
      `Falta el audio Mario (o el texto no coincide exacto) para:\n${sinClip.join("\n")}`,
    ).toEqual([]);
  });
});

describe("quién puede avisar", () => {
  it("cualquier anfitrión del Cowork, nadie más (Alvaro, 17/11/2026)", () => {
    // La policy de inserción de cowork_avisos (migración 20261117190000) pide
    // lo mismo: ser anfitrión de la sesión. Si cambia una, cambia la otra.
    expect(puedeAvisar(true)).toBe(true);
    expect(puedeAvisar(false)).toBe(false);
  });
});
