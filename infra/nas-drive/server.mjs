// Servidor de archivos del Drive de Oficina, en el NAS (mini5).
//
// Decisión de Jhon (28/09/2026): el Drive guarda TODO en el NAS, sin R2 y sin
// copia de seguridad; desde internet se llega por un Cloudflare Tunnel.
//
// POR QUÉ UN SERVIDOR PROPIO Y NO `rclone serve s3`: se probó el 28/09 y dos
// cosas lo descartaron. (1) El navegador pregunta antes de subir (CORS
// preflight) y rclone le contesta 400 → la subida directa se cancela. (2) Un
// pedido de un pedazo (Range) vuelve con 200 y no 206 → un video no se puede
// adelantar. Además acá los archivos quedan como ARCHIVOS COMUNES en
// NAS1/NAS2: sin copia de seguridad, poder verlos y copiarlos desde Finder es
// lo único que queda si algo se rompe.
//
// SEGURIDAD
// - Solo se atiende con un permiso firmado por Maven (ver firma.mjs), que dice
//   qué operación, sobre qué archivo, hasta cuándo y cuánto puede pesar.
// - Escucha en 127.0.0.1: la única puerta desde afuera es el túnel.
// - Las rutas son `<agencia>/<id>` (uuid): nunca un nombre de archivo, así que
//   no hay «../» ni caracteres raros que colar.
// - Nada se sirve como página: HTML/SVG/JS van siempre como descarga, y todo
//   lleva `Content-Security-Policy: sandbox`.
//
// Configuración por variables de entorno (ver README.md).

import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { verificar, recibo } from "./firma.mjs";
import { armarZip } from "./zip.mjs";
import { CARPETA_CACHE, crearCola, extensionValida, miniaturaDe, rutaEnCache, servirMiniatura } from "./miniaturas.mjs";

export const MAX_POR_PEDIDO = 95 * 1024 * 1024; // el proxy de Cloudflare corta en 100 MB
const CLAVE_OK = /^[0-9a-f-]{36}(\/[0-9a-f-]{36}){1,2}$/;
// Los archivos importados de Google (importar.mjs): un enlace duro en
// <agencia>/google/<id>. Se leen y se borran; nunca se suben (la edge no da
// permisos de subida para estas rutas, y si alguno llegara, el NAS lo frena).
const CLAVE_IMPORTADA = /^[0-9a-f-]{36}\/google\/[0-9a-f-]{36}$/;
const SUBIDA_OK = /^[0-9a-f-]{36}$/;
const PELIGROSOS = /html|svg|xml|javascript|ecmascript/i;

export function configDesdeEntorno(env = process.env) {
  const secreto = env.DRIVE_SECRETO ?? "";
  if (secreto.length < 32) throw new Error("DRIVE_SECRETO falta o tiene menos de 32 caracteres");
  const raices = (env.RAICES ?? "").split(",").map((r) => r.trim()).filter(Boolean);
  if (!raices.length) throw new Error("RAICES vacío: ¿dónde se guardan los archivos?");
  return {
    secreto,
    raices,
    origenes: (env.ORIGENES ?? "https://app.maven-ai.me").split(",").map((o) => o.trim()).filter(Boolean),
    puerto: Number(env.PUERTO ?? 8790),
    host: env.HOST ?? "127.0.0.1",
    // Las herramientas de las miniaturas (miniaturas.mjs); por defecto las del Mac.
    sips: env.SIPS || undefined,
    qlmanage: env.QLMANAGE || undefined,
  };
}

/** En qué raíz está un archivo (o una carpeta de partes), si está. */
async function buscar(conf, rel) {
  for (const r of conf.raices) {
    try { await fsp.access(path.join(r, rel)); return path.join(r, rel); } catch { /* sigue */ }
  }
  return null;
}

/** Lo que cada disco tiene que dejar libre: un disco lleno al 100% se vuelve
 *  lento y frágil (y deja sin lugar al índice de la noche). */
export const MARGEN_LIBRE = 0.05;

/** La raíz con más espacio libre, como el `mfs` de rclone union, entre las que
 *  pueden recibir `necesita` bytes sin bajar del margen. Una raíz que no
 *  responde (disco desmontado, permiso de macOS) se saltea en vez de tirar
 *  todo el servidor.
 *
 *  ⚠️ Antes elegía el disco con más lugar SIN mirar si el archivo entraba: con
 *  los discos casi llenos, la subida fallaba a mitad de camino con un error
 *  genérico. Ahora se avisa ANTES de escribir un byte (507). */
async function raizConMasLugar(conf, necesita = 0) {
  let mejor = null;
  let libre = -1;
  for (const r of conf.raices) {
    try {
      await fsp.mkdir(r, { recursive: true });
      const s = await fsp.statfs(r);
      const l = s.bavail * s.bsize;
      const total = s.blocks * s.bsize;
      if (l - necesita < total * MARGEN_LIBRE) continue;
      if (l > libre) { libre = l; mejor = r; }
    } catch { /* se saltea */ }
  }
  if (!mejor) throw Object.assign(new Error("El NAS no tiene lugar para este archivo"), { status: 507 });
  return mejor;
}

function cors(conf, req, res) {
  const origen = req.headers.origin;
  if (origen && conf.origenes.includes(origen)) {
    res.setHeader("Access-Control-Allow-Origin", origen);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, PUT, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range");
    res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
}

function json(res, status, cuerpo) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(cuerpo));
}

/** Cuenta y calcula la huella mientras pasa, y corta si se pasa del tope. */
function medidor(tope) {
  const hash = createHash("sha256");
  let size = 0;
  const t = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (size > tope) return cb(Object.assign(new Error("se pasó del tamaño permitido"), { status: 413 }));
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  return { t, resultado: () => ({ size, sha256: hash.digest("hex") }) };
}

/** Escribe a un temporal y recién al final lo pone en su lugar: un corte a
 *  mitad de camino no deja un archivo roto con el nombre del bueno. */
async function escribirAtomico(raiz, rel, fuente, tope) {
  const tmp = path.join(raiz, ".tmp", randomUUID());
  await fsp.mkdir(path.dirname(tmp), { recursive: true });
  const m = medidor(tope);
  try {
    await pipeline(fuente, m.t, fs.createWriteStream(tmp, { flags: "wx" }));
    const destino = path.join(raiz, rel);
    await fsp.mkdir(path.dirname(destino), { recursive: true });
    await fsp.rename(tmp, destino);
    return m.resultado();
  } catch (e) {
    await fsp.rm(tmp, { force: true });
    throw e;
  }
}

async function servirArchivo(conf, req, res, d) {
  const archivo = await buscar(conf, d.k);
  if (!archivo) return json(res, 404, { error: "no existe" });
  const { size } = await fsp.stat(archivo);
  const crudo = typeof d.ct === "string" && d.ct.length < 200 ? d.ct : "application/octet-stream";
  // Un texto sin charset el navegador lo lee como Latin-1: «—» salía «â€”»
  // (encontrado probando en prod el 28/09). Los archivos de texto de hoy son
  // UTF-8 casi siempre.
  const tipo = /^text\//i.test(crudo) && !/charset=/i.test(crudo) ? `${crudo}; charset=utf-8` : crudo;
  const descarga = !!d.dl || PELIGROSOS.test(tipo);
  const nombre = typeof d.n === "string" ? d.n.slice(0, 200) : "archivo";
  res.setHeader("Content-Type", tipo);
  res.setHeader("Content-Disposition", `${descarga ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(nombre)}`);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");

  // Range: lo que usa un <video> para adelantar. 206 con el pedazo pedido.
  const rango = typeof req.headers.range === "string" ? req.headers.range.match(/^bytes=(\d*)-(\d*)$/) : null;
  if (req.headers.range && !rango) {
    res.writeHead(416, { "Content-Range": `bytes */${size}` });
    return res.end();
  }
  if (rango) {
    let desde, hasta;
    if (rango[1] === "") { desde = Math.max(0, size - Number(rango[2])); hasta = size - 1; }
    else { desde = Number(rango[1]); hasta = rango[2] === "" ? size - 1 : Math.min(Number(rango[2]), size - 1); }
    if (!(desde <= hasta) || desde >= size) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { "Content-Range": `bytes ${desde}-${hasta}/${size}`, "Content-Length": hasta - desde + 1 });
    if (req.method === "HEAD") return res.end();
    return pipeline(fs.createReadStream(archivo, { start: desde, end: hasta }), res).catch(() => {});
  }
  res.writeHead(200, { "Content-Length": size });
  if (req.method === "HEAD") return res.end();
  return pipeline(fs.createReadStream(archivo), res).catch(() => {});
}

function topeDe(req, d) {
  const max = Number(d.max);
  if (!Number.isFinite(max) || max <= 0) throw Object.assign(new Error("el permiso no dice cuánto puede pesar"), { status: 400 });
  const largo = Number(req.headers["content-length"]);
  const tope = Math.min(max, MAX_POR_PEDIDO);
  if (Number.isFinite(largo) && largo > tope) throw Object.assign(new Error("demasiado grande para un solo pedido"), { status: 413 });
  return tope;
}

async function subirEntero(conf, req, res, d) {
  const tope = topeDe(req, d);
  if (await buscar(conf, d.k)) return json(res, 409, { error: "ya existe" });
  const largo = Number(req.headers["content-length"]);
  const raiz = await raizConMasLugar(conf, Number.isFinite(largo) ? largo : tope);
  const r = await escribirAtomico(raiz, d.k, req, tope);
  return json(res, 200, { ...r, recibo: recibo(conf.secreto, { k: d.k, ...r }) });
}

async function subirParte(conf, req, res, d) {
  if (!SUBIDA_OK.test(String(d.up)) || !Number.isInteger(d.i) || d.i < 0 || d.i > 9999) {
    return json(res, 400, { error: "parte inválida" });
  }
  const tope = topeDe(req, d);
  const carpeta = path.join(".partes", d.up);
  // Todas las partes de una subida van al MISMO disco: se juntan con un
  // rename, que no cruza discos. La primera elige; las demás la siguen.
  const existente = await buscar(conf, carpeta);
  // La PRIMERA parte elige disco para el archivo ENTERO, y dos veces: al
  // juntarlas, las partes y el archivo final conviven un momento. Si no, la
  // subida podía ir bien hasta la última parte y morir al completar.
  const total = Number(d.total);
  const raiz = existente
    ? existente.slice(0, -carpeta.length - 1)
    : await raizConMasLugar(conf, Number.isFinite(total) && total > 0 ? total * 2 : tope);
  const r = await escribirAtomico(raiz, path.join(carpeta, String(d.i)), req, tope);
  return json(res, 200, { i: d.i, size: r.size });
}

async function completar(conf, res, d) {
  if (!SUBIDA_OK.test(String(d.up)) || !Number.isInteger(d.n) || d.n < 1 || d.n > 10000) {
    return json(res, 400, { error: "subida inválida" });
  }
  const carpeta = await buscar(conf, path.join(".partes", d.up));
  if (!carpeta) return json(res, 404, { error: "no hay partes de esa subida" });
  if (await buscar(conf, d.k)) return json(res, 409, { error: "ya existe" });
  const raiz = path.dirname(path.dirname(carpeta));
  const partes = [];
  for (let i = 0; i < d.n; i++) {
    const p = path.join(carpeta, String(i));
    try { await fsp.access(p); } catch { return json(res, 400, { error: `falta la parte ${i}` }); }
    partes.push(p);
  }
  const max = Number(d.max);
  const todas = Readable.from((async function* () {
    for (const p of partes) yield* fs.createReadStream(p);
  })());
  const r = await escribirAtomico(raiz, d.k, todas, Number.isFinite(max) ? max : Infinity);
  await fsp.rm(carpeta, { recursive: true, force: true });
  return json(res, 200, { ...r, recibo: recibo(conf.secreto, { k: d.k, ...r }) });
}

async function borrar(conf, res, d) {
  for (const r of conf.raices) {
    // Su miniatura también (antes de borrar: el nombre sale del tamaño).
    const s = await fsp.stat(path.join(r, d.k)).catch(() => null);
    if (s) {
      const mini = rutaEnCache(r, d.k, s.size);
      await fsp.rm(mini, { force: true });
      await fsp.rm(`${mini}.no`, { force: true });
    }
    await fsp.rm(path.join(r, d.k), { force: true });
  }
  res.writeHead(204);
  res.end();
}

// ── Varios archivos en un .zip (POST /zip) ──────────────────────────────────
// La edge `drive` (acción bajar_varios) decide QUÉ entra —con la RLS de la
// persona— y lo firma: { op: "zip", e, n: nombre del .zip, l: [{ k, n }] }.
// Una carpeta va como { n: "Carpeta/" } (sin k), para que una vacía también
// llegue. El permiso va en el CUERPO (formulario) y no en la URL: con miles de
// archivos pesa más de lo que aguanta una URL.

/** Los mismos topes que la edge (supabase/functions/drive/logica.ts). */
export const MAX_ENTRADAS_ZIP = 5000;
export const MAX_BYTES_ZIP = 50 * 1024 ** 3;
/** Un permiso de zip con 5000 rutas largas ronda 1–2 MB. */
export const MAX_PERMISO_ZIP = 4 * 1024 * 1024;
const MAX_CUERPO_ZIP = MAX_PERMISO_ZIP + 4096;
const MAX_RUTA_ZIP = 1024;

const error = (mensaje, status) => Object.assign(new Error(mensaje), { status });

/** Una ruta adentro del .zip: relativa, sin «..», sin barras invertidas ni
 *  caracteres de control. Al descomprimir, una ruta mala escribe FUERA de la
 *  carpeta de destino («zip slip»). */
export function rutaDelZipValida(n, carpeta) {
  if (typeof n !== "string" || !n || n.length > MAX_RUTA_ZIP) return false;
  if (/[\\\u0000-\u001f\u007f]/.test(n) || n.startsWith("/") || /^[a-zA-Z]:/.test(n)) return false;
  if (carpeta !== n.endsWith("/")) return false;
  const partes = (carpeta ? n.slice(0, -1) : n).split("/");
  return partes.every((p) => p !== "" && p !== "." && p !== "..");
}

/** Revisa el pedido firmado ENTERO antes de mandar un byte. */
export function validarPedidoZip(d) {
  if (!Array.isArray(d.l) || d.l.length === 0) throw error("el .zip no tiene nada", 400);
  if (d.l.length > MAX_ENTRADAS_ZIP) throw error(`un .zip lleva hasta ${MAX_ENTRADAS_ZIP} archivos y carpetas`, 413);
  const vistos = new Set();
  let agencia = null;
  const lista = d.l.map((x) => {
    const carpeta = !!x && typeof x === "object" && x.k === undefined;
    const n = x?.n;
    if (!rutaDelZipValida(n, carpeta)) throw error("ruta inválida dentro del .zip", 400);
    if (vistos.has(n)) throw error("ruta repetida dentro del .zip", 400);
    vistos.add(n);
    if (carpeta) return { n, carpeta: true };
    // Cada archivo con las MISMAS reglas que un permiso de bajar uno solo.
    const k = String(x.k);
    if (!CLAVE_OK.test(k) && !CLAVE_IMPORTADA.test(k)) throw error("ruta inválida", 400);
    // Todo de UNA agencia (la persona solo ve la suya): la agencia va en el camino.
    const suya = k.slice(0, 36);
    if (agencia !== null && suya !== agencia) throw error("un .zip no mezcla agencias", 400);
    agencia = suya;
    return { n, k };
  });
  const nombre = typeof d.n === "string" && /\.zip$/i.test(d.n) && d.n.length <= 200 && !/[/\\\u0000-\u001f\u007f]/.test(d.n)
    ? d.n : "Maven.zip";
  return { nombre, lista };
}

function leerCuerpo(req, tope) {
  return new Promise((resolve, reject) => {
    const pedazos = [];
    let total = 0;
    req.on("data", (p) => {
      total += p.length;
      if (total > tope) { reject(error("el pedido es demasiado grande", 413)); req.destroy(); return; }
      pedazos.push(p);
    });
    req.on("end", () => resolve(Buffer.concat(pedazos).toString("utf8")));
    req.on("error", reject);
  });
}

/** En qué raíz está un archivo y cuánto pesa, o null. */
async function ubicar(conf, rel) {
  for (const r of conf.raices) {
    try {
      const s = await fsp.stat(path.join(r, rel));
      if (s.isFile()) return { raiz: r, ruta: path.join(r, rel), size: s.size, fecha: s.mtime };
    } catch { /* sigue */ }
  }
  return null;
}

/** La miniatura (op "mini"): de la caché del disco o hecha en el momento.
 *  Sin miniatura posible, 404 y la pantalla muestra el ícono del tipo. */
async function servirMini(conf, req, res, d, cola, enCurso) {
  if (!extensionValida(d.x)) return json(res, 400, { error: "extensión inválida" });
  const a = await ubicar(conf, d.k);
  if (!a) return json(res, 404, { error: "no existe" });
  // Si la persona ya no la quiere (bajó la página), no se hace al llegarle el turno.
  let vivo = true;
  res.on("close", () => { vivo = false; });
  const archivo = await miniaturaDe(conf, cola, enCurso, { raiz: a.raiz, ruta: a.ruta, clave: d.k, size: a.size, x: d.x }, () => vivo);
  if (!archivo) return json(res, 404, { error: "sin miniatura" });
  const s = await fsp.stat(archivo);
  return servirMiniatura(res, archivo, s.size);
}

/** El nombre de la nota de lo que falta, sin chocar con una ruta del .zip. */
function nombreLibre(base, ocupados) {
  let n = base;
  for (let i = 2; ocupados.has(n); i++) n = base.replace(/\.txt$/, ` (${i}).txt`);
  return n;
}

async function servirZip(conf, req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "el .zip se pide con POST" });
  if (!/^application\/x-www-form-urlencoded\b/i.test(String(req.headers["content-type"] ?? ""))) {
    return json(res, 415, { error: "el permiso va como formulario (campo t)" });
  }
  const largo = Number(req.headers["content-length"]);
  if (Number.isFinite(largo) && largo > MAX_CUERPO_ZIP) return json(res, 413, { error: "el pedido es demasiado grande" });
  const cuerpo = await leerCuerpo(req, MAX_CUERPO_ZIP);
  const d = verificar(conf.secreto, new URLSearchParams(cuerpo).get("t") ?? "", Date.now(), MAX_PERMISO_ZIP);
  // Un permiso de bajar UN archivo no sirve aquí, ni uno de zip en /o.
  if (!d || d.op !== "zip") return json(res, 403, { error: "permiso inválido o vencido" });
  const { nombre, lista } = validarPedidoZip(d);

  // Todo se ubica ANTES de empezar: si se pasa del tope, se avisa con un error
  // y no con un .zip cortado a la mitad.
  const entradas = [];
  const faltan = [];
  let total = 0;
  const ahora = new Date();
  for (const e of lista) {
    if (e.carpeta) { entradas.push({ nombre: e.n, carpeta: true, fecha: ahora }); continue; }
    const a = await ubicar(conf, e.k);
    if (!a) { faltan.push(e.n); continue; }
    total += a.size;
    if (total > MAX_BYTES_ZIP) return json(res, 413, { error: "el .zip pasa el tope de 50 GB" });
    entradas.push({
      nombre: e.n, size: a.size, fecha: a.fecha,
      abrir: () => fs.createReadStream(a.ruta, { start: 0, end: a.size - 1 }),
    });
  }
  // Un archivo que la base tiene y el disco no: el .zip sale igual con lo
  // demás, y una nota adentro dice cuál faltó (como hace Google).
  if (faltan.length) {
    const nota = Buffer.from(`No se encontraron en el NAS:\n\n${faltan.join("\n")}\n`, "utf8");
    entradas.push({
      nombre: nombreLibre("No se pudieron incluir.txt", new Set(lista.map((e) => e.n))),
      size: nota.length, fecha: ahora, abrir: async function* () { yield nota; },
    });
  }

  const ascii = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]|["\\]/g, "_");
  res.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
    // Sin Content-Length: el .zip se arma mientras baja.
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  try {
    // Si el navegador corta, pipeline destruye el generador y el archivo
    // abierto se cierra: no se sigue leyendo el disco para nadie.
    await pipeline(Readable.from(armarZip(entradas)), res);
  } catch (e) {
    if (e?.code !== "ERR_STREAM_PREMATURE_CLOSE") console.error("[nas-drive] zip", e);
    res.destroy();
  }
}

async function salud(conf, res) {
  const raices = [];
  for (const r of conf.raices) {
    try {
      const s = await fsp.statfs(r);
      raices.push({ ok: true, libre: s.bavail * s.bsize, total: s.blocks * s.bsize });
    } catch (e) {
      raices.push({ ok: false, error: e.code ?? "error" });
    }
  }
  return json(res, raices.some((r) => r.ok) ? 200 : 503, { ok: raices.some((r) => r.ok), raices });
}

export function crearServidor(conf) {
  // Las miniaturas se hacen de a pocas (sips y Quick Look usan CPU y disco) y un
  // mismo archivo pedido dos veces a la vez se hace una sola.
  const cola = crearCola(conf.miniaturasALaVez);
  const enCurso = new Map();
  return http.createServer(async (req, res) => {
    try {
      cors(conf, req, res);
      const url = new URL(req.url ?? "/", "http://nas");
      if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
      if (url.pathname === "/salud" && req.method === "GET") return await salud(conf, res);
      if (url.pathname === "/zip") return await servirZip(conf, req, res);
      if (url.pathname !== "/o") return json(res, 404, { error: "no existe" });

      const d = verificar(conf.secreto, url.searchParams.get("t") ?? "");
      if (!d) return json(res, 403, { error: "permiso inválido o vencido" });
      const importada = CLAVE_IMPORTADA.test(String(d.k));
      if (!CLAVE_OK.test(String(d.k)) && !importada) return json(res, 400, { error: "ruta inválida" });
      if (importada && d.op !== "get" && d.op !== "mini" && d.op !== "borrar") return json(res, 400, { error: "un archivo importado no se sube ni se reemplaza" });

      // La operación del permiso tiene que coincidir con el método: un
      // permiso para BAJAR no sirve para subir ni para borrar.
      const esperado = { get: ["GET", "HEAD"], mini: ["GET"], put: ["PUT"], parte: ["PUT"], completar: ["POST"], borrar: ["DELETE"] }[d.op];
      if (!esperado || !esperado.includes(req.method)) return json(res, 405, { error: "operación no permitida con este permiso" });

      if (d.op === "get") return await servirArchivo(conf, req, res, d);
      if (d.op === "mini") return await servirMini(conf, req, res, d, cola, enCurso);
      if (d.op === "put") return await subirEntero(conf, req, res, d);
      if (d.op === "parte") return await subirParte(conf, req, res, d);
      if (d.op === "completar") return await completar(conf, res, d);
      if (d.op === "borrar") return await borrar(conf, res, d);
    } catch (e) {
      const status = e.status ?? 500;
      if (status === 500) console.error("[nas-drive]", e);
      if (!res.headersSent) json(res, status, { error: e.message ?? "error" });
      else res.destroy();
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const conf = configDesdeEntorno();
  // ⚠️ Si el servidor se cayó a mitad de una miniatura, en .tmp quedó un enlace
  // DURO al archivo: borrar el archivo no liberaría su lugar. Se limpia al arrancar.
  for (const r of conf.raices) fs.rmSync(path.join(r, CARPETA_CACHE, ".tmp"), { recursive: true, force: true });
  const s = crearServidor(conf);
  // Subidas largas por el túnel: el límite por defecto de Node (5 min) cortaría
  // una parte de 95 MB con una conexión lenta.
  s.requestTimeout = 30 * 60 * 1000;
  s.listen(conf.puerto, conf.host, () => {
    console.log(`[nas-drive] escuchando en ${conf.host}:${conf.puerto} · raíces: ${conf.raices.join(", ")}`);
  });
}
