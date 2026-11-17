// PLUGIN DE VITE: un paquete de traducciones por idioma.
//
// `import("virtual:maven-i18n/de")` devuelve { clave: texto } en alemán, ya
// completo (lo que falte va en inglés). Se arma al compilar leyendo el
// diccionario fuente (lib/diccionario.ts) y frontend/src/locales/<idioma>.json.
// Vite parte un archivo por idioma y la app baja solo el de la persona.
import type { Plugin, ViteDevServer } from "vite";
import path from "node:path";
// @ts-expect-error — módulo .mjs sin tipos, compartido con el traductor.
import { cargarDiccionario, leerTraducciones, catalogoDe, CARPETA_MODULOS, CARPETA_LOCALES, RUTA_DICCIONARIO } from "./cargarDiccionario.mjs";

const PREFIJO = "virtual:maven-i18n/";
const RESUELTO = "\0maven-i18n:";
const IDIOMAS = ["en", "es", "de", "fr", "it", "pt"];

export function pluginIdiomas(): Plugin {
  let cache: Promise<Record<string, { es: string; en: string }>> | null = null;
  const diccionario = () => (cache ??= cargarDiccionario());
  let servidor: ViteDevServer | null = null;

  return {
    name: "maven-idiomas",
    configureServer(s) { servidor = s; },
    resolveId(id) {
      if (id.startsWith(PREFIJO)) {
        const lang = id.slice(PREFIJO.length);
        if (IDIOMAS.includes(lang)) return RESUELTO + lang;
      }
      return null;
    },
    async load(id) {
      if (!id.startsWith(RESUELTO)) return null;
      const lang = id.slice(RESUELTO.length);
      const catalogo = catalogoDe(lang, await diccionario(), leerTraducciones(lang));
      return `export default ${JSON.stringify(catalogo)};`;
    },
    // En desarrollo: si cambia una frase o una traducción, se rearman los
    // paquetes y se recarga la página.
    handleHotUpdate({ file }) {
      const tocaIdiomas =
        file === RUTA_DICCIONARIO ||
        file.startsWith(CARPETA_MODULOS + path.sep) ||
        file.startsWith(CARPETA_LOCALES + path.sep);
      if (!tocaIdiomas || !servidor) return;
      cache = null;
      for (const lang of IDIOMAS) {
        const m = servidor.moduleGraph.getModuleById(RESUELTO + lang);
        if (m) servidor.moduleGraph.invalidateModule(m);
      }
      servidor.ws.send({ type: "full-reload" });
      return [];
    },
  };
}
