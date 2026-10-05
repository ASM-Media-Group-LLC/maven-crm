// Correr: node --test infra/nas-drive/test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import { crearServidor, MAX_ENTRADAS_ZIP, MAX_PERMISO_ZIP, MAX_POR_PEDIDO, rutaDelZipValida } from "./server.mjs";
import { firmar, verificar } from "./firma.mjs";
import { armarZip, cabeceraLocal, cierre, crc32, crc32Js, descriptor, entradaCentral, LIMITE_32, necesitaZip64, tamanoDelZip } from "./zip.mjs";
import { crearCola, LADO_VISTA, rutaEnCache } from "./miniaturas.mjs";

const SECRETO = "s".repeat(40);
let dir, conf, srv, base;
const agencia = randomUUID();
const clave = () => `${agencia}/${randomUUID()}`;
const permiso = (datos, venceEn = 60) => firmar(SECRETO, { e: Math.floor(Date.now() / 1000) + venceEn, ...datos });
const url = (datos, venceEn) => `${base}/o?t=${permiso(datos, venceEn)}`;
const sha = (b) => createHash("sha256").update(b).digest("hex");

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nas-drive-"));
  conf = {
    secreto: SECRETO,
    raices: [path.join(dir, "NAS1"), path.join(dir, "NAS2")],
    origenes: ["https://app.maven-ai.me"],
  };
  srv = crearServidor(conf);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(async () => { srv.close(); await fs.rm(dir, { recursive: true, force: true }); });

test("firma: la buena pasa; una alterada, otra clave o vencida, no", () => {
  const p = firmar(SECRETO, { op: "get", k: "x", e: Math.floor(Date.now() / 1000) + 60 });
  assert.equal(verificar(SECRETO, p).op, "get");
  assert.equal(verificar("otro".repeat(10), p), null);
  const [c, f] = p.split(".");
  const cambiado = Buffer.from(JSON.stringify({ op: "borrar", k: "x", e: 9e9 })).toString("base64url");
  assert.equal(verificar(SECRETO, `${cambiado}.${f}`), null);
  assert.equal(verificar(SECRETO, `${c}.${f}.extra`), null);
  assert.equal(verificar(SECRETO, firmar(SECRETO, { op: "get", e: 1 })), null);
});

test("subir entero y bajar: mismos bytes, huella y recibo firmado", async () => {
  const k = clave();
  const datos = Buffer.alloc(200_000, 7);
  const r = await fetch(url({ op: "put", k, max: 1_000_000 }), { method: "PUT", body: datos });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.size, datos.length);
  assert.equal(j.sha256, sha(datos));
  const rec = verificar(SECRETO, j.recibo);
  assert.deepEqual([rec.op, rec.k, rec.size, rec.sha256], ["recibo", k, datos.length, sha(datos)]);

  const g = await fetch(url({ op: "get", k, ct: "application/pdf", n: "Informe final.pdf" }));
  assert.equal(g.status, 200);
  assert.equal(Buffer.from(await g.arrayBuffer()).equals(datos), true);
  assert.match(g.headers.get("content-disposition"), /^inline; filename\*=UTF-8''Informe%20final\.pdf$/);
});

test("Range: 206 con el pedazo pedido (para adelantar un video) y 416 si no existe", async () => {
  const k = clave();
  const datos = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 256));
  await fetch(url({ op: "put", k, max: 10_000 }), { method: "PUT", body: datos });
  const g = await fetch(url({ op: "get", k }), { headers: { Range: "bytes=100-199" } });
  assert.equal(g.status, 206);
  assert.equal(g.headers.get("content-range"), "bytes 100-199/5000");
  assert.equal(Buffer.from(await g.arrayBuffer()).equals(datos.subarray(100, 200)), true);
  const cola = await fetch(url({ op: "get", k }), { headers: { Range: "bytes=-10" } });
  assert.equal(cola.status, 206);
  assert.equal(Buffer.from(await cola.arrayBuffer()).equals(datos.subarray(4990)), true);
  const fuera = await fetch(url({ op: "get", k }), { headers: { Range: "bytes=9000-" } });
  assert.equal(fuera.status, 416);
});

test("por partes: se juntan en orden y en el mismo disco", async () => {
  const k = clave();
  const up = randomUUID();
  const partes = [Buffer.alloc(3000, 1), Buffer.alloc(3000, 2), Buffer.alloc(1234, 3)];
  // Se suben en desorden a propósito: el orden lo da el número de parte.
  for (const i of [2, 0, 1]) {
    const r = await fetch(url({ op: "parte", k, up, i, max: 5000 }), { method: "PUT", body: partes[i] });
    assert.equal(r.status, 200, `parte ${i}`);
  }
  const c = await fetch(url({ op: "completar", k, up, n: 3, max: 100_000 }), { method: "POST" });
  assert.equal(c.status, 200);
  const j = await c.json();
  const todo = Buffer.concat(partes);
  assert.equal(j.sha256, sha(todo));
  const g = await fetch(url({ op: "get", k }));
  assert.equal(Buffer.from(await g.arrayBuffer()).equals(todo), true);
  // Las partes se limpian.
  for (const r of conf.raices) await assert.rejects(fs.access(path.join(r, ".partes", up)));
});

test("completar con una parte faltante no arma un archivo roto", async () => {
  const k = clave();
  const up = randomUUID();
  await fetch(url({ op: "parte", k, up, i: 0, max: 100 }), { method: "PUT", body: Buffer.alloc(10) });
  const c = await fetch(url({ op: "completar", k, up, n: 2, max: 1000 }), { method: "POST" });
  assert.equal(c.status, 400);
  assert.equal((await fetch(url({ op: "get", k }))).status, 404);
});

test("⚠️ el tope del permiso se respeta aunque el navegador mienta el tamaño", async () => {
  const k = clave();
  const r = await fetch(url({ op: "put", k, max: 100 }), { method: "PUT", body: Buffer.alloc(5000) });
  assert.equal(r.status, 413);
  assert.equal((await fetch(url({ op: "get", k }))).status, 404);
  assert.ok(MAX_POR_PEDIDO < 100 * 1024 * 1024, "tiene que entrar por el proxy de Cloudflare");
});

test("⚠️ un permiso para una cosa no sirve para otra", async () => {
  const k = clave();
  await fetch(url({ op: "put", k, max: 100 }), { method: "PUT", body: Buffer.alloc(10) });
  // Permiso de bajar usado para borrar:
  assert.equal((await fetch(url({ op: "get", k }), { method: "DELETE" })).status, 405);
  // Permiso de bajar A, usado para B:
  const otro = clave();
  const [, firmaDeA] = permiso({ op: "get", k }).split(".");
  const datosDeB = Buffer.from(JSON.stringify({ op: "get", k: otro, e: Math.floor(Date.now() / 1000) + 60 })).toString("base64url");
  assert.equal((await fetch(`${base}/o?t=${datosDeB}.${firmaDeA}`)).status, 403);
  // Vencido:
  assert.equal((await fetch(url({ op: "get", k }, -5))).status, 403);
  // Sin permiso:
  assert.equal((await fetch(`${base}/o`)).status, 403);
});

test("⚠️ rutas raras no pasan: solo <agencia>/<id>", async () => {
  for (const k of ["../../etc/passwd", `${agencia}/../x`, "hola.txt", `${agencia}/Mi archivo.pdf`]) {
    const r = await fetch(url({ op: "put", k, max: 10 }), { method: "PUT", body: "x" });
    assert.equal(r.status, 400, k);
  }
});

test("los importados de Google (<agencia>/google/<id>) se leen y se borran, pero nunca se suben", async () => {
  const id = randomUUID();
  const k = `${agencia}/google/${id}`;
  // Como lo deja importar.mjs: un archivo puesto en la raíz, no subido por el NAS.
  const destino = path.join(conf.raices[0], agencia, "google", id);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, "de google");
  const g = await fetch(url({ op: "get", k }));
  assert.equal(g.status, 200);
  assert.equal(await g.text(), "de google");
  for (const op of ["put", "parte", "completar"]) {
    const metodo = op === "completar" ? "POST" : "PUT";
    const r = await fetch(url({ op, k, max: 10, up: randomUUID(), i: 0, n: 1, total: 10 }), { method: metodo, body: metodo === "PUT" ? "x" : undefined });
    assert.equal(r.status, 400, op);
  }
  for (const malo of [`${agencia}/google`, `${agencia}/drive/${id}`, `${agencia}/google/${id}/x`, `google/${id}`]) {
    assert.equal((await fetch(url({ op: "get", k: malo }))).status, 400, malo);
  }
  assert.equal((await fetch(url({ op: "borrar", k }), { method: "DELETE" })).status, 204);
  assert.equal(await fs.stat(destino).catch(() => null), null);
});

test("⚠️ no se pisa un archivo que ya existe", async () => {
  const k = clave();
  await fetch(url({ op: "put", k, max: 10 }), { method: "PUT", body: "uno" });
  assert.equal((await fetch(url({ op: "put", k, max: 10 }), { method: "PUT", body: "dos" })).status, 409);
  assert.equal(await (await fetch(url({ op: "get", k }))).text(), "uno");
});

test("⚠️ HTML y SVG nunca se abren como página: siempre descarga y sandbox", async () => {
  const k = clave();
  await fetch(url({ op: "put", k, max: 100 }), { method: "PUT", body: "<script>alert(1)</script>" });
  const g = await fetch(url({ op: "get", k, ct: "text/html", n: "x.html" }));
  assert.match(g.headers.get("content-disposition"), /^attachment/);
  assert.match(g.headers.get("content-security-policy"), /sandbox/);
  assert.equal(g.headers.get("x-content-type-options"), "nosniff");
});

test("un texto sale como UTF-8 (sin charset, «—» se veía «â€”»)", async () => {
  const k = clave();
  await fetch(url({ op: "put", k, max: 100 }), { method: "PUT", body: "Hola — acentuación" });
  const g = await fetch(url({ op: "get", k, ct: "text/plain" }));
  assert.equal(g.headers.get("content-type"), "text/plain; charset=utf-8");
  const g2 = await fetch(url({ op: "get", k, ct: "text/csv; charset=latin1" }));
  assert.equal(g2.headers.get("content-type"), "text/csv; charset=latin1", "si ya dice cuál, se respeta");
});

test("borrar lo saca de los dos discos", async () => {
  const k = clave();
  await fetch(url({ op: "put", k, max: 10 }), { method: "PUT", body: "x" });
  assert.equal((await fetch(url({ op: "borrar", k }), { method: "DELETE" })).status, 204);
  assert.equal((await fetch(url({ op: "get", k }))).status, 404);
});

test("CORS: solo el origen de Maven, y la pregunta previa contesta 204", async () => {
  const bueno = await fetch(`${base}/o`, { method: "OPTIONS", headers: { Origin: "https://app.maven-ai.me", "Access-Control-Request-Method": "PUT" } });
  assert.equal(bueno.status, 204);
  assert.equal(bueno.headers.get("access-control-allow-origin"), "https://app.maven-ai.me");
  const malo = await fetch(`${base}/o`, { method: "OPTIONS", headers: { Origin: "https://evil.com" } });
  assert.equal(malo.headers.get("access-control-allow-origin"), null);
});

test("salud: cuánto lugar queda, sin pedir permiso y sin decir nada más", async () => {
  const r = await fetch(`${base}/salud`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.raices.length, 2);
  assert.ok(j.raices.every((x) => typeof x.libre === "number"));
});

test("el vector compartido con Maven: Node verifica lo mismo que verifica Deno", () => {
  // Mismo vector que supabase/functions/_shared/drive-firma.test.ts.
  const s = "vector-de-prueba-del-drive-0123456789abcdef";
  const p = "eyJvcCI6InJlY2libyIsImsiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEvMjIyMjIyMjItMjIyMi0yMjIyLTIyMjItMjIyMjIyMjIyMjIyIiwic2l6ZSI6MTIzLCJzaGEyNTYiOiJhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhIiwiZSI6NDEwMjQ0NDgwMH0.JrSS4luiQ5EE77inIqYUPq4zRgTwqFbGchDWLUXW3-0";
  const d = verificar(s, p);
  assert.equal(d.op, "recibo");
  assert.equal(firmar(s, d), p);
});

test("⚠️ si el archivo no entra en ningún disco (dejando 5% libre), 507 ANTES de escribir", async () => {
  // Un disco de verdad tiene muchísimo más que esto libre, así que se pide
  // algo imposible: más que el disco entero.
  const k = clave();
  const enorme = 1e18;
  const r = await fetch(url({ op: "put", k, max: enorme }), { method: "PUT", body: "x", headers: { "Content-Length": "1" } });
  assert.equal(r.status, 200, "un archivo chico entra");
  const k2 = clave();
  const up = randomUUID();
  const p = await fetch(url({ op: "parte", k: k2, up, i: 0, max: 10, total: enorme }), { method: "PUT", body: "x" });
  assert.equal(p.status, 507, "la primera parte reserva el archivo entero");
  assert.match((await p.json()).error, /no tiene lugar/);
});

// ── Varios archivos en un .zip (POST /zip) ──────────────────────────────────

const pedirZip = (datos, { venceEn = 60, metodo = "POST" } = {}) => fetch(`${base}/zip`, {
  method: metodo,
  body: metodo === "POST" ? new URLSearchParams({ t: permiso({ op: "zip", ...datos }, venceEn) }) : undefined,
});
const subir = async (contenido) => {
  const k = clave();
  const r = await fetch(url({ op: "put", k, max: 10_000_000 }), { method: "PUT", body: contenido });
  assert.equal(r.status, 200);
  return k;
};
/** Guarda el .zip, lo prueba con el unzip del sistema y lo descomprime. */
async function probarConUnzip(bytes) {
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), "nas-zip-"));
  const archivo = path.join(carpeta, "prueba.zip");
  await fs.writeFile(archivo, bytes);
  // -t: lee TODO y compara cada CRC. Si algo del formato está mal, sale con error.
  const salida = execFileSync("unzip", ["-t", archivo], { encoding: "utf8" });
  const destino = path.join(carpeta, "afuera");
  execFileSync("unzip", ["-q", archivo, "-d", destino]);
  return { carpeta, destino, salida, archivo };
}

test("zip: tres archivos y una carpeta vacía; unzip -t lo da por bueno y los bytes son los mismos", async () => {
  const a = Buffer.from(Array.from({ length: 300_000 }, (_, i) => (i * 7) % 256));
  const b = Buffer.from("Balance — año 2026\n", "utf8");
  const kA = await subir(a);
  const kB = await subir(b);
  // Un importado de Google, puesto como lo deja importar.mjs.
  const idG = randomUUID();
  const g = Buffer.alloc(5000, 9);
  const destinoG = path.join(conf.raices[1], agencia, "google", idG);
  await fs.mkdir(path.dirname(destinoG), { recursive: true });
  await fs.writeFile(destinoG, g);

  const r = await pedirZip({
    n: "Maven-2026-10-02.zip",
    l: [
      { n: "Contabilidad/" },
      { n: "Contabilidad/Año 2026/" },
      { k: kA, n: "Contabilidad/Año 2026/datos.bin" },
      { k: kB, n: "Contabilidad/Balance.txt" },
      { n: "Vacía/" },
      { k: `${agencia}/google/${idG}`, n: "de google.bin" },
    ],
  });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "application/zip");
  assert.match(r.headers.get("content-disposition"), /^attachment; filename="Maven-2026-10-02\.zip"; filename\*=UTF-8''Maven-2026-10-02\.zip$/);
  const cuerpo = Buffer.from(await r.arrayBuffer());
  // Se arma mientras baja, pero el largo se sabe antes: el navegador muestra el avance.
  assert.equal(Number(r.headers.get("content-length")), cuerpo.length, "Content-Length exacto");
  const { carpeta, destino, salida } = await probarConUnzip(cuerpo);
  assert.match(salida, /No errors detected/);
  assert.ok((await fs.readFile(path.join(destino, "Contabilidad", "Año 2026", "datos.bin"))).equals(a));
  assert.ok((await fs.readFile(path.join(destino, "Contabilidad", "Balance.txt"))).equals(b));
  assert.ok((await fs.readFile(path.join(destino, "de google.bin"))).equals(g));
  assert.ok((await fs.stat(path.join(destino, "Vacía"))).isDirectory(), "la carpeta vacía también llega");
  await fs.rm(carpeta, { recursive: true, force: true });
});

test("zip: ⚠️ ZIP64 (lo que usa un archivo de más de 4 GB) también lo lee unzip", async () => {
  // Se fuerza ZIP64 en todo: mismas cabeceras, descriptores de 8 bytes y
  // cierre ZIP64 que con un video de 5 GB, sin tener que escribir 5 GB.
  const datos = [Buffer.alloc(70_000, 3), Buffer.from("chico"), Buffer.alloc(0)];
  const entradas = [
    { nombre: "Videos/", carpeta: true, fecha: new Date() },
    ...datos.map((d, i) => ({ nombre: `Videos/parte ${i}.bin`, size: d.length, fecha: new Date(), abrir: async function* () { if (d.length) yield d; } })),
  ];
  const pedazos = [];
  for await (const p of armarZip(entradas, { forzarZip64: true })) pedazos.push(p);
  const bytes = Buffer.concat(pedazos);
  // El cierre ZIP64 y su localizador están (firmas 0x06064b50 y 0x07064b50).
  assert.ok(bytes.includes(Buffer.from([0x50, 0x4b, 0x06, 0x06])));
  assert.ok(bytes.includes(Buffer.from([0x50, 0x4b, 0x06, 0x07])));
  const { carpeta, destino, salida } = await probarConUnzip(bytes);
  assert.match(salida, /No errors detected/);
  for (const [i, d] of datos.entries()) assert.ok((await fs.readFile(path.join(destino, "Videos", `parte ${i}.bin`))).equals(d), `parte ${i}`);
  if (process.platform === "darwin") {
    // ditto es el motor del Archive Utility del Mac (lo que usa María).
    const otro = path.join(carpeta, "ditto");
    execFileSync("ditto", ["-x", "-k", path.join(carpeta, "prueba.zip"), otro]);
    assert.ok((await fs.readFile(path.join(otro, "Videos", "parte 0.bin"))).equals(datos[0]));
  }
  await fs.rm(carpeta, { recursive: true, force: true });
});

test("zip: el largo (Content-Length) se sabe antes de mandar un byte y es exactamente lo que sale", async () => {
  const fecha = new Date("2026-10-03T12:00:00Z");
  const juntar = async (entradas, opciones) => {
    const pedazos = [];
    for await (const p of armarZip(entradas, opciones)) pedazos.push(p);
    return Buffer.concat(pedazos).length;
  };
  const archivo = (nombre, d) => ({ nombre, size: d.length, fecha, abrir: async function* () { if (d.length) yield d; } });
  const casos = [
    [],
    [{ nombre: "Vacía/", carpeta: true, fecha }],
    [archivo("vacío.txt", Buffer.alloc(0))],
    [
      { nombre: "Contabilidad/", carpeta: true, fecha },
      { nombre: "Contabilidad/Año 2026/", carpeta: true, fecha },
      archivo("Contabilidad/Año 2026/datos.bin", Buffer.alloc(70_000, 3)),
      archivo("Contabilidad/Balance — ñandú.txt", Buffer.from("Balance — año 2026\n", "utf8")),
      archivo("No se pudieron incluir.txt", Buffer.from("No se encontraron en el NAS:\n\nFotos/x.jpg\n")),
    ],
  ];
  for (const entradas of casos) {
    for (const forzarZip64 of [false, true]) {
      assert.equal(tamanoDelZip(entradas, { forzarZip64 }), await juntar(entradas, { forzarZip64 }), `${entradas.length} entradas, ZIP64 ${forzarZip64}`);
    }
  }
  // Más de 65.535 entradas: el cierre pasa a ZIP64 solo.
  const muchas = Array.from({ length: 70_000 }, (_, i) => archivo(`f${i}.txt`, Buffer.alloc(0)));
  assert.equal(tamanoDelZip(muchas), await juntar(muchas), "70.000 entradas");
  // Un archivo de más de 4 GB (sin escribirlo): las mismas piezas que armarZip.
  const enorme = { nombre: "video.mov", size: 5 * 1024 ** 3, fecha };
  const cab = cabeceraLocal({ nombre: enorme.nombre, fecha, zip64: true }).length;
  const desc = descriptor({ crc: 0, size: enorme.size, zip64: true }).length;
  const central = entradaCentral({ nombre: enorme.nombre, fecha, size: enorme.size, desde: 0, zip64Local: true }).length;
  const fin = cierre({ entradas: 1, inicioCentral: cab + enorme.size + desc, tamanoCentral: central }).length;
  assert.equal(fin, 22 + 56 + 20, "el directorio central empieza pasados los 4 GB: cierre ZIP64");
  assert.equal(tamanoDelZip([enorme]), cab + enorme.size + desc + central + fin, "5 GB: cabecera ZIP64, descriptor de 8 bytes");
});

test("zip: ZIP64 se pide por tamaño o por lugar, justo en el límite de 4 GB", () => {
  assert.equal(necesitaZip64(LIMITE_32 - 1), false);
  assert.equal(necesitaZip64(LIMITE_32), true, "0xFFFFFFFF es la marca de ZIP64: no se puede usar como tamaño");
  assert.equal(necesitaZip64(5 * 1024 ** 3), true);
  // Cabecera local de un archivo grande: tamaños en 0xFFFFFFFF y campo ZIP64.
  const local = cabeceraLocal({ nombre: "video.mov", fecha: new Date(), zip64: true });
  assert.equal(local.readUInt16LE(4), 45);
  assert.equal(local.readUInt32LE(18), LIMITE_32);
  assert.equal(local.readUInt16LE(30 + 9), 0x0001, "el campo ZIP64 va primero en el extra");
  assert.equal(descriptor({ crc: 1, size: 5 * 1024 ** 3, zip64: true }).readBigUInt64LE(16), BigInt(5 * 1024 ** 3));
  assert.equal(descriptor({ crc: 1, size: 10 }).length, 16);
  // Un archivo chico que EMPIEZA después de los 4 GB: ZIP64 solo para el lugar.
  const c = entradaCentral({ nombre: "x", fecha: new Date(), crc: 1, size: 10, desde: 6 * 1024 ** 3 });
  assert.equal(c.readUInt32LE(20), 10);
  assert.equal(c.readUInt32LE(42), LIMITE_32);
  assert.equal(c.readUInt16LE(46 + 1), 0x0001);
  assert.equal(c.readUInt16LE(46 + 1 + 2), 8, "solo el lugar: 8 bytes");
  assert.equal(c.readBigUInt64LE(46 + 1 + 4), BigInt(6 * 1024 ** 3));
});

test("zip: el CRC-32 de JS da lo mismo que el de zlib (y que el vector de la norma)", () => {
  assert.equal(crc32Js(Buffer.from("123456789")), 0xcbf43926);
  const datos = Buffer.from(Array.from({ length: 100_000 }, (_, i) => (i * 31) % 251));
  const enDosPartes = crc32Js(datos.subarray(50_000), crc32Js(datos.subarray(0, 50_000)));
  assert.equal(enDosPartes, crc32Js(datos));
  if (typeof zlib.crc32 === "function") assert.equal(crc32(datos), crc32Js(datos));
});

test("zip: ⚠️ si el navegador corta, se deja de leer el archivo", async () => {
  let leidos = 0;
  let cerrado = false;
  const entradas = [{
    nombre: "enorme.bin", size: 1000 * 65536, fecha: new Date(),
    abrir: async function* () {
      try {
        for (let i = 0; i < 1000; i++) { leidos++; yield Buffer.alloc(65536); }
      } finally { cerrado = true; }
    },
  }];
  let recibidos = 0;
  const navegador = new Writable({
    write(p, _e, cb) {
      recibidos += p.length;
      // Corta a los ~2 MB, como quien cancela la descarga.
      if (recibidos > 2 * 1024 * 1024) return cb(new Error("cancelado"));
      cb();
    },
  });
  await assert.rejects(pipeline(Readable.from(armarZip(entradas)), navegador));
  assert.ok(cerrado, "el archivo se cerró");
  assert.ok(leidos < 100, `leyó ${leidos} de 1000 pedazos`);
});

test("zip: un archivo que falta en el disco no corta el .zip: va una nota con cuál faltó", async () => {
  const k = await subir(Buffer.from("está"));
  const r = await pedirZip({ n: "x.zip", l: [{ k, n: "esta.txt" }, { k: clave(), n: "Fotos/perdida.jpg" }] });
  assert.equal(r.status, 200);
  const cuerpo = Buffer.from(await r.arrayBuffer());
  assert.equal(Number(r.headers.get("content-length")), cuerpo.length, "el largo cuenta también la nota");
  const { carpeta, destino } = await probarConUnzip(cuerpo);
  assert.equal(await fs.readFile(path.join(destino, "esta.txt"), "utf8"), "está");
  assert.match(await fs.readFile(path.join(destino, "No se pudieron incluir.txt"), "utf8"), /Fotos\/perdida\.jpg/);
  await fs.rm(carpeta, { recursive: true, force: true });
});

test("zip: ⚠️ rutas que escribirían fuera de la carpeta al descomprimir («zip slip») no pasan", async () => {
  const k = await subir(Buffer.from("x"));
  for (const n of ["../fuera.txt", "a/../../fuera.txt", "/etc/passwd", "C:/Windows/x", "a\\b.txt", "a//b.txt", "./a.txt", "a/\u0000.txt", ""]) {
    assert.equal(rutaDelZipValida(n, false), false, JSON.stringify(n));
    const r = await pedirZip({ n: "x.zip", l: [{ k, n }] });
    assert.equal(r.status, 400, JSON.stringify(n));
  }
  assert.equal(rutaDelZipValida("Carpeta/Sub/", true), true);
  assert.equal(rutaDelZipValida("Carpeta/Sub", true), false, "una carpeta termina en /");
  assert.equal(rutaDelZipValida("Carpeta/", false), false, "un archivo no");
  // Repetida: al descomprimir una pisaría a la otra.
  assert.equal((await pedirZip({ n: "x.zip", l: [{ k, n: "a.txt" }, { k, n: "a.txt" }] })).status, 400);
});

test("zip: ⚠️ cada archivo con las mismas reglas de ruta que bajar uno solo, y todo de UNA agencia", async () => {
  for (const k of ["../../etc/passwd", `${agencia}/../x`, "hola.txt", `${agencia}/google`, `${agencia}/drive/${randomUUID()}`]) {
    assert.equal((await pedirZip({ n: "x.zip", l: [{ k, n: "a.txt" }] })).status, 400, k);
  }
  const otraAgencia = `${randomUUID()}/${randomUUID()}`;
  assert.equal((await pedirZip({ n: "x.zip", l: [{ k: clave(), n: "a" }, { k: otraAgencia, n: "b" }] })).status, 400);
});

test("zip: ⚠️ solo con permiso de zip, por POST y en /zip", async () => {
  const k = await subir(Buffer.from("x"));
  // Un permiso de bajar UN archivo no arma un .zip.
  const deGet = await fetch(`${base}/zip`, { method: "POST", body: new URLSearchParams({ t: permiso({ op: "get", k }) }) });
  assert.equal(deGet.status, 403);
  // Ni un permiso de zip sirve en /o.
  assert.notEqual((await fetch(`${base}/o?t=${permiso({ op: "zip", k, l: [{ k, n: "a" }] })}`)).status, 200);
  assert.equal((await pedirZip({ l: [{ k, n: "a" }] }, { metodo: "GET" })).status, 405);
  assert.equal((await pedirZip({ l: [{ k, n: "a" }] }, { venceEn: -5 })).status, 403, "vencido");
  const otraFirma = firmar("otro".repeat(10), { op: "zip", e: Math.floor(Date.now() / 1000) + 60, l: [{ k, n: "a" }] });
  assert.equal((await fetch(`${base}/zip`, { method: "POST", body: new URLSearchParams({ t: otraFirma }) })).status, 403);
  const sinFormulario = await fetch(`${base}/zip`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(sinFormulario.status, 415);
});

test("zip: el vector compartido con Maven, con acentos: Node verifica lo que firma Deno", () => {
  // Mismo vector que supabase/functions/drive/logica.test.ts (VECTOR_ZIP).
  const s = "vector-de-prueba-del-drive-0123456789abcdef";
  const p = "eyJvcCI6InppcCIsImUiOjQxMDI0NDQ4MDAsIm4iOiJBw7FvLTIwMjYuemlwIiwibCI6W3sibiI6IkNvbnRhYmlsaWRhZC8ifSx7ImsiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEvMjIyMjIyMjItMjIyMi0yMjIyLTIyMjItMjIyMjIyMjIyMjIyIiwibiI6IkNvbnRhYmlsaWRhZC9CYWxhbmNlIOKAlCBhw7FvLnBkZiJ9XX0.2A2QI0S31AhvUzhCDz1sM6aOdjqy62bWtC18bxnPXEw";
  const d = verificar(s, p);
  assert.equal(d.op, "zip");
  assert.equal(d.l[1].n, "Contabilidad/Balance — año.pdf");
  assert.equal(firmar(s, d), p);
});

test("zip: el permiso puede ser largo (miles de rutas), pero con tope; y hasta 5000 entradas", async () => {
  const k = await subir(Buffer.from("x"));
  const muchas = Array.from({ length: 300 }, (_, i) => ({ k, n: `Carpeta con un nombre largo de verdad/archivo número ${i}.txt` }));
  const t = permiso({ op: "zip", n: "x.zip", l: muchas });
  assert.ok(t.length > 4000, "más largo que un permiso normal");
  assert.equal(verificar(SECRETO, t), null, "un permiso normal sigue con su tope de 4000");
  const r = await fetch(`${base}/zip`, { method: "POST", body: new URLSearchParams({ t }) });
  assert.equal(r.status, 200);
  await r.arrayBuffer();
  assert.ok(verificar(SECRETO, t, Date.now(), MAX_PERMISO_ZIP));
  const demasiadas = Array.from({ length: MAX_ENTRADAS_ZIP + 1 }, (_, i) => ({ n: `c${i}/` }));
  assert.equal((await pedirZip({ n: "x.zip", l: demasiadas })).status, 413);
});

// ── Miniaturas (op "mini") ──────────────────────────────────────────────────
// sips y qlmanage se reemplazan por scripts falsos (configurables en conf): así
// las pruebas corren en cualquier lado y se puede contar cuántas veces se
// llamaron. Al final, una prueba con el sips y el Quick Look de verdad, solo
// en un Mac.

const herramientas = {};
let registro;
async function crearHerramientas() {
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), "nas-herramientas-"));
  registro = path.join(carpeta, "registro.txt");
  process.env.MINI_REGISTRO = registro;
  const script = async (nombre, cuerpo) => {
    const p = path.join(carpeta, nombre);
    await fs.writeFile(p, `#!/usr/bin/env node\nconst fs = require("node:fs"); const path = require("node:path");\nconst a = process.argv.slice(2);\n${cuerpo}\n`);
    await fs.chmod(p, 0o755);
    return p;
  };
  // Escribe un «JPEG» en --out y anota con qué lo llamaron.
  herramientas.sips = await script("sips", `
    const entrada = a[a.indexOf("--out") - 1];
    const lado = a.includes("-Z") ? a[a.indexOf("-Z") + 1] : "480";
    fs.appendFileSync(process.env.MINI_REGISTRO, "sips " + path.basename(entrada) + (lado === "480" ? "" : " " + lado) + "\\n");
    fs.writeFileSync(a[a.indexOf("--out") + 1], Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));`);
  // Como Quick Look: <carpeta -o>/<nombre del archivo>.png. Anota el nombre (con
  // extensión) y cuántos bytes ve: tiene que ver el archivo de verdad.
  herramientas.qlmanage = await script("qlmanage", `
    const entrada = a[a.length - 1];
    fs.appendFileSync(process.env.MINI_REGISTRO, "ql " + path.basename(entrada) + " " + fs.statSync(entrada).size + "\\n");
    fs.writeFileSync(path.join(a[a.indexOf("-o") + 1], path.basename(entrada) + ".png"), "png");`);
  herramientas.colgada = await script("colgada", "setTimeout(() => {}, 10000);");
  herramientas.falla = await script("falla", "process.exit(3);");
}
const llamadas = async () => (await fs.readFile(registro, "utf8").catch(() => "")).trim().split("\n").filter(Boolean);
const pedirMini = (datos, opciones) => fetch(url({ op: "mini", ...datos }), opciones);

test("mini: una imagen con sips; la segunda vez sale de la caché del disco, sin volver a hacerla", async () => {
  await crearHerramientas();
  Object.assign(conf, { sips: herramientas.sips, qlmanage: herramientas.qlmanage, tiempoMiniatura: 5000 });
  const k = await subir(Buffer.from("una foto"));
  const r = await pedirMini({ k, x: "jpg" });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/jpeg");
  assert.equal(r.headers.get("cache-control"), "private, max-age=86400");
  assert.deepEqual([...Buffer.from(await r.arrayBuffer()).subarray(0, 3)], [0xff, 0xd8, 0xff]);
  assert.deepEqual(await llamadas(), ["sips archivo.jpg"]);
  const otra = await pedirMini({ k, x: "jpg" });
  assert.equal(otra.status, 200);
  await otra.arrayBuffer();
  assert.deepEqual(await llamadas(), ["sips archivo.jpg"], "la segunda vez no se llama a sips");
  // La caché está al lado de los datos, en el disco del archivo.
  const enDisco = (await Promise.all(conf.raices.map((r) => fs.readdir(path.join(r, ".miniaturas")).catch(() => [])))).flat();
  assert.ok(enDisco.length > 0);
});

test("mini: un PDF o un video por Quick Look, con un enlace DURO que lleva la extensión (no una copia)", async () => {
  await fs.writeFile(registro, "");
  const contenido = Buffer.alloc(12345, 1);
  const k = await subir(contenido);
  const r = await pedirMini({ k, x: "pdf" });
  assert.equal(r.status, 200);
  await r.arrayBuffer();
  assert.deepEqual(await llamadas(), [`ql archivo.pdf ${contenido.length}`, "sips archivo.pdf.png"]);
  // No queda nada en la carpeta temporal (un enlace duro ahí retendría el archivo).
  for (const raiz of conf.raices) {
    const tmp = await fs.readdir(path.join(raiz, ".miniaturas", ".tmp")).catch(() => []);
    assert.deepEqual(tmp, []);
  }
});

test("mini: ⚠️ si la herramienta no está o falla, 404 sin tirar el servidor, y no se reintenta enseguida", async () => {
  await fs.writeFile(registro, "");
  const k = await subir(Buffer.from("x"));
  conf.sips = "/no/existe/sips";
  assert.equal((await pedirMini({ k, x: "png" })).status, 404);
  conf.sips = herramientas.falla;
  const k2 = await subir(Buffer.from("y"));
  assert.equal((await pedirMini({ k: k2, x: "png" })).status, 404);
  // Con la herramienta arreglada, la que falló sigue sin miniatura por un día.
  conf.sips = herramientas.sips;
  assert.equal((await pedirMini({ k, x: "png" })).status, 404);
  assert.deepEqual(await llamadas(), []);
  assert.equal((await fetch(`${base}/salud`)).status, 200, "el servidor sigue");
});

test("mini: ⚠️ una herramienta colgada se corta a tiempo", async () => {
  Object.assign(conf, { qlmanage: herramientas.colgada, tiempoMiniatura: 300 });
  const k = await subir(Buffer.from("video"));
  const inicio = Date.now();
  assert.equal((await pedirMini({ k, x: "mov" })).status, 404);
  assert.ok(Date.now() - inicio < 3000, `tardó ${Date.now() - inicio} ms`);
  Object.assign(conf, { qlmanage: herramientas.qlmanage, tiempoMiniatura: 5000 });
});

test("mini: ⚠️ la clave con las mismas reglas que un get (y los importados también); la extensión, sin trucos", async () => {
  for (const k of ["../../etc/passwd", `${agencia}/../x`, "hola.txt"]) {
    assert.equal((await pedirMini({ k, x: "jpg" })).status, 400, k);
  }
  const k = await subir(Buffer.from("x"));
  for (const x of ["../x", "jpg;rm", "JPG", "", "muylargaextension"]) {
    assert.equal((await pedirMini({ k, x })).status, 400, x);
  }
  // Un permiso de miniatura no sirve para subir ni para borrar.
  assert.equal((await pedirMini({ k, x: "jpg" }, { method: "DELETE" })).status, 405);
  // Un importado de Google sí tiene miniatura (se lee, nunca se escribe).
  const id = randomUUID();
  const destino = path.join(conf.raices[0], agencia, "google", id);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, "de google");
  const g = await pedirMini({ k: `${agencia}/google/${id}`, x: "heic" });
  assert.equal(g.status, 200);
  await g.arrayBuffer();
});

test("mini: borrar el archivo borra también su miniatura y su versión para mirar", async () => {
  const k = await subir(Buffer.from("para borrar"));
  await (await pedirMini({ k, x: "jpg" })).arrayBuffer();
  await (await pedirMini({ k, x: "heic", l: LADO_VISTA })).arrayBuffer();
  const raiz = (await Promise.all(conf.raices.map(async (r) => ((await fs.stat(path.join(r, k)).catch(() => null)) ? r : null)))).find(Boolean);
  const mini = rutaEnCache(raiz, k, "para borrar".length);
  const grande = rutaEnCache(raiz, k, "para borrar".length, LADO_VISTA);
  await fs.access(mini);
  await fs.access(grande);
  assert.equal((await fetch(url({ op: "borrar", k }), { method: "DELETE" })).status, 204);
  await assert.rejects(fs.access(mini));
  await assert.rejects(fs.access(grande));
});

test("mini: una HEIC para MIRAR (l=2048) se convierte aparte de su miniatura; otro lado, no", async () => {
  await fs.writeFile(registro, "");
  const k = await subir(Buffer.from("una foto del iPhone"));
  const chica = await pedirMini({ k, x: "heic" });
  assert.equal(chica.status, 200);
  await chica.arrayBuffer();
  const grande = await pedirMini({ k, x: "heic", l: LADO_VISTA });
  assert.equal(grande.status, 200);
  assert.equal(grande.headers.get("content-type"), "image/jpeg");
  await grande.arrayBuffer();
  // Dos conversiones distintas: la miniatura no sirve para mirar ni al revés.
  assert.deepEqual(await llamadas(), ["sips archivo.heic", "sips archivo.heic 2048"]);
  await (await pedirMini({ k, x: "heic", l: LADO_VISTA })).arrayBuffer();
  assert.deepEqual(await llamadas(), ["sips archivo.heic", "sips archivo.heic 2048"], "la segunda vez sale de la caché");
  // La miniatura de siempre conserva su nombre en la caché (no se rehacen todas).
  const raiz = (await Promise.all(conf.raices.map(async (r) => ((await fs.stat(path.join(r, k)).catch(() => null)) ? r : null)))).find(Boolean);
  await fs.access(rutaEnCache(raiz, k, "una foto del iPhone".length));
  // Solo esos dos lados: un permiso no puede pedir una conversión de 10.000 px.
  for (const l of [10000, 0, "x"]) assert.equal((await pedirMini({ k, x: "heic", l })).status, 400, `l=${l}`);
});

test("mini: de a 2 a la vez, en fila; lo que ya nadie quiere se saltea; con la fila llena, «ahora no»", async () => {
  const cola = crearCola(2, 3);
  let ahora = 0;
  let maximo = 0;
  const tarea = () => async () => {
    ahora++; maximo = Math.max(maximo, ahora);
    await new Promise((r) => setTimeout(r, 30));
    ahora--;
    return "hecha";
  };
  let corrioLaSalteada = false;
  const salteada = async () => { corrioLaSalteada = true; return "no"; };
  // 2 corren y 3 esperan (el tope de la fila); la 6.ª no entra.
  const corridas = [cola(tarea()), cola(tarea()), cola(tarea()), cola(salteada, () => false), cola(tarea())];
  await assert.rejects(cola(tarea()), /demasiadas/, "la fila (3) está llena");
  const resultados = await Promise.all(corridas);
  assert.equal(maximo, 2);
  assert.deepEqual(resultados, ["hecha", "hecha", "hecha", null, "hecha"]);
  assert.equal(corrioLaSalteada, false);
});

test("mini: el sips y el Quick Look DE VERDAD (solo en un Mac)", { skip: process.platform !== "darwin" }, async () => {
  Object.assign(conf, { sips: undefined, qlmanage: undefined, tiempoMiniatura: 15000 });
  // Un PNG de 600×300 hecho a mano (filas sin filtro, comprimidas con zlib).
  const ancho = 600, alto = 300;
  const filas = Buffer.alloc((ancho * 3 + 1) * alto);
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) filas[y * (ancho * 3 + 1) + 1 + x * 3] = (x * 255) / ancho;
  const bloque = (tipo, datos) => {
    const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
    const td = Buffer.concat([Buffer.from(tipo), datos]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32Js(td));
    return Buffer.concat([largo, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloque("IHDR", ihdr), bloque("IDAT", zlib.deflateSync(filas)), bloque("IEND", Buffer.alloc(0))]);
  const k = await subir(png);
  const r = await pedirMini({ k, x: "png" });
  assert.equal(r.status, 200);
  const jpg = Buffer.from(await r.arrayBuffer());
  assert.deepEqual([...jpg.subarray(0, 2)], [0xff, 0xd8], "un JPEG");
  // Y un PDF por Quick Look (sips sabe escribir PDF).
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), "nas-pdf-"));
  await fs.writeFile(path.join(carpeta, "a.png"), png);
  execFileSync("sips", ["-s", "format", "pdf", path.join(carpeta, "a.png"), "--out", path.join(carpeta, "a.pdf")], { stdio: "ignore" });
  const kPdf = await subir(await fs.readFile(path.join(carpeta, "a.pdf")));
  const p = await pedirMini({ k: kPdf, x: "pdf" });
  assert.equal(p.status, 200);
  assert.deepEqual([...Buffer.from(await p.arrayBuffer()).subarray(0, 2)], [0xff, 0xd8]);
  await fs.rm(carpeta, { recursive: true, force: true });
});
