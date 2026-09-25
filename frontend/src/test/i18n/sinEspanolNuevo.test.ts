import { describe, it, expect } from "vitest";
import { buscarEspanol, esEspanol } from "./detectarEspanol";
import translations from "@/lib/i18n";
import { NAV_CATALOG } from "@/lib/navCatalog";
import { LEGADO_EN_ESPANOL } from "./legadoEnEspanol";

// EL FRENO DE LA MIGRACIÓN A INGLÉS.
//
// El botón ES/EN de la barra superior solo cambia el texto que pasa por
// `t("clave")` (ver hooks/useLanguage + lib/i18n). Todo lo que se escribe
// directo en el JSX queda en español pase lo que pase.
//
// El menú lateral ya se había traducido una vez, en 2026-07. Un año después
// tenía 66 títulos en español contra 7 traducidos: cada módulo nuevo —RRHH,
// Finanzas, Cowork, Correo, Messenger, Parrilla, Scouter, Teléfonos— entró con
// el título a mano, y nadie se enteró porque no había forma de enterarse. Este
// test es esa forma.
//
// LA REGLA: un archivo que no está en `legadoEnEspanol.ts` no puede tener texto
// en español visible. Los que sí están son los que ya venían así y están en cola
// para traducirse; la lista solo puede achicarse.
//
// El código se lee con `import.meta.glob` y no con `node:fs` porque el tsconfig
// de la app apunta al navegador y no trae los tipos de Node. El patrón tiene que
// ser un literal y arranca en la RAÍZ DEL REPO (vitest corre desde ahí, no desde
// frontend/), de ahí el prefijo /frontend/src.
const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });

// Fuera del alcance de la migración, por decisión, no por olvido:
//
//  - `test/` y `harness/`: no los ve ningún usuario.
//  - `lib/i18n.ts` y `lib/i18n/`: ES el diccionario (partido por módulo). Su
//    español es el dato, no un descuido.
//  - `lib/navCatalog.ts`: cada entrada guarda su `title` en español a propósito
//    —el ⌘K lo usa como sinónimo de búsqueda— y muestra `i18nKey` traducida.
//  - `pages/portada/`: la landing pública. Si Maven se presenta en inglés al
//    mundo es una decisión de negocio aparte de si el CRM habla inglés adentro.
//  - `pages/design-system/`, `pages/docs/`, `pages/roadmap/`: herramientas
//    internas del equipo que las escribió.
//  - `components/ui/`: primitivas de shadcn; su texto se pasa desde afuera.
const FUERA_DE_ALCANCE = new RegExp(
  "^/frontend/src/(" +
    "test/|harness/|lib/i18n\\.ts|lib/i18n/|lib/navCatalog\\.ts|" +
    "pages/portada/|pages/design-system/|pages/docs/|pages/roadmap/|components/ui/" +
  ")",
);

const legado = new Set(LEGADO_EN_ESPANOL);

const archivos = Object.entries(fuentes)
  .filter(([ruta]) => !FUERA_DE_ALCANCE.test(ruta))
  .map(([ruta, src]) => ({
    ruta: ruta.replace("/frontend/src/", ""),
    textos: buscarEspanol(src),
  }));

describe("el botón EN tiene que seguir sirviendo", () => {
  it("ningún archivo nuevo llega con texto en español a mano", () => {
    const nuevos = archivos
      .filter((a) => a.textos.length > 0 && !legado.has(a.ruta))
      .map((a) => `${a.ruta} → ${a.textos.slice(0, 3).map((t) => `«${t}»`).join(", ")}` +
                  (a.textos.length > 3 ? ` … y ${a.textos.length - 3} más` : ""));

    expect(
      nuevos,
      "Estos archivos muestran texto en español que el botón EN no puede traducir.\n" +
      "Pasalo por t(\"clave\"): const { t } = useLanguage(), y agregá la clave con\n" +
      "sus dos idiomas en el archivo de su módulo, en frontend/src/lib/i18n/.\n\n" +
      nuevos.join("\n") + "\n",
    ).toEqual([]);
  });

  it("la lista de legado no se queda con archivos ya traducidos", () => {
    const conTexto = new Set(archivos.filter((a) => a.textos.length > 0).map((a) => a.ruta));
    const existentes = new Set(archivos.map((a) => a.ruta));
    // Un archivo anotado que ya no tiene español (o que se borró/renombró) tiene
    // que salir de la lista: si no, deja de ser un freno y vuelve a ser un
    // permiso abierto para que ese archivo se llene de español otra vez.
    const sobran = LEGADO_EN_ESPANOL.filter((r) => !conTexto.has(r))
      .map((r) => (existentes.has(r) ? `${r} (ya está traducido)` : `${r} (ya no existe)`));

    expect(
      sobran,
      "Borrá estas líneas de frontend/src/test/i18n/legadoEnEspanol.ts:\n\n" +
      sobran.join("\n") + "\n",
    ).toEqual([]);
  });
});

describe("el diccionario y el catálogo del menú", () => {
  it("ninguna traducción al inglés quedó escrita en español", () => {
    // El error de copiar y pegar más fácil de cometer y más difícil de ver:
    // duplicar la fila y dejar el mismo texto en las dos columnas. En pantalla
    // no se nota hasta que alguien abre la app en EN.
    //
    // Dejar el MISMO texto en los dos idiomas está bien cuando la palabra es
    // igual en ambos ("Dashboard", "Messenger", "Cowork"): eso no es español,
    // es un nombre propio. Lo que se marca es el español de verdad.
    const enEspanol = Object.entries(translations)
      .filter(([, par]) => esEspanol(par.en))
      .map(([clave, par]) => `${clave} → es: «${par.es}» / en: «${par.en}»`);

    expect(
      enEspanol,
      "Estas claves siguen en español en la columna `en` de lib/i18n/:\n\n" +
      enEspanol.join("\n") + "\n",
    ).toEqual([]);
  });

  it("todo destino del ⌘K sabe cómo decirse en inglés", () => {
    // El sidebar y este catálogo son dos listas separadas a propósito (ver el
    // comentario de navCatalog.ts), así que una ruta nueva se agrega en los dos
    // lados. Si se agrega acá sin `i18nKey`, el ⌘K la muestra en español para
    // siempre y nadie se entera.
    const sinClave = NAV_CATALOG.filter((e) => !e.i18nKey).map((e) => `${e.title} (${e.url})`);

    expect(
      sinClave,
      "Estas entradas de lib/navCatalog.ts no tienen i18nKey:\n\n" +
      sinClave.join("\n") + "\n",
    ).toEqual([]);
  });
});
