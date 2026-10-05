import { describe, it, expect } from "vitest";
import translations from "@/lib/i18n";

// EL DICCIONARIO PARTIDO POR MÓDULO (ver el comentario de lib/i18n.ts).
//
// Se partió para que varios módulos se traduzcan a la vez sin chocar en un solo
// archivo. Eso solo funciona si cada uno escribe en SU archivo, y lo que lo
// garantiza no es tsc: `{ ...a, ...b }` con la misma clave en los dos compila
// sin una queja y la segunda pisa a la primera en silencio. Lo garantiza esto.
//
// Los archivos se descubren solos: un módulo nuevo en lib/i18n/ entra en estas
// reglas sin tocar este test. El patrón del glob tiene que ser un literal y
// arranca en la raíz del repo (vitest corre desde ahí), como en sinEspanolNuevo.
const modulos = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, Record<string, unknown>>;
}).glob("/frontend/src/lib/i18n/*.ts", { eager: true });

// Las claves que tenía el diccionario el día que se partió (sep 2026), medidas
// ANTES de mover nada. Es un piso, no un número exacto: los PR de traducción
// suman claves en paralelo, y si cada uno tuviera que cambiar este número
// chocarían todos en esta línea, que es justo lo que la partición vino a evitar.
const CLAVES_ANTES_DE_PARTIR = 1272;

type Par = { es: unknown; en: unknown };

const archivos = Object.entries(modulos).map(([ruta, exportado]) => {
  const nombre = ruta.replace("/frontend/src/lib/i18n/", "");
  const prefijos = Object.entries(exportado).filter(([n]) => n.startsWith("PREFIJOS_"));
  const diccionarios = Object.entries(exportado).filter(([n]) => !n.startsWith("PREFIJOS_"));
  return {
    nombre,
    exports: Object.keys(exportado),
    prefijos: (prefijos[0]?.[1] ?? []) as readonly string[],
    diccionario: (diccionarios[0]?.[1] ?? {}) as Record<string, Par>,
    bienFormado: prefijos.length === 1 && diccionarios.length === 1,
  };
});

describe("el diccionario, partido por módulo", () => {
  it("se cargaron los archivos (un glob que no carga nada pasaría todo en verde)", () => {
    expect(archivos.length).toBeGreaterThan(20);
    const total = archivos.reduce((n, a) => n + Object.keys(a.diccionario).length, 0);
    expect(total).toBeGreaterThanOrEqual(CLAVES_ANTES_DE_PARTIR);
  });

  it("cada archivo exporta un diccionario y la lista de sus prefijos, nada más", () => {
    const mal = archivos
      .filter((a) => !a.bienFormado || a.prefijos.length === 0 ||
        a.prefijos.some((p) => typeof p !== "string" || !p.endsWith(".")) ||
        typeof a.diccionario !== "object" || Array.isArray(a.diccionario))
      .map((a) => `${a.nombre} → exporta: ${a.exports.join(", ")} · prefijos: ${JSON.stringify(a.prefijos)}`);

    expect(
      mal,
      "Cada archivo de lib/i18n/ exporta exactamente dos cosas: el objeto de claves y\n" +
      "`PREFIJOS_<MÓDULO>`, la lista (no vacía) de prefijos que ese archivo es dueño,\n" +
      "cada uno terminado en punto:\n\n" + mal.join("\n") + "\n",
    ).toEqual([]);
  });

  it("ninguna clave está en dos archivos", () => {
    const donde = new Map<string, string[]>();
    for (const a of archivos) {
      for (const clave of Object.keys(a.diccionario)) {
        donde.set(clave, [...(donde.get(clave) ?? []), a.nombre]);
      }
    }
    const repetidas = [...donde].filter(([, en]) => en.length > 1)
      .map(([clave, en]) => `${clave} → ${en.join(" y ")}`);

    expect(
      repetidas,
      "Estas claves están en más de un archivo; en el diccionario armado gana la\n" +
      "última y la otra desaparece sin aviso. Dejá cada una en un solo lugar:\n\n" +
      repetidas.join("\n") + "\n",
    ).toEqual([]);
  });

  it("cada clave empieza con un prefijo de su propio archivo", () => {
    const fuera = archivos.flatMap((a) =>
      Object.keys(a.diccionario)
        .filter((clave) => !a.prefijos.some((p) => clave.startsWith(p)))
        .map((clave) => `${a.nombre}: ${clave} (sus prefijos: ${a.prefijos.join(" ")})`),
    );

    expect(
      fuera,
      "Estas claves no llevan un prefijo de su archivo. Cada módulo escribe en el\n" +
      "suyo: movela al archivo dueño de ese prefijo, o cambiá el prefijo de la clave\n" +
      "(y de sus t(\"…\")) si de verdad es de este módulo:\n\n" + fuera.join("\n") + "\n",
    ).toEqual([]);
  });

  it("ningún prefijo tiene dos dueños", () => {
    // Si "nav." es de un archivo y "nav.hr." de otro, una clave "nav.hr.x" cumple
    // la regla de arriba en los dos y ya no hay un único lugar donde buscarla.
    const todos = archivos.flatMap((a) => a.prefijos.map((p) => ({ p, archivo: a.nombre })));
    const choques = todos.flatMap((x, i) =>
      todos.slice(i + 1)
        .filter((y) => y.archivo !== x.archivo && (y.p.startsWith(x.p) || x.p.startsWith(y.p)))
        .map((y) => `«${x.p}» (${x.archivo}) y «${y.p}» (${y.archivo})`),
    );

    expect(choques, "Prefijos que se pisan entre archivos:\n\n" + choques.join("\n") + "\n").toEqual([]);
  });

  it("toda clave tiene su texto en español y en inglés", () => {
    const vacias = archivos.flatMap((a) =>
      Object.entries(a.diccionario)
        .filter(([, par]) =>
          typeof par?.es !== "string" || par.es.trim() === "" ||
          typeof par?.en !== "string" || par.en.trim() === "")
        .map(([clave, par]) => `${a.nombre}: ${clave} → ${JSON.stringify(par)}`),
    );

    expect(vacias, "Claves sin texto en algún idioma:\n\n" + vacias.join("\n") + "\n").toEqual([]);
  });

  it("el diccionario armado tiene todas las claves de todos los archivos, y ninguna más", () => {
    // Un archivo nuevo que no se sumó a la lista de lib/i18n.ts: sus claves
    // existen en su archivo pero no para t().
    const sinSumar = archivos.flatMap((a) =>
      Object.keys(a.diccionario)
        .filter((clave) => (translations as Record<string, Par>)[clave] !== a.diccionario[clave])
        .map((clave) => `${a.nombre}: ${clave}`),
    );
    expect(
      sinSumar,
      "Estas claves no llegan al diccionario: sumá su archivo a `translations` en\n" +
      "lib/i18n.ts:\n\n" + sinSumar.join("\n") + "\n",
    ).toEqual([]);

    const enArchivos = archivos.reduce((n, a) => n + Object.keys(a.diccionario).length, 0);
    expect(Object.keys(translations).length).toBe(enArchivos);
    expect(Object.keys(translations).length).toBeGreaterThanOrEqual(CLAVES_ANTES_DE_PARTIR);
  });
});
