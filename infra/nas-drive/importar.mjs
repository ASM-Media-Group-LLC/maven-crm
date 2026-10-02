// IMPORTAR el archivo de Google al Drive de Maven (corre en mini5).
//
// Lo bajado de Google Drive al NAS (01/10/2026) está en carpetas comunes:
//   /Volumes/NASx/<unidad>/...        y   /Volumes/NASx/Mi unidad/<correo>/...
// (rclone union: los archivos de una misma carpeta pueden estar en un disco o
// en el otro). El Drive de Maven guarda cada archivo como
//   /Volumes/NASx/maven-drive/<agencia>/<clave>
// y su nombre y carpeta solo en la base. Para que la gente lo vea en Maven SIN
// copiar 18 TB, por cada archivo:
//   1. un ENLACE DURO en el MISMO disco: <disco>/maven-drive/<agencia>/google/<id>
//      (el mismo archivo con otro nombre: cero bytes de más, instantáneo);
//   2. su ficha (nombre, carpeta, tamaño, fecha) a la edge `drive`, acción
//      «importar», en lotes, con un permiso firmado con DRIVE_SECRETO.
//
// Los ids salen del camino (UUID v5 de «unidad + ruta»): relanzar no duplica
// nada (la edge ignora lo que ya está y el enlace se reconoce por su inodo).
// Sin dueño (decisión de Jhon, 01/10): cada carpeta raíz se comparte con quien
// tenía acceso en Google.
//
// Uso (desde Terminal, por el permiso de macOS para los discos):
//   set -a; . ~/maven-nas-drive/.env; set +a
//   node importar.mjs plan.json [--prueba] [--solo <clave>] [--de-nuevo] [--solo-raices]
//     --prueba    recorre y cuenta; no enlaza ni manda nada
//     --solo      una sola carpeta del plan (por su «clave»)
//     --de-nuevo  repasa también las carpetas que ya figuran como hechas
//     --solo-raices  manda solo la raíz de cada carpeta YA importada (sus
//                 compartidos y qué unidad es), sin recorrer el disco: minutos
//                 en vez de media hora para sumar accesos o marcar unidades

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { firmar } from "./firma.mjs";

// ── Ids estables ────────────────────────────────────────────────────────────
const NS = "6f4b6a52-2f3e-5c1d-9a7e-3b1f0c2d4e5a"; // espacio de nombres de «importado de Google»
export function uuidV5(nombre, ns = NS) {
  const nsBytes = Buffer.from(ns.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(nsBytes).update(Buffer.from(nombre, "utf8")).digest();
  h[6] = (h[6] & 0x0f) | 0x50; // versión 5
  h[8] = (h[8] & 0x3f) | 0x80; // variante RFC 4122
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}
export const idCarpetaRaiz = (clave) => uuidV5(`raiz\0${clave}`);
export const idCarpeta = (clave, rel) => (rel === "" ? idCarpetaRaiz(clave) : uuidV5(`carpeta\0${clave}\0${rel}`));
export const idArchivo = (clave, rel) => uuidV5(`archivo\0${clave}\0${rel}`);

// ── Nombres ─────────────────────────────────────────────────────────────────
// El disco del Mac guarda las tildes descompuestas (NFD): «Nikón» como «Niko´n».
// rclone, al bajar, cambió «:» por «：» (--local-encoding Colon). Maven no acepta
// «/», «\» ni caracteres de control, y hasta 255 caracteres.
export function nombreParaMaven(crudo) {
  let n = crudo.normalize("NFC").replace(/：/g, ":").replace(/\\/g, "＼").replace(/[\u0000-\u001f\u007f]/g, "�").trim();
  if (!n) n = "(sin nombre)";
  if (n.length > 255) {
    const ext = path.extname(n).slice(0, 20);
    n = n.slice(0, 255 - ext.length - 1) + "…" + ext;
  }
  return n;
}

// Lo que el sistema o rclone dejan y no es del usuario.
const IGNORAR = /^(\.DS_Store|\._.*|Thumbs\.db|\.localized)$|\.partial$/i;

const MIME = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", heic: "image/heic",
  heif: "image/heif", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp", psd: "image/vnd.adobe.photoshop",
  mp4: "video/mp4", m4v: "video/x-m4v", mov: "video/quicktime", avi: "video/x-msvideo", mkv: "video/x-matroska",
  webm: "video/webm", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", aac: "audio/aac", ogg: "audio/ogg",
  pdf: "application/pdf", txt: "text/plain", csv: "text/csv", json: "application/json", zip: "application/zip",
  rar: "application/vnd.rar", "7z": "application/x-7z-compressed",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword", xls: "application/vnd.ms-excel", ppt: "application/vnd.ms-powerpoint",
  // html y svg NO: el NAS los serviría con su tipo y un script adentro correría.
};
export const mimeDe = (nombre) => MIME[path.extname(nombre).slice(1).toLowerCase()] ?? "application/octet-stream";

// ── Recorrer lo bajado (en los dos discos) ──────────────────────────────────
/** Árbol unido de una carpeta del archivo: carpetas (rutas relativas) y
 *  archivos con el disco donde están. Si una ruta está en los dos discos,
 *  queda la más nueva (y se anota). */
export async function recorrer(discos, origen) {
  const carpetas = new Set();
  const archivos = new Map(); // rel → { disco, abs, size, mtime, ino, dev }
  const dobles = [];
  for (const disco of discos) {
    const base = path.join(disco, origen);
    try { await fsp.access(base); } catch { continue; }
    const pila = [""];
    while (pila.length) {
      const rel = pila.pop();
      const dir = await fsp.opendir(path.join(base, rel));
      for await (const e of dir) {
        if (IGNORAR.test(e.name)) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { carpetas.add(r); pila.push(r); continue; }
        if (!e.isFile()) continue;
        const abs = path.join(base, r);
        const st = await fsp.stat(abs);
        const nuevo = { disco, abs, size: st.size, mtime: st.mtime, ino: st.ino, dev: st.dev };
        const viejo = archivos.get(r);
        if (viejo) {
          dobles.push(r);
          if (st.mtimeMs <= viejo.mtime.getTime()) continue;
        }
        archivos.set(r, nuevo);
      }
    }
  }
  // Toda carpeta madre de algo existe como carpeta (aunque esté vacía en un disco).
  for (const r of [...carpetas, ...archivos.keys()]) {
    let d = path.posix.dirname(r);
    while (d && d !== ".") { carpetas.add(d); d = path.posix.dirname(d); }
  }
  return { carpetas: [...carpetas], archivos, dobles };
}

// ── Enlazar en el mismo disco ───────────────────────────────────────────────
/** El enlace duro del archivo en el Drive de Maven. Si ya existe y es el mismo
 *  archivo (mismo inodo), no hace nada. Si existe y es OTRO (rclone reemplazó
 *  el archivo del archivo al ponerse al día), se renueva: esa ruta bajo
 *  google/ solo la crea este importador. */
export async function enlazar(arch, raizDrive, tenant, id) {
  const destino = path.join(arch.disco, raizDrive, tenant, "google", id);
  let renovar = false;
  try {
    const st = await fsp.stat(destino);
    if (st.ino === arch.ino && st.dev === arch.dev) return "ya";
    renovar = true;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  await fsp.mkdir(path.dirname(destino), { recursive: true });
  if (renovar) {
    // Primero el nuevo con otro nombre, después el cambio: nunca queda la ficha sin archivo.
    const tmp = `${destino}.nuevo`;
    await fsp.rm(tmp, { force: true });
    await fsp.link(arch.abs, tmp);
    await fsp.rename(tmp, destino);
    return "renovado";
  }
  await fsp.link(arch.abs, destino);
  return "nuevo";
}

// ── Mandar a Maven ──────────────────────────────────────────────────────────
export const TAMANO_LOTE = 1500;

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

export async function mandar({ funciones, secreto, tenant, items = [], compartidos = [], unidades = [], fetchFn = fetch, intentos = 4, espera = dormir }) {
  for (let i = 1; ; i++) {
    const permiso = firmar(secreto, { op: "importar", k: "importar", t: tenant, e: Math.floor(Date.now() / 1000) + 300 });
    let r, j;
    try {
      r = await fetchFn(`${funciones}/drive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "importar", permiso, items, compartidos, unidades }),
      });
      j = await r.json().catch(() => ({}));
    } catch (e) {
      if (i >= intentos) throw new Error(`Maven no contesta: ${e.message}`);
      await espera(2000 * i);
      continue;
    }
    if (r.ok) return j;
    // 4xx = el lote está mal: reintentar no lo arregla.
    if (r.status < 500 || i >= intentos) throw new Error(`Maven contestó ${r.status}: ${j.error ?? "sin detalle"}`);
    await espera(2000 * i);
  }
}

/** Importa UNA carpeta del plan (una unidad o una Mi unidad). */
/** El primer lote de una carpeta del plan: su raíz, con quién se comparte y,
 *  si el plan lo dice, qué unidad es (una unidad compartida de la empresa o la
 *  «Mi unidad» de Google de una persona). */
function loteDeLaRaiz(carpeta, grupoId) {
  const raizId = idCarpetaRaiz(carpeta.clave);
  return {
    items: [{ id: raizId, parent_id: grupoId, tipo: "carpeta", nombre: nombreParaMaven(carpeta.nombre) }],
    compartidos: (carpeta.compartir ?? []).map((c) => ({ item_id: raizId, user_id: c.user_id, rol: c.rol })),
    unidades: carpeta.unidad ? [{ item_id: raizId, tipo: carpeta.unidad.tipo, persona: carpeta.unidad.persona ?? null }] : [],
  };
}

/** Solo la raíz (sin recorrer el disco): para marcar las unidades y sumar
 *  compartidos a lo que ya se importó. */
export async function marcarRaiz({ carpeta, grupoId, conf, fetchFn }) {
  const { tenant, funciones, secreto } = conf;
  await mandar({ funciones, secreto, tenant, ...loteDeLaRaiz(carpeta, grupoId), fetchFn });
}

export async function importarCarpeta({ carpeta, grupoId, conf, prueba = false, log = () => {}, fetchFn }) {
  const { tenant, discos, raizDrive, funciones, secreto } = conf;
  const { clave, origen } = carpeta;
  const arbol = await recorrer(discos, origen);
  const stats = { clave, carpetas: arbol.carpetas.length, archivos: arbol.archivos.size, bytes: 0, enlacesNuevos: 0, enlacesYa: 0, enlacesRenovados: 0, dobles: arbol.dobles.length };
  for (const a of arbol.archivos.values()) stats.bytes += a.size;
  // Vacía también en Google (21 unidades el 01/10): no se crea, para no llenar
  // el Drive de carpetas sin nada.
  if (!stats.archivos && !stats.carpetas) return { ...stats, vacia: true };
  if (prueba) return stats;
  const enviar = (items, compartidos = []) => mandar({ funciones, secreto, tenant, items, compartidos, fetchFn });

  // 1. La carpeta raíz, con quién se comparte y qué unidad es.
  await mandar({ funciones, secreto, tenant, ...loteDeLaRaiz(carpeta, grupoId), fetchFn });

  // 2. Las carpetas, de la menos a la más profunda (la madre llega antes).
  const filasCarpetas = arbol.carpetas
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))
    .map((rel) => ({
      id: idCarpeta(clave, rel),
      parent_id: idCarpeta(clave, path.posix.dirname(rel) === "." ? "" : path.posix.dirname(rel)),
      tipo: "carpeta",
      nombre: nombreParaMaven(path.posix.basename(rel)),
    }));
  for (let i = 0; i < filasCarpetas.length; i += TAMANO_LOTE) await enviar(filasCarpetas.slice(i, i + TAMANO_LOTE));

  // 3. Los archivos: primero el enlace, después la ficha (una ficha sin enlace
  //    sería un archivo que no abre; un enlace sin ficha, solo espacio que ya
  //    estaba ocupado).
  let lote = [];
  for (const [rel, arch] of arbol.archivos) {
    const id = idArchivo(clave, rel);
    const e = await enlazar(arch, raizDrive, tenant, id);
    if (e === "nuevo") stats.enlacesNuevos++; else if (e === "ya") stats.enlacesYa++; else stats.enlacesRenovados++;
    const nom = nombreParaMaven(path.posix.basename(rel));
    const madre = path.posix.dirname(rel);
    lote.push({
      id, parent_id: idCarpeta(clave, madre === "." ? "" : madre), tipo: "archivo", nombre: nom, mime: mimeDe(nom),
      size: arch.size, storage_key: `${tenant}/google/${id}`, created_at: arch.mtime.toISOString(),
    });
    if (lote.length >= TAMANO_LOTE) { await enviar(lote); log(`  ${clave}: ${stats.enlacesNuevos + stats.enlacesYa}/${stats.archivos}`); lote = []; }
  }
  if (lote.length) await enviar(lote);
  return stats;
}

// ── Programa ────────────────────────────────────────────────────────────────
async function principal() {
  const args = process.argv.slice(2);
  const planRuta = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--solo");
  const prueba = args.includes("--prueba");
  const deNuevo = args.includes("--de-nuevo");
  const solo = args.includes("--solo") ? args[args.indexOf("--solo") + 1] : null;
  const soloRaices = args.includes("--solo-raices");
  if (!planRuta) throw new Error("Uso: node importar.mjs plan.json [--prueba] [--solo <clave>] [--de-nuevo] [--solo-raices]");
  const plan = JSON.parse(await fsp.readFile(planRuta, "utf8"));
  const secreto = process.env.DRIVE_SECRETO ?? "";
  if (!prueba && secreto.length < 32) throw new Error("Falta DRIVE_SECRETO (cargar ~/maven-nas-drive/.env)");
  const conf = {
    tenant: plan.tenant, discos: plan.discos, raizDrive: plan.raizDrive ?? "maven-drive", secreto,
    funciones: (plan.funciones ?? "https://lsagslbkliprespbyhts.supabase.co/functions/v1").replace(/\/+$/, ""),
  };
  const dir = path.dirname(path.resolve(planRuta));
  const hechoRuta = path.join(dir, "importado.json");
  const hecho = JSON.parse(await fsp.readFile(hechoRuta, "utf8").catch(() => "{}"));
  const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); fs.appendFileSync(path.join(dir, "importar.log"), l + "\n"); };
  log(`=== ${prueba ? "PRUEBA" : "IMPORTACIÓN"} · agencia ${conf.tenant} · discos ${conf.discos.join(", ")}`);
  for (const grupo of plan.grupos) {
    if (!prueba && !solo) {
      await mandar({ ...conf, items: [{ id: grupo.id, parent_id: null, tipo: "carpeta", nombre: grupo.nombre }],
        compartidos: (grupo.compartir ?? []).map((c) => ({ item_id: grupo.id, user_id: c.user_id, rol: c.rol })) });
    }
    for (const carpeta of grupo.carpetas) {
      if (solo && carpeta.clave !== solo) continue;
      if (soloRaices) {
        // Solo lo que ya entró (las vacías no se crearon: no hay raíz que marcar).
        if (!hecho[carpeta.clave] || hecho[carpeta.clave].vacia) continue;
        if (!prueba) await marcarRaiz({ carpeta, grupoId: grupo.id, conf });
        log(`${prueba ? "marcaría" : "raíz"} ${carpeta.nombre}: ${(carpeta.compartir ?? []).length} compartidos${carpeta.unidad ? `, unidad ${carpeta.unidad.tipo}` : ""}`);
        continue;
      }
      if (!prueba && !deNuevo && hecho[carpeta.clave]) { log(`ya estaba: ${carpeta.nombre}`); continue; }
      if (!prueba && solo) {
        await mandar({ ...conf, items: [{ id: grupo.id, parent_id: null, tipo: "carpeta", nombre: grupo.nombre }],
          compartidos: (grupo.compartir ?? []).map((c) => ({ item_id: grupo.id, user_id: c.user_id, rol: c.rol })) });
      }
      const t0 = Date.now();
      try {
        const s = await importarCarpeta({ carpeta, grupoId: grupo.id, conf, prueba, log });
        if (s.vacia) { log(`vacía, no se crea: ${carpeta.nombre}`); if (!prueba) { hecho[carpeta.clave] = { ...s, fecha: new Date().toISOString() }; await fsp.writeFile(hechoRuta, JSON.stringify(hecho, null, 1)); } continue; }
        log(`${prueba ? "contaría" : "OK"} ${carpeta.nombre}: ${s.carpetas} carpetas, ${s.archivos} archivos, ${(s.bytes / 1e9).toFixed(1)} GB` +
          `${prueba ? "" : `, enlaces nuevos ${s.enlacesNuevos}, ya estaban ${s.enlacesYa}`}${s.dobles ? `, ${s.dobles} en los dos discos` : ""} (${Math.round((Date.now() - t0) / 1000)} s)`);
        if (!prueba) { hecho[carpeta.clave] = { ...s, fecha: new Date().toISOString() }; await fsp.writeFile(hechoRuta, JSON.stringify(hecho, null, 1)); }
      } catch (e) {
        log(`FALLÓ ${carpeta.nombre}: ${e.message}`);
      }
    }
  }
  log("=== TERMINADO");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  principal().catch((e) => { console.error(e.message); process.exit(1); });
}
