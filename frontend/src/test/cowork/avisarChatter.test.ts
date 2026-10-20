import { describe, it, expect } from "vitest";
import translations from "@/lib/i18n";
import {
  AVISADORES,
  GRUPOS_AVISO,
  SITUACIONES_AVISO,
  SITUACION_POR_SLUG,
  situacionesDe,
  type GrupoAviso,
} from "@/lib/coworkAvisos";

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
});

describe("quién puede avisar", () => {
  it("son exactamente los cuatro designados (Luis, Daniel, Grace y Álvaro)", () => {
    // Si alguien cambia esta lista, que lo haga a la vez en la policy de
    // inserción de cowork_avisos (migración 20261022090000): el botón y la base
    // tienen que decir lo mismo o el aviso se envía desde el front y la base lo
    // rechaza en silencio.
    expect([...AVISADORES].sort()).toEqual([
      "41b35cef-82a8-4991-9234-3514b0064767",
      "4d502376-eb16-42f6-bda2-4b92582a26e6",
      "528453bd-f1e1-43d3-85c1-01c5fa5bbcfb",
      "8b90f141-8546-4cfd-a358-56ff227623df",
    ]);
  });
});
