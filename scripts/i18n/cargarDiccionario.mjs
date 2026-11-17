// Lee el diccionario fuente (frontend/src/lib/diccionario.ts, español + inglés)
// sin pasar por la app: lo empaqueta con esbuild y lo evalúa en Node. Lo usan
// el plugin de Vite (al compilar) y el traductor (scripts/i18n/traducir.mjs).
//
// Los archivos de lib/i18n/ son datos puros (sin imports), así que empaquetarlos
// es instantáneo y no arrastra nada de la app.
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const RUTA_DICCIONARIO = path.join(raiz, "frontend/src/lib/diccionario.ts");
export const CARPETA_MODULOS = path.join(raiz, "frontend/src/lib/i18n");
export const CARPETA_LOCALES = path.join(raiz, "frontend/src/locales");

/** { clave: { es, en } } */
export async function cargarDiccionario() {
  const r = await build({
    entryPoints: [RUTA_DICCIONARIO],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    logLevel: "silent",
  });
  const codigo = r.outputFiles[0].text;
  const modulo = { exports: {} };
  new Function("module", "exports", codigo)(modulo, modulo.exports);
  return modulo.exports.default;
}

/** Las traducciones guardadas de un idioma: { clave: { t, en } }. `en` es el
 *  inglés del que se tradujo: si el inglés cambia, la traducción se descarta
 *  (se vuelve a mostrar el inglés) hasta que el traductor la rehaga. */
export function leerTraducciones(lang) {
  const ruta = path.join(CARPETA_LOCALES, `${lang}.json`);
  if (!fs.existsSync(ruta)) return {};
  try {
    return JSON.parse(fs.readFileSync(ruta, "utf8"));
  } catch {
    return {};
  }
}

export function escribirTraducciones(lang, datos) {
  fs.mkdirSync(CARPETA_LOCALES, { recursive: true });
  const ordenado = Object.fromEntries(Object.entries(datos).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(path.join(CARPETA_LOCALES, `${lang}.json`), JSON.stringify(ordenado, null, 1) + "\n");
}

/** El catálogo plano { clave: texto } de un idioma, completo: lo que falta o
 *  quedó viejo en un idioma traducido se rellena con inglés. */
export function catalogoDe(lang, diccionario, traducciones) {
  const out = {};
  for (const [clave, par] of Object.entries(diccionario)) {
    if (lang === "es" || lang === "en") { out[clave] = par[lang]; continue; }
    const tr = traducciones?.[clave];
    out[clave] = tr && tr.en === par.en && typeof tr.t === "string" ? tr.t : par.en;
  }
  return out;
}
