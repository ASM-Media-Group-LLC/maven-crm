// Miniaturas del Drive, hechas EN EL NAS (Jhon, 02/10: «otras vistas de los
// archivos, no solo la lista, sino miniaturas»). Nunca se baja el archivo
// entero para mostrarlo chiquito: la mini lo lee de su disco y devuelve un JPEG
// de 480 px.
//
// La mini es un Mac, así que se usan sus herramientas (cero dependencias):
// - `sips` para las imágenes (jpg, png, heic, webp, tiff…).
// - Quick Look (`qlmanage -t`) para videos, PDF y documentos de Office; su
//   PNG se pasa a JPEG con `sips`.
// Si algo falla o tarda más de 15 s, no hay miniatura (la pantalla muestra el
// ícono del tipo) y se anota para no reintentar enseguida. Nunca tira el
// servidor: cada herramienta corre aparte (execFile, sin shell), de a 2 a la
// vez y en fila.
//
// ⚠️ En el disco los archivos no tienen extensión (<agencia>/<id>) y Quick Look
// decide el tipo POR LA EXTENSIÓN y siguiendo los enlaces simbólicos hasta el
// archivo real (probado el 02/10: con un symlink «archivo.pdf» no hace nada).
// Por eso se le da un ENLACE DURO con la extensión, en una carpeta temporal del
// MISMO disco: no copia un byte.
//
// La caché vive al lado de los datos: <raíz>/.miniaturas/<ab>/<sha256>.jpg,
// con sha256(clave + tamaño). Borrarla es seguro: se rehace sola.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";

export const LADO_MINIATURA = 480;
/** Para MIRAR una foto que el navegador no dibuja (HEIC del iPhone; Jhon, 06/10):
 *  el visor pide la conversión a JPG de este lado, no la miniatura. */
export const LADO_VISTA = 2048;
export const LADOS = new Set([LADO_MINIATURA, LADO_VISTA]);
export const TIEMPO_MINIATURA = 15_000;
export const MINIATURAS_A_LA_VEZ = 2;
/** Más que esto esperando: se contesta «ahora no» en vez de acumular. */
export const COLA_MAXIMA = 400;
/** Una que falló no se reintenta hasta dentro de un día. */
export const REINTENTO_MS = 24 * 3600 * 1000;
export const CARPETA_CACHE = ".miniaturas";

/** Lo que va directo a sips; lo demás pasa por Quick Look. */
export const POR_SIPS = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "tif", "tiff", "bmp"]);
const EXTENSION_OK = /^[a-z0-9]{1,8}$/;
export const extensionValida = (x) => typeof x === "string" && EXTENSION_OK.test(x);

const error = (mensaje, status) => Object.assign(new Error(mensaje), { status });

/** De a `max` tareas a la vez; las demás esperan en fila. Una tarea cuyo
 *  pedido ya se fue (la persona bajó la página) se saltea al llegarle el
 *  turno: `sigueViva()` lo dice. */
export function crearCola(max = MINIATURAS_A_LA_VEZ, tope = COLA_MAXIMA) {
  let activas = 0;
  const fila = [];
  const siguiente = () => {
    while (activas < max && fila.length) {
      const { tarea, sigueViva, resolver, rechazar } = fila.shift();
      if (!sigueViva()) { resolver(null); continue; }
      activas++;
      Promise.resolve().then(tarea).then(resolver, rechazar).finally(() => { activas--; siguiente(); });
    }
  };
  const encolar = (tarea, sigueViva = () => true) => new Promise((resolver, rechazar) => {
    if (fila.length >= tope) return rechazar(error("demasiadas miniaturas pendientes", 503));
    fila.push({ tarea, sigueViva, resolver, rechazar });
    siguiente();
  });
  encolar.estado = () => ({ activas, esperando: fila.length });
  return encolar;
}

/** Corre una herramienta sin shell y con tiempo máximo (la mata si se cuelga). */
function correr(binario, args, tiempo) {
  return new Promise((resolve, reject) => {
    execFile(binario, args, { timeout: tiempo, killSignal: "SIGKILL", windowsHide: true }, (e) => (e ? reject(e) : resolve()));
  });
}

async function existe(p) {
  try { const s = await fsp.stat(p); return s.size > 0 ? s : null; } catch { return null; }
}

/** Dónde queda la miniatura de un archivo en la caché de su disco. */
export function rutaEnCache(raiz, clave, size, lado = LADO_MINIATURA) {
  // La miniatura de siempre conserva su clave (la caché que ya está en el disco
  // sigue sirviendo); otro lado lleva el lado en la clave.
  const h = createHash("sha256").update(lado === LADO_MINIATURA ? `${clave}:${size}` : `${clave}:${size}:${lado}`).digest("hex");
  return path.join(raiz, CARPETA_CACHE, h.slice(0, 2), `${h}.jpg`);
}

/** Arma la miniatura en una carpeta temporal del mismo disco y la deja en la
 *  caché. Devuelve la ruta, o null si no se pudo. */
async function generar(conf, { raiz, ruta, x, destino, lado = LADO_MINIATURA }) {
  const tiempo = conf.tiempoMiniatura ?? TIEMPO_MINIATURA;
  const sips = conf.sips ?? "/usr/bin/sips";
  const qlmanage = conf.qlmanage ?? "/usr/bin/qlmanage";
  const tmp = path.join(raiz, CARPETA_CACHE, ".tmp", randomUUID());
  await fsp.mkdir(tmp, { recursive: true });
  try {
    const conNombre = path.join(tmp, `archivo.${x}`);
    // Enlace duro (mismo disco, cero bytes). Si el disco no lo permite, un
    // symlink: a sips le alcanza; a Quick Look no, y queda sin miniatura.
    try { await fsp.link(ruta, conNombre); } catch { await fsp.symlink(ruta, conNombre); }
    const jpg = path.join(tmp, "mini.jpg");
    // Para mirar, más calidad que para la miniatura.
    const aJpeg = ["-s", "format", "jpeg", "-s", "formatOptions", lado === LADO_MINIATURA ? "75" : "85"];
    if (POR_SIPS.has(x)) {
      await correr(sips, ["-Z", String(lado), ...aJpeg, conNombre, "--out", jpg], tiempo);
    } else {
      await correr(qlmanage, ["-t", "-s", String(LADO_MINIATURA), "-o", tmp, conNombre], tiempo);
      const png = path.join(tmp, `archivo.${x}.png`);
      if (!(await existe(png))) return null;
      await correr(sips, [...aJpeg, png, "--out", jpg], tiempo);
    }
    if (!(await existe(jpg))) return null;
    await fsp.mkdir(path.dirname(destino), { recursive: true });
    await fsp.rename(jpg, destino);
    return destino;
  } catch (e) {
    // Una línea por falla (y cada falla se anota por un día): sirve para ver si
    // macOS está pidiendo un permiso o si una herramienta no está.
    console.error(`[nas-drive] miniatura .${x}: ${String(e?.message ?? e).split("\n")[0].slice(0, 200)}`);
    return null;
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

/** La miniatura de un archivo ya ubicado: de la caché o recién hecha.
 *  `enCurso` junta los pedidos simultáneos del mismo archivo en uno solo. */
export async function miniaturaDe(conf, cola, enCurso, { raiz, ruta, clave, size, x, lado = LADO_MINIATURA }, sigueViva = () => true) {
  if (!extensionValida(x)) throw error("extensión inválida", 400);
  if (!LADOS.has(lado)) throw error("lado inválido", 400);
  const destino = rutaEnCache(raiz, clave, size, lado);
  if (await existe(destino)) return destino;
  const marca = `${destino}.no`;
  try {
    const s = await fsp.stat(marca);
    if (Date.now() - s.mtimeMs < REINTENTO_MS) return null;
  } catch { /* nunca falló */ }
  let pedido = enCurso.get(destino);
  if (pedido) {
    pedido.interesados.add(sigueViva);
  } else {
    // Se hace si TODAVÍA la quiere alguno de los que la pidieron. ⚠️ El primer
    // interesado entra ANTES de encolar: la cola pregunta en el acto.
    const interesados = new Set([sigueViva]);
    pedido = { interesados };
    pedido.p = cola(async () => {
      if (await existe(destino)) return destino; // la hizo otro mientras esperaba
      const hecha = await generar(conf, { raiz, ruta, x, destino, lado });
      if (!hecha) {
        await fsp.mkdir(path.dirname(marca), { recursive: true }).catch(() => {});
        await fsp.writeFile(marca, "").catch(() => {});
      }
      return hecha;
    }, () => [...interesados].some((f) => f())).finally(() => enCurso.delete(destino));
    enCurso.set(destino, pedido);
  }
  return pedido.p;
}

/** Manda la miniatura con caché larga en el navegador: la URL firmada no
 *  cambia en horas (la edge redondea el vencimiento). */
export function servirMiniatura(res, archivo, size) {
  res.writeHead(200, {
    "Content-Type": "image/jpeg",
    "Content-Length": size,
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
  return new Promise((resolve) => {
    const r = fs.createReadStream(archivo);
    r.on("error", () => { res.destroy(); resolve(); });
    res.on("close", () => { r.destroy(); resolve(); });
    r.pipe(res);
  });
}
