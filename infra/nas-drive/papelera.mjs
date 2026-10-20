// La PAPELERA del disco y la limpieza de lo que quedó a medias.
//
// ⚠️ Auditoría del 19/10: desde que Google se vació (05/10), NAS1 y NAS2 son
// la ÚNICA copia del Drive. Borrar era un `rm` en el acto: un borrado por
// error (o un defecto en la edge) era pérdida definitiva. Ahora `borrar` no
// borra: MUEVE el archivo a
//   <raíz>/.borrados/AAAA-MM-DD/<agencia>/<id>
// con un rename en el mismo disco (instantáneo, sin copiar un byte), y la
// noche (indice.mjs) purga lo de más de DIAS_EN_LA_PAPELERA. Para saber qué
// era cada uno, el índice de ese día (<agencia>/_indice/AAAA-MM-DD.csv, se
// guardan 30) tiene su ruta y su nombre.
//
// Y lo que dejó una subida cortada (.partes/<subida>, .tmp/<x>) o una
// miniatura que no terminó (.miniaturas/.tmp/<x>) se borra a las HORAS_TEMPORALES:
// antes solo se limpiaba .miniaturas/.tmp al arrancar, y lo demás ocupaba
// lugar para siempre.

import fsp from "node:fs/promises";
import path from "node:path";

export const CARPETA_BORRADOS = ".borrados";
export const DIAS_EN_LA_PAPELERA = 30;
export const HORAS_TEMPORALES = 24;
/** Lo que una subida o una miniatura deja a medias. Un permiso de subida vence
 *  a las 12 h (VENCE.subir de la edge): con 24 h, nada vivo se toca. */
export const CARPETAS_TEMPORALES = [".partes", ".tmp", path.join(".miniaturas", ".tmp")];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** AAAA-MM-DD con la hora de Bogotá, como los índices de cada noche. */
export const fechaDe = (cuando = new Date()) => cuando.toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });

const existe = (p) => fsp.lstat(p).then(() => true, (e) => { if (e.code === "ENOENT") return false; throw e; });

/** Mueve <raíz>/<clave> a la papelera del MISMO disco. Nunca pisa: si ese día
 *  ya se borró algo con la misma clave, el nuevo va al lado con «.2», «.3»…
 *  Devuelve dónde quedó, o null si en ese disco no estaba. Un enlace duro de lo
 *  importado de Google (importar.mjs) se mueve igual: el otro enlace, el del
 *  archivo bajado de Google, sigue donde está. */
export async function mandarALaPapelera(raiz, clave, cuando = new Date()) {
  const origen = path.join(raiz, clave);
  const s = await fsp.lstat(origen).catch((e) => { if (e.code === "ENOENT") return null; throw e; });
  if (!s) return null;
  // Una clave es siempre UN archivo. Una carpeta con ese nombre no se mueve
  // entera (el `rm` de antes tampoco la borraba).
  if (s.isDirectory()) throw Object.assign(new Error("esa ruta es una carpeta, no un archivo"), { status: 409 });
  const base = path.join(raiz, CARPETA_BORRADOS, fechaDe(cuando), clave);
  await fsp.mkdir(path.dirname(base), { recursive: true });
  let destino = base;
  for (let i = 2; await existe(destino); i++) destino = `${base}.${i}`;
  try {
    await fsp.rename(origen, destino);
  } catch (e) {
    // Otro pedido de borrar lo movió primero: ya está en la papelera.
    if (e.code === "ENOENT") return null;
    throw e;
  }
  return destino;
}

/** Borra de la papelera los días de hace más de `dias`. Solo carpetas con
 *  nombre de fecha, dentro de una .borrados que sea una carpeta de verdad (no
 *  un enlace a otra parte). Un disco que falla no frena al otro. */
export async function purgarPapelera(raices, { ahora = new Date(), dias = DIAS_EN_LA_PAPELERA } = {}) {
  const limite = fechaDe(new Date(ahora.getTime() - dias * 86_400_000));
  const resultado = { purgadas: [], errores: [] };
  for (const raiz of raices) {
    const dir = path.join(raiz, CARPETA_BORRADOS);
    try {
      const s = await fsp.lstat(dir).catch((e) => { if (e.code === "ENOENT") return null; throw e; });
      if (!s?.isDirectory()) continue;
      for (const nombre of (await fsp.readdir(dir)).sort()) {
        if (!FECHA.test(nombre) || nombre >= limite) continue;
        await fsp.rm(path.join(dir, nombre), { recursive: true, force: true });
        resultado.purgadas.push(path.join(dir, nombre));
      }
    } catch (e) {
      resultado.errores.push(`${dir}: ${e.message}`);
    }
  }
  return resultado;
}

/** Lo más nuevo de una entrada: ella misma y, si es carpeta, lo de adentro
 *  (las partes de una subida). Solo puede hacerla parecer MÁS nueva. */
async function ultimoCambio(ruta) {
  const s = await fsp.lstat(ruta);
  let ms = s.mtimeMs;
  if (s.isDirectory()) {
    for (const n of await fsp.readdir(ruta)) {
      const h = await fsp.lstat(path.join(ruta, n)).catch(() => null);
      if (h && h.mtimeMs > ms) ms = h.mtimeMs;
    }
  }
  return ms;
}

/** Borra lo que lleva más de `horas` sin cambios en .partes, .tmp y
 *  .miniaturas/.tmp de cada raíz. Solo lo de ADENTRO de esas carpetas. */
export async function limpiarTemporales(raices, { ahora = Date.now(), horas = HORAS_TEMPORALES } = {}) {
  const resultado = { borradas: [], errores: [] };
  for (const raiz of raices) {
    for (const carpeta of CARPETAS_TEMPORALES) {
      const dir = path.join(raiz, carpeta);
      try {
        const s = await fsp.lstat(dir).catch((e) => { if (e.code === "ENOENT") return null; throw e; });
        if (!s?.isDirectory()) continue;
        for (const n of await fsp.readdir(dir)) {
          const ruta = path.join(dir, n);
          const cambio = await ultimoCambio(ruta).catch(() => null);
          if (cambio === null || ahora - cambio < horas * 3_600_000) continue;
          await fsp.rm(ruta, { recursive: true, force: true });
          resultado.borradas.push(ruta);
        }
      } catch (e) {
        resultado.errores.push(`${dir}: ${e.message}`);
      }
    }
  }
  return resultado;
}

/** Una línea para el registro. */
export const resumen = (que, r) =>
  `[papelera] ${new Date().toISOString()} · ${que}: ${(r.purgadas ?? r.borradas).length}${r.errores.length ? ` · ERRORES: ${r.errores.join(" | ")}` : ""}`;
