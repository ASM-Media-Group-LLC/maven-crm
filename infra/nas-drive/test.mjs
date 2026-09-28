// Correr: node --test infra/nas-drive/test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { crearServidor, MAX_POR_PEDIDO } from "./server.mjs";
import { firmar, verificar } from "./firma.mjs";

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
