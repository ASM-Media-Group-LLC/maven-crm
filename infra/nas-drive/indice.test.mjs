// Correr: node --test infra/nas-drive/indice.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { aCsv, escribirIndice, pedirIndice } from "./indice.mjs";
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

test("pide el índice con un permiso firmado op=indice que vence en minutos", async () => {
  const secreto = "s".repeat(40);
  let pedido;
  const fetchFn = async (url, init) => { pedido = { url, body: JSON.parse(init.body) }; return new Response(JSON.stringify({ generado: "g", filas: [] })); };
  await pedirIndice({ funciones: "https://x/functions/v1", secreto, fetchFn });
  assert.equal(pedido.url, "https://x/functions/v1/drive");
  const p = verificar(secreto, pedido.body.permiso);
  assert.equal(p.op, "indice");
  assert.ok(p.e * 1000 - Date.now() <= 300_000);
  await assert.rejects(pedirIndice({ funciones: "https://x", secreto, fetchFn: async () => new Response('{"error":"no"}', { status: 403 }) }), /403/);
});
