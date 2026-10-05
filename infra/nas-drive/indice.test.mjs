// Correr: node --test infra/nas-drive/indice.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { aCsv, armarFilas, escribirIndice, partesCsv, partesJson, pedirIndice } from "./indice.mjs";
import { verificar } from "./firma.mjs";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const fila = (agencia_id, ruta, extra = {}) => ({ agencia_id, agencia: "X", ruta, tipo: "archivo", nombre: ruta.split("/").pop(), archivo_en_disco: `${agencia_id}/abc`, ...extra });

test("CSV: abre con acentos en Excel (BOM) y escapa comas, comillas y saltos", () => {
  const csv = aCsv([fila(A, 'Contabilidad/Informe "final", v2.pdf', { dueno: "Keila Suárez" })]);
  assert.ok(csv.startsWith("﻿"), "BOM");
  assert.match(csv, /"Contabilidad\/Informe ""final"", v2\.pdf"/);
  assert.match(csv, /Keila Suárez/);
});

test("escribe por agencia en los DOS discos: del día y «actual»", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "indice-"));
  const raices = [path.join(dir, "NAS1"), path.join(dir, "NAS2")];
  const r = await escribirIndice({ raices, filas: [fila(A, "a.pdf"), fila(B, "b.pdf")], generado: "g", fecha: "2026-09-28" });
  assert.deepEqual([r.agencias, r.filas, r.discos.length, r.errores.length], [2, 2, 2, 0]);
  for (const raiz of raices) {
    const nombres = (await fs.readdir(path.join(raiz, A, "_indice"))).sort();
    assert.deepEqual(nombres, ["2026-09-28.csv", "2026-09-28.json", "actual.csv", "actual.json"]);
    // ⚠️ Cada agencia ve SOLO lo suyo.
    const j = JSON.parse(await fs.readFile(path.join(raiz, A, "_indice", "actual.json"), "utf8"));
    assert.deepEqual(j.filas.map((f) => f.ruta), ["a.pdf"]);
  }
  await fs.rm(dir, { recursive: true, force: true });
});

test("guarda los últimos 30 días y nunca borra «actual»", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "indice-"));
  for (let d = 1; d <= 3; d++) {
    await escribirIndice({ raices: [dir], filas: [fila(A, "a.pdf")], generado: "g", fecha: `2026-09-0${d}`, conservar: 2 });
  }
  const nombres = (await fs.readdir(path.join(dir, A, "_indice"))).sort();
  assert.deepEqual(nombres, ["2026-09-02.csv", "2026-09-02.json", "2026-09-03.csv", "2026-09-03.json", "actual.csv", "actual.json"]);
  await fs.rm(dir, { recursive: true, force: true });
});

test("⚠️ un disco que falla no frena al otro", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "indice-"));
  await fs.writeFile(path.join(dir, "no-es-carpeta"), "x");
  const r = await escribirIndice({ raices: [path.join(dir, "no-es-carpeta"), path.join(dir, "NAS2")], filas: [fila(A, "a.pdf")], generado: "g", fecha: "2026-09-28" });
  assert.equal(r.discos.length, 1);
  assert.equal(r.errores.length, 1);
  await fs.rm(dir, { recursive: true, force: true });
});

test("⚠️ una agencia con id raro no se convierte en ruta", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "indice-"));
  await escribirIndice({ raices: [dir], filas: [fila("../../etc", "x")], generado: "g", fecha: "2026-09-28" });
  assert.deepEqual(await fs.readdir(dir), []);
  await fs.rm(dir, { recursive: true, force: true });
});

const item = (id, parent_id, nombre, extra = {}) => ({
  id, tenant_id: A, owner_id: null, parent_id, tipo: parent_id === undefined ? "carpeta" : "archivo", nombre, size: 1, sha256: null,
  storage_key: `${A}/${id}`, estado: "listo", trashed_at: null, created_at: "c", updated_at: "m", last_opened_at: null, ...extra,
});

test("pide el índice de a páginas, con un permiso firmado op=indice que vence en minutos, y arma las rutas acá", async () => {
  const secreto = "s".repeat(40);
  const pedidos = [];
  const paginas = [
    { generado: "g", items: [item("a", null, "Contabilidad", { tipo: "carpeta", storage_key: null }), item("b", "a", "2026", { tipo: "carpeta", storage_key: null })], siguiente: "b", agencias: { [A]: "KASH" }, duenos: {} },
    { generado: "g2", items: [item("c", "b", "Balance.pdf", { owner_id: "u1" }), item("d", "zz", "huérfano.pdf")], siguiente: null, agencias: {}, duenos: { u1: { nombre: "Keila", correo: "k@x" } } },
  ];
  const fetchFn = async (url, init) => { pedidos.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify(paginas[pedidos.length - 1])); };
  const { generado, filas } = await pedirIndice({ funciones: "https://x/functions/v1", secreto, fetchFn });
  assert.equal(pedidos[0].url, "https://x/functions/v1/drive");
  assert.deepEqual(pedidos.map((p) => [p.body.paginado, p.body.desde]), [[true, null], [true, "b"]]);
  const p = verificar(secreto, pedidos[1].body.permiso);
  assert.equal(p.op, "indice");
  assert.ok(p.e * 1000 - Date.now() <= 300_000);
  assert.equal(generado, "g");
  const balance = filas.find((f) => f.nombre === "Balance.pdf");
  assert.equal(balance.ruta, "Contabilidad/2026/Balance.pdf", "la ruta cruza páginas");
  assert.equal(balance.agencia, "KASH");
  assert.equal(balance.dueno, "Keila");
  assert.equal(filas.find((f) => f.nombre === "huérfano.pdf").ruta, "(sin carpeta)/huérfano.pdf");
  await assert.rejects(pedirIndice({ funciones: "https://x", secreto, fetchFn: async () => new Response('{"error":"no"}', { status: 403 }) }), /403/);
  // Un cursor que no avanza: corta en vez de pedir para siempre.
  const atascado = async (_u, init) => new Response(JSON.stringify({ items: [], siguiente: JSON.parse(init.body).desde ?? "x" }));
  await assert.rejects(pedirIndice({ funciones: "https://x", secreto, fetchFn: atascado }), /misma página/);
});

test("armarFilas: un ciclo no cuelga el armado", () => {
  const filas = armarFilas([item("a", "b", "A", { tipo: "carpeta" }), item("b", "a", "B", { tipo: "carpeta" })], {}, {});
  assert.equal(filas.length, 2);
});

test("⚠️ una agencia que se quedó sin archivos recibe su índice VACÍO (no el de ayer)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "indice-"));
  await escribirIndice({ raices: [dir], filas: [fila(A, "viejo.pdf")], generado: "g", fecha: "2026-09-27" });
  await escribirIndice({ raices: [dir], filas: [], generado: "g", fecha: "2026-09-28" });
  const j = JSON.parse(await fs.readFile(path.join(dir, A, "_indice", "actual.json"), "utf8"));
  assert.deepEqual(j.filas, []);
  await fs.rm(dir, { recursive: true, force: true });
});

// 03/10: con 890.000 filas, armar el CSV o el JSON como UN texto pasó el tope
// de largo de un string de Node («Invalid string length») y esa noche no hubo
// índice. Se escribe por partes: nunca hay un texto con todo.
test("⚠️ por partes: muchas filas no arman un texto gigante y el archivo queda igual de legible", async () => {
  const muchas = Array.from({ length: 25_000 }, (_, n) => fila(A, `Carpeta ${n % 7}/archivo, «${n}».pdf`, { tamano: n }));
  const partes = [...partesCsv(muchas)];
  assert.ok(partes.length > 10, `${partes.length} partes`);
  assert.ok(Math.max(...partes.map((p) => p.length)) < 1_000_000, "ninguna parte con todo");
  assert.ok([...partesJson({ generado: "g", agencia_id: A, filas: muchas })].length > 10);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "indice-"));
  const r = await escribirIndice({ raices: [dir], filas: muchas, generado: "g", fecha: "2026-10-03" });
  assert.deepEqual([r.filas, r.discos.length, r.errores.length], [25_000, 1, 0]);
  for (const nombre of ["2026-10-03.json", "actual.json"]) {
    const j = JSON.parse(await fs.readFile(path.join(dir, A, "_indice", nombre), "utf8"));
    assert.equal(j.generado, "g");
    assert.equal(j.agencia_id, A);
    assert.equal(j.filas.length, 25_000);
    assert.deepEqual(j.filas[24_999], muchas[24_999]);
  }
  const csv = await fs.readFile(path.join(dir, A, "_indice", "actual.csv"), "utf8");
  assert.ok(csv.startsWith("\uFEFF"), "BOM");
  assert.equal(csv.split("\r\n").length, 25_000 + 2, "encabezado + filas + final");
  assert.equal(csv, aCsv(muchas), "igual que armado de una vez");
  // Sin temporales sueltos.
  assert.deepEqual((await fs.readdir(path.join(dir, A, "_indice"))).filter((n) => n.includes(".tmp-")), []);
  await fs.rm(dir, { recursive: true, force: true });
});

test("JSON por partes: vacío y con una fila también es JSON válido", () => {
  for (const filas of [[], [fila(A, "a.pdf")], [fila(A, "a.pdf"), fila(A, "b.pdf")]]) {
    const j = JSON.parse([...partesJson({ generado: "2026-10-03T07:15:00Z", agencia_id: A, filas })].join(""));
    assert.deepEqual(j, { generado: "2026-10-03T07:15:00Z", agencia_id: A, filas });
  }
});
