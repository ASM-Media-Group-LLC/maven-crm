// EL TIPO REAL DE LOS ARCHIVOS SIN EXTENSIÓN (Jhon, 06/10: «el visor no me deja
// previsualizar»). 13.593 archivos del archivo de Google no tienen extensión y
// entraron como application/octet-stream (el importador sacaba el tipo de la
// extensión). Este script, en la mini:
//   1. le pide a Maven los que faltan (edge `drive`, acción firmada op «tipos»);
//   2. lee los primeros 64 bytes de cada uno en el NAS y reconoce la firma;
//   3. le manda los tipos (la base solo los cambia si siguen genéricos y sin
//      tocar la fecha: 20261006150000_drive_tipos_por_firma.sql).
// Lo que no se reconoce (un .zip, un texto) se deja como está.
//
//   set -a; . ~/maven-nas-drive/.env; set +a
//   node tipos.mjs [--prueba]       (--prueba: lee y cuenta, no manda nada)
//
// ⚠️ Lee los discos: por ssh da EPERM (TCC). Se lanza con `open -a Terminal`.
// La misma lectura de firmas está en frontend/src/lib/drive/tipoDeArchivo.ts
// (el visor, para lo que todavía no se corrigió).

import fsp from "node:fs/promises";
import path from "node:path";
import { firmar } from "./firma.mjs";

const ascii = (b, desde, largo) => String.fromCharCode(...b.subarray(desde, desde + largo));

/** El tipo real por la firma de los primeros bytes, o null. */
export function tipoPorFirma(b) {
  if (!b || b.length < 4) return null;
  if (b.length >= 12 && ascii(b, 4, 4) === "ftyp") {
    const marca = ascii(b, 8, 4);
    if (marca === "qt  ") return "video/quicktime";
    if (["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"].includes(marca)) return "image/heic";
    if (marca === "avif" || marca === "avis") return "image/avif";
    if (marca === "M4A " || marca === "M4B ") return "audio/mp4";
    return "video/mp4";
  }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return "image/png";
  if (ascii(b, 0, 4) === "GIF8") return "image/gif";
  if (ascii(b, 0, 4) === "%PDF") return "application/pdf";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF") {
    const t = ascii(b, 8, 4);
    return t === "WEBP" ? "image/webp" : t === "WAVE" ? "audio/wav" : null;
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  if (ascii(b, 0, 4) === "OggS") return "audio/ogg";
  if (ascii(b, 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  return null;
}

/** El tipo de un archivo del disco por su firma, o null (o si no se puede leer). */
export async function mimePorFirma(abs) {
  let fh;
  try {
    fh = await fsp.open(abs, "r");
    const buf = Buffer.alloc(64);
    const { bytesRead } = await fh.read(buf, 0, 64, 0);
    return tipoPorFirma(buf.subarray(0, bytesRead));
  } catch {
    return null;
  } finally {
    await fh?.close().catch(() => {});
  }
}

/** En qué raíz está (los dos discos del NAS), o null. */
export async function ubicarEn(raices, rel) {
  for (const r of raices) {
    const abs = path.join(r, rel);
    try { await fsp.access(abs); return abs; } catch { /* sigue */ }
  }
  return null;
}

async function llamar(funciones, secreto, cuerpo, fetchFn = fetch) {
  for (let i = 1; ; i++) {
    const permiso = firmar(secreto, { op: "tipos", k: "tipos", e: Math.floor(Date.now() / 1000) + 300 });
    try {
      const r = await fetchFn(`${funciones}/drive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cuerpo, permiso }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return j;
      if (r.status < 500 || i >= 4) throw new Error(`Maven contestó ${r.status}: ${j.error ?? "sin detalle"}`);
    } catch (e) {
      if (i >= 4) throw e;
    }
    await new Promise((ok) => setTimeout(ok, 2000 * i));
  }
}

/** Recorre todo lo que falta. Devuelve cuántos de cada tipo, sin firma y sin archivo. */
export async function corregirTipos({ funciones, secreto, raices, prueba = false, log = () => {}, fetchFn = fetch }) {
  const stats = { revisados: 0, corregidos: 0, sinFirma: 0, noEsta: 0, porTipo: {} };
  let desde = null;
  do {
    const { items, siguiente } = await llamar(funciones, secreto, { action: "tipos_pendientes", desde }, fetchFn);
    const tipos = [];
    for (const it of items ?? []) {
      stats.revisados++;
      const abs = await ubicarEn(raices, it.storage_key);
      if (!abs) { stats.noEsta++; continue; }
      const mime = await mimePorFirma(abs);
      if (!mime) { stats.sinFirma++; continue; }
      stats.porTipo[mime] = (stats.porTipo[mime] ?? 0) + 1;
      tipos.push({ id: it.id, mime });
    }
    if (tipos.length && !prueba) {
      const r = await llamar(funciones, secreto, { action: "tipos_corregir", tipos }, fetchFn);
      stats.corregidos += Number(r.corregidos ?? 0);
    }
    log(`revisados ${stats.revisados} · corregidos ${stats.corregidos} · sin firma ${stats.sinFirma} · no está ${stats.noEsta}`);
    // ⚠️ En --prueba no se corrige nada, así que la base devolvería siempre los
    // mismos: se avanza con `siguiente` igual (la página sigue por id).
    desde = siguiente;
  } while (desde);
  return stats;
}

async function principal() {
  const prueba = process.argv.includes("--prueba");
  const secreto = process.env.DRIVE_SECRETO ?? "";
  if (secreto.length < 32) throw new Error("Falta DRIVE_SECRETO (cargar ~/maven-nas-drive/.env)");
  const raices = (process.env.RAICES ?? "").split(",").map((r) => r.trim()).filter(Boolean);
  if (!raices.length) throw new Error("Falta RAICES (cargar ~/maven-nas-drive/.env)");
  const funciones = (process.env.FUNCIONES ?? "https://lsagslbkliprespbyhts.supabase.co/functions/v1").replace(/\/+$/, "");
  const stats = await corregirTipos({ funciones, secreto, raices, prueba, log: (m) => console.log(`${new Date().toISOString()} ${m}`) });
  console.log(JSON.stringify({ prueba, ...stats }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  principal().catch((e) => { console.error(e.message); process.exit(1); });
}
