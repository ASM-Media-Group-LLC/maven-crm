// El ÍNDICE DIARIO del Drive (corre en mini5 todas las noches, LaunchAgent
// ai.maven.nas-drive-indice).
//
// En el disco los archivos no tienen nombre ni carpeta: son
// <agencia>/<id>. El árbol («Contabilidad/2026/Balance.pdf») vive solo en la
// base de Maven. Como el Drive no tiene copia de seguridad (decisión de Jhon,
// 28/09), si la base se perdiera los archivos seguirían en el disco pero nadie
// sabría cuál es cuál. Este índice, guardado al lado de los archivos, es esa
// llave.
//
// Regla del NAS: la mini TRAE. Le pide el índice a la edge `drive` con un
// permiso firmado con el mismo DRIVE_SECRETO, y lo escribe en los DOS discos
// (si se muere uno, el índice del otro sigue):
//   /Volumes/NASx/maven-drive/<agencia>/_indice/actual.csv / actual.json
//   /Volumes/NASx/maven-drive/<agencia>/_indice/AAAA-MM-DD.csv / .json
// Se guardan los últimos 30 días.
//
// Y de paso, cada noche (papelera.mjs): purga de <raíz>/.borrados los días de
// hace más de 30 (lo que se borró en Maven espera ahí, entero) y borra lo que
// una subida o una miniatura dejó a medias hace más de 24 h.

import fsp from "node:fs/promises";
import path from "node:path";
import { firmar } from "./firma.mjs";
import { DIAS_EN_LA_PAPELERA, limpiarTemporales, purgarPapelera, resumen } from "./papelera.mjs";

export const COLUMNAS = [
  "ruta", "tipo", "nombre", "dueno", "correo_dueno", "tamano", "sha256", "estado",
  "en_papelera", "archivo_en_disco", "creado", "modificado", "abierto_por_ultima_vez",
  "agencia", "agencia_id",
];
const DIAS_QUE_SE_GUARDAN = 30;

// ⚠️ POR PARTES (03/10): con el archivo de Google el índice pasó de 2 filas a
// 890.000 y armarlo como UN texto (CSV entero, JSON con sangría) superó el
// tope de largo de un string de Node: «Invalid string length» en los dos
// discos, y esa noche no hubo índice. Ahora se escribe de a FILAS_POR_PARTE.
const FILAS_POR_PARTE = 2000;

const celdaCsv = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** El CSV de a pedazos. CSV que Excel abre bien: BOM para que lea UTF-8
 *  (acentos), comillas dobles escapadas, y todo campo entre comillas si trae
 *  coma, comilla o salto de línea. */
export function* partesCsv(filas) {
  yield "\uFEFF" + COLUMNAS.join(",") + "\r\n";
  for (let i = 0; i < filas.length; i += FILAS_POR_PARTE) {
    let parte = "";
    for (const f of filas.slice(i, i + FILAS_POR_PARTE)) parte += COLUMNAS.map((c) => celdaCsv(f[c])).join(",") + "\r\n";
    yield parte;
  }
}

/** El JSON de a pedazos: { generado, agencia_id, filas: [ ...una por línea ] }. */
export function* partesJson({ generado, agencia_id, filas }) {
  yield `{\n "generado": ${JSON.stringify(generado ?? null)},\n "agencia_id": ${JSON.stringify(agencia_id)},\n "filas": [`;
  for (let i = 0; i < filas.length; i += FILAS_POR_PARTE) {
    yield (i ? ",\n  " : "\n  ") + filas.slice(i, i + FILAS_POR_PARTE).map((f) => JSON.stringify(f)).join(",\n  ");
  }
  yield filas.length ? "\n ]\n}\n" : "]\n}\n";
}

/** El CSV entero como un texto (para lo chico y las pruebas). */
export function aCsv(filas) {
  return [...partesCsv(filas)].join("");
}

/** Escribe a un temporal y lo pone en su lugar: si se corta a mitad, el
 *  «actual» de ayer sigue entero en vez de quedar un archivo roto. */
async function escribirAtomico(destino, partes) {
  const tmp = `${destino}.tmp-${process.pid}`;
  const fh = await fsp.open(tmp, "w");
  try {
    for (const parte of partes) await fh.write(parte);
  } finally {
    await fh.close();
  }
  await fsp.rename(tmp, destino);
}

/** «actual» = copia del de hoy, también a un temporal primero. */
async function copiarAtomico(origen, destino) {
  const tmp = `${destino}.tmp-${process.pid}`;
  await fsp.copyFile(origen, tmp);
  await fsp.rename(tmp, destino);
}

export async function escribirIndice({ raices, filas, generado, fecha, conservar = DIAS_QUE_SE_GUARDAN }) {
  const porAgencia = new Map();
  for (const f of filas) {
    const lista = porAgencia.get(f.agencia_id);
    if (lista) lista.push(f); else porAgencia.set(f.agencia_id, [f]);
  }
  const resultado = { agencias: porAgencia.size, filas: filas.length, discos: [], errores: [] };
  for (const raiz of raices) {
    try {
      // ⚠️ También las agencias que ya tienen carpeta en el disco aunque hoy
      // no tengan nada: si no, cuando una agencia se queda sin archivos su
      // «actual» de ayer quedaba ahí, jurando que existen archivos borrados
      // (visto el 28/09 al limpiar la prueba).
      const enDisco = (await fsp.readdir(raiz).catch(() => [])).filter((n) => /^[0-9a-f-]{36}$/.test(n));
      const todas = new Map(porAgencia);
      for (const a of enDisco) if (!todas.has(a)) todas.set(a, []);
      for (const [agencia, lista] of todas) {
        if (!/^[0-9a-f-]{36}$/.test(agencia)) continue; // nunca una ruta rara
        const dir = path.join(raiz, agencia, "_indice");
        await fsp.mkdir(dir, { recursive: true });
        await escribirAtomico(path.join(dir, `${fecha}.csv`), partesCsv(lista));
        await escribirAtomico(path.join(dir, `${fecha}.json`), partesJson({ generado, agencia_id: agencia, filas: lista }));
        await copiarAtomico(path.join(dir, `${fecha}.csv`), path.join(dir, "actual.csv"));
        await copiarAtomico(path.join(dir, `${fecha}.json`), path.join(dir, "actual.json"));
        // Los de más de N días se van; «actual» nunca.
        const fechas = [...new Set((await fsp.readdir(dir))
          .map((n) => n.match(/^(\d{4}-\d{2}-\d{2})\.(csv|json)$/)?.[1]).filter(Boolean))].sort();
        for (const vieja of fechas.slice(0, Math.max(0, fechas.length - conservar))) {
          await fsp.rm(path.join(dir, `${vieja}.csv`), { force: true });
          await fsp.rm(path.join(dir, `${vieja}.json`), { force: true });
        }
      }
      resultado.discos.push(raiz);
    } catch (e) {
      // Un disco que falla no frena al otro: la gracia de escribir en los dos.
      resultado.errores.push(`${raiz}: ${e.message}`);
    }
  }
  return resultado;
}

/** Las filas del índice con la ruta legible de cada cosa
 *  («Contabilidad/2026/Balance.pdf»). Es la MISMA regla que armarIndice de la
 *  edge (supabase/functions/drive/logica.ts): desde que el índice viene por
 *  páginas, el árbol entero solo existe acá. Una madre que no está se marca
 *  «(sin carpeta)»; un ciclo (lo impide un trigger) no cuelga el armado. */
export function armarFilas(items, agencias, duenos) {
  const porId = new Map(items.map((i) => [i.id, i]));
  const rutas = new Map();
  const rutaDe = (i) => {
    const hecha = rutas.get(i.id);
    if (hecha !== undefined) return hecha;
    const partes = [];
    const vistos = new Set();
    let actual = i;
    while (actual && !vistos.has(actual.id) && partes.length < 60) {
      vistos.add(actual.id);
      partes.unshift(actual.nombre);
      if (!actual.parent_id) break;
      const madre = porId.get(actual.parent_id);
      if (!madre) { partes.unshift("(sin carpeta)"); break; }
      actual = madre;
    }
    const r = partes.join("/");
    rutas.set(i.id, r);
    return r;
  };
  return items
    .map((i) => ({
      agencia_id: i.tenant_id,
      agencia: agencias[i.tenant_id] ?? "",
      ruta: rutaDe(i),
      tipo: i.tipo,
      nombre: i.nombre,
      dueno: (i.owner_id && duenos[i.owner_id]?.nombre) || "",
      correo_dueno: (i.owner_id && duenos[i.owner_id]?.correo) || "",
      tamano: i.size,
      sha256: i.sha256 ?? "",
      estado: i.estado,
      en_papelera: !!i.trashed_at,
      archivo_en_disco: i.storage_key ?? "",
      creado: i.created_at,
      modificado: i.updated_at,
      abierto_por_ultima_vez: i.last_opened_at ?? "",
    }))
    .sort((a, b) => a.agencia_id.localeCompare(b.agencia_id) || a.ruta.localeCompare(b.ruta, "es"));
}

/** Pide el árbol de a páginas (cursor por id) con un permiso firmado op
 *  «indice» que vence en minutos. Con el archivo de Google son cientos de
 *  miles de fichas: todas juntas no entraban en la memoria de la edge. */
export async function pedirIndice({ funciones, secreto, fetchFn = fetch, maxPaginas = 10_000 }) {
  const items = [];
  const agencias = {};
  const duenos = {};
  let desde = null;
  let generado = null;
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const permiso = firmar(secreto, { op: "indice", k: "indice", e: Math.floor(Date.now() / 1000) + 300 });
    const r = await fetchFn(`${funciones}/drive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "indice", permiso, paginado: true, desde }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !Array.isArray(j.items)) throw new Error(`Maven contestó ${r.status}: ${j.error ?? "sin filas"}`);
    generado ??= j.generado;
    items.push(...j.items);
    Object.assign(agencias, j.agencias ?? {});
    Object.assign(duenos, j.duenos ?? {});
    if (!j.siguiente) return { generado, filas: armarFilas(items, agencias, duenos) };
    if (j.siguiente === desde) throw new Error("Maven devolvió la misma página dos veces");
    desde = j.siguiente;
  }
  throw new Error("Demasiadas páginas: algo anda mal con el cursor");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const secreto = process.env.DRIVE_SECRETO ?? "";
  const funciones = (process.env.MAVEN_FUNCIONES ?? "https://lsagslbkliprespbyhts.supabase.co/functions/v1").replace(/\/+$/, "");
  const raices = (process.env.RAICES ?? "").split(",").map((r) => r.trim()).filter(Boolean);
  const fecha = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" }); // AAAA-MM-DD
  let ok = false;
  try {
    const { generado, filas } = await pedirIndice({ funciones, secreto });
    const r = await escribirIndice({ raices, filas, generado, fecha });
    console.log(`[indice] ${new Date().toISOString()} · ${r.filas} filas · ${r.agencias} agencias · discos: ${r.discos.join(", ") || "NINGUNO"}${r.errores.length ? ` · ERRORES: ${r.errores.join(" | ")}` : ""}`);
    ok = r.discos.length > 0;
  } catch (e) {
    console.error(`[indice] ${new Date().toISOString()} · FALLÓ: ${e.message}`);
  }
  // La papelera del disco (lo borrado hace más de 30 días) y lo que una subida
  // dejó a medias (papelera.mjs). No dependen de Maven: corren aunque el
  // índice haya fallado.
  try {
    console.log(resumen(`días de la papelera de más de ${DIAS_EN_LA_PAPELERA} purgados`, await purgarPapelera(raices)));
    console.log(resumen("temporales de más de 24 h", await limpiarTemporales(raices)));
  } catch (e) {
    console.error(`[papelera] ${new Date().toISOString()} · FALLÓ: ${e.message}`);
  }
  process.exit(ok ? 0 : 1);
}
