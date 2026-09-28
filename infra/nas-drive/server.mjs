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
import { Transform } from "node:stream";
import { verificar, recibo } from "./firma.mjs";

export const MAX_POR_PEDIDO = 95 * 1024 * 1024; // el proxy de Cloudflare corta en 100 MB
const CLAVE_OK = /^[0-9a-f-]{36}(\/[0-9a-f-]{36}){1,2}$/;
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
  };
}

/** En qué raíz está un archivo (o una carpeta de partes), si está. */
async function buscar(conf, rel) {
  for (const r of conf.raices) {
    try { await fsp.access(path.join(r, rel)); return path.join(r, rel); } catch { /* sigue */ }
  }
  return null;
}

/** La raíz con más espacio libre, como el `mfs` de rclone union. Una raíz que
 *  no responde (disco desmontado, permiso de macOS) se saltea en vez de tirar
 *  todo el servidor. */
async function raizConMasLugar(conf) {
  let mejor = null;
  let libre = -1;
  for (const r of conf.raices) {
    try {
      await fsp.mkdir(r, { recursive: true });
      const s = await fsp.statfs(r);
      const l = s.bavail * s.bsize;
      if (l > libre) { libre = l; mejor = r; }
    } catch { /* se saltea */ }
  }
  if (!mejor) throw Object.assign(new Error("ningún disco disponible"), { status: 507 });
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
  const raiz = await raizConMasLugar(conf);
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
  const raiz = existente ? existente.slice(0, -carpeta.length - 1) : await raizConMasLugar(conf);
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
  const { Readable } = await import("node:stream");
  const todas = Readable.from((async function* () {
    for (const p of partes) yield* fs.createReadStream(p);
  })());
  const r = await escribirAtomico(raiz, d.k, todas, Number.isFinite(max) ? max : Infinity);
  await fsp.rm(carpeta, { recursive: true, force: true });
  return json(res, 200, { ...r, recibo: recibo(conf.secreto, { k: d.k, ...r }) });
}

async function borrar(conf, res, d) {
  for (const r of conf.raices) await fsp.rm(path.join(r, d.k), { force: true });
  res.writeHead(204);
  res.end();
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
  return http.createServer(async (req, res) => {
    try {
      cors(conf, req, res);
      const url = new URL(req.url ?? "/", "http://nas");
      if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
      if (url.pathname === "/salud" && req.method === "GET") return await salud(conf, res);
      if (url.pathname !== "/o") return json(res, 404, { error: "no existe" });

      const d = verificar(conf.secreto, url.searchParams.get("t") ?? "");
      if (!d) return json(res, 403, { error: "permiso inválido o vencido" });
      if (!CLAVE_OK.test(String(d.k))) return json(res, 400, { error: "ruta inválida" });

      // La operación del permiso tiene que coincidir con el método: un
      // permiso para BAJAR no sirve para subir ni para borrar.
      const esperado = { get: ["GET", "HEAD"], put: ["PUT"], parte: ["PUT"], completar: ["POST"], borrar: ["DELETE"] }[d.op];
      if (!esperado || !esperado.includes(req.method)) return json(res, 405, { error: "operación no permitida con este permiso" });

      if (d.op === "get") return await servirArchivo(conf, req, res, d);
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
  const s = crearServidor(conf);
  // Subidas largas por el túnel: el límite por defecto de Node (5 min) cortaría
  // una parte de 95 MB con una conexión lenta.
  s.requestTimeout = 30 * 60 * 1000;
  s.listen(conf.puerto, conf.host, () => {
    console.log(`[nas-drive] escuchando en ${conf.host}:${conf.puerto} · raíces: ${conf.raices.join(", ")}`);
  });
}
