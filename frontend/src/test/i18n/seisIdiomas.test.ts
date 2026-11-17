import { describe, it, expect, afterEach } from "vitest";
import diccionario from "@/lib/diccionario";
import { getTranslation, registrarCatalogo, fijarIdioma, traducir } from "@/lib/i18n";
import { IDIOMAS, IDIOMAS_TRADUCIDOS, esIdioma, idiomaFuente } from "@/lib/idiomas";

// GUARDA DE LOS 6 IDIOMAS (16/11/2026).
//
// Lo que no se puede romper sin que se note: que cada traducción guardada
// conserve sus {marcadores} (si una traducción pierde «{n}», la frase sale con
// el número vacío), que un idioma a medio traducir caiga en inglés y nunca en
// blanco, y que el inglés siga siendo el principal.

type Guardada = Record<string, { t: string; en: string }>;
const traducciones = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, Guardada>;
}).glob("/frontend/src/locales/*.json", { eager: true, import: "default" });

const marcadores = (s: string) => [...s.matchAll(/\{[a-zA-Z0-9_]+\}/g)].map((m) => m[0]).sort().join("|");

afterEach(() => fijarIdioma("es"));

describe("Maven en 6 idiomas", () => {
  it("inglés es el principal y están los 6", () => {
    expect(IDIOMAS[0]).toBe("en");
    expect([...IDIOMAS].sort()).toEqual(["de", "en", "es", "fr", "it", "pt"]);
    expect(esIdioma("de")).toBe(true);
    expect(esIdioma("ru")).toBe(false);
    expect(idiomaFuente("de")).toBe("en");
    expect(idiomaFuente("es")).toBe("es");
  });

  it("cada traducción guardada conserva los {marcadores} de su inglés", () => {
    const rotas: string[] = [];
    for (const [ruta, datos] of Object.entries(traducciones)) {
      for (const [clave, { t, en }] of Object.entries(datos ?? {})) {
        if (marcadores(t) !== marcadores(en)) rotas.push(`${ruta} · ${clave}: «${t}»`);
      }
    }
    expect(rotas, "Traducciones que perdieron o inventaron un {marcador}:\n" + rotas.join("\n")).toEqual([]);
  });

  it("solo hay archivos de los idiomas traducidos", () => {
    const nombres = Object.keys(traducciones).map((r) => r.replace(/.*\/(\w+)\.json$/, "$1"));
    for (const n of nombres) expect((IDIOMAS_TRADUCIDOS as readonly string[]).includes(n)).toBe(true);
  });

  it("un idioma sin traducir esa frase la muestra en inglés, nunca vacía", () => {
    registrarCatalogo("de", {});
    expect(getTranslation("common.save", "de")).toBe(diccionario["common.save"].en);
    fijarIdioma("de");
    expect(traducir("common.save")).toBe("Save");
  });

  it("la portada tiene su texto en español e inglés", () => {
    expect(diccionario["portada.hero.linea1"].es).toBe("La oficina,");
    expect(diccionario["portada.hero.linea1"].en).toBe("The office,");
  });
});
