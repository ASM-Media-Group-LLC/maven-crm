// node --test infra/nas-drive/tipos.test.mjs
// El tipo real de los archivos sin extensión (Jhon, 06/10). Ver tipos.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { corregirTipos, mimePorFirma, tipoPorFirma, ubicarEn } from "./tipos.mjs";

const bytes = (...partes) => Buffer.from(partes.flatMap((p) => (typeof p === "string" ? [...Buffer.from(p, "latin1")] : p)));
const caja = (marca) => bytes([0, 0, 0, 24], "ftyp", marca, [0, 0, 0, 0]);

test("las firmas: mp4, mov, heic, m4a, jpg, png, pdf, webm, mp3; un zip no", () => {
  assert.equal(tipoPorFirma(caja("mp41")), "video/mp4");
  assert.equal(tipoPorFirma(caja("isom")), "video/mp4");
  assert.equal(tipoPorFirma(caja("qt  ")), "video/quicktime");
  assert.equal(tipoPorFirma(caja("heic")), "image/heic");
  assert.equal(tipoPorFirma(caja("M4A ")), "audio/mp4");
  assert.equal(tipoPorFirma(bytes([0xff, 0xd8, 0xff, 0xe1])), "image/jpeg");
  assert.equal(tipoPorFirma(bytes([0x89], "PNG", [13, 10])), "image/png");
  assert.equal(tipoPorFirma(bytes("%PDF-1.4")), "application/pdf");
  assert.equal(tipoPorFirma(bytes([0x1a, 0x45, 0xdf, 0xa3])), "video/webm");
  assert.equal(tipoPorFirma(bytes("ID3", [3, 0])), "audio/mpeg");
  assert.equal(tipoPorFirma(bytes("PK", [3, 4])), null);
  assert.equal(tipoPorFirma(bytes("ab")), null);
});

test("lee la firma del disco y ubica el archivo en cualquiera de los dos discos", async () => {
  const d1 = await fs.mkdtemp(path.join(os.tmpdir(), "nas1-")), d2 = await fs.mkdtemp(path.join(os.tmpdir(), "nas2-"));
  await fs.mkdir(path.join(d2, "t", "google"), { recursive: true });
  await fs.writeFile(path.join(d2, "t", "google", "a"), Buffer.concat([caja("mp42"), Buffer.alloc(1000)]));
  const abs = await ubicarEn([d1, d2], "t/google/a");
  assert.equal(abs, path.join(d2, "t", "google", "a"));
  assert.equal(await mimePorFirma(abs), "video/mp4");
  assert.equal(await ubicarEn([d1, d2], "t/google/no-esta"), null);
  assert.equal(await mimePorFirma(path.join(d1, "no-esta")), null);
});

test("recorre las páginas, manda solo lo reconocido y en --prueba no manda nada", async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), "nas-"));
  const escribir = async (k, b) => { await fs.mkdir(path.dirname(path.join(raiz, k)), { recursive: true }); await fs.writeFile(path.join(raiz, k), b); };
  await escribir("t/google/1", caja("mp41"));
  await escribir("t/google/2", bytes("%PDF-1.7"));
  await escribir("t/google/3", bytes("PK", [3, 4, 0, 0]));
  const paginas = [
    { items: [{ id: "1", storage_key: "t/google/1" }, { id: "2", storage_key: "t/google/2" }], siguiente: "2" },
    { items: [{ id: "3", storage_key: "t/google/3" }, { id: "4", storage_key: "t/google/4" }], siguiente: null },
  ];
  const mandados = [];
  const fetchFn = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.ok(body.permiso, "va firmado");
    if (body.action === "tipos_pendientes") {
      const p = body.desde === null ? paginas[0] : paginas[1];
      return { ok: true, status: 200, json: async () => p };
    }
    mandados.push(...body.tipos);
    return { ok: true, status: 200, json: async () => ({ ok: true, corregidos: body.tipos.length }) };
  };
  const secreto = "x".repeat(40);
  const stats = await corregirTipos({ funciones: "https://f", secreto, raices: [raiz], fetchFn });
  assert.deepEqual(mandados, [{ id: "1", mime: "video/mp4" }, { id: "2", mime: "application/pdf" }]);
  assert.equal(stats.revisados, 4);
  assert.equal(stats.corregidos, 2);
  assert.equal(stats.sinFirma, 1);
  assert.equal(stats.noEsta, 1);

  mandados.length = 0;
  const prueba = await corregirTipos({ funciones: "https://f", secreto, raices: [raiz], fetchFn, prueba: true });
  assert.equal(mandados.length, 0, "en --prueba no se manda nada");
  assert.equal(prueba.revisados, 4);
  assert.deepEqual(prueba.porTipo, { "video/mp4": 1, "application/pdf": 1 });
});
