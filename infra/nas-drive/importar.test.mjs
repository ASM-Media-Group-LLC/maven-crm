// node --test infra/nas-drive/importar.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { verificar } from "./firma.mjs";
import {
  enlazar, idArchivo, idCarpeta, idCarpetaRaiz, importarCarpeta, mandar, mimeDe, nombreParaMaven, recorrer, uuidV5,
} from "./importar.mjs";

const SECRETO = "s".repeat(40);
const T = "10000000-0000-4000-8000-000000000001";
const GRUPO = "20000000-0000-4000-8000-000000000001";
const ANA = "a0000000-0000-4000-8000-000000000001";

async function discosDePrueba() {
  const raiz = await fsp.mkdtemp(path.join(os.tmpdir(), "importar-"));
  const d1 = path.join(raiz, "NAS1"), d2 = path.join(raiz, "NAS2");
  const escribir = async (disco, rel, contenido, mtime) => {
    const abs = path.join(disco, rel);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, contenido);
    if (mtime) await fsp.utimes(abs, mtime, mtime);
  };
  // Una unidad repartida en los dos discos, como la deja rclone union.
  await escribir(d1, "Shootings/2024/Nikón Cámara/DSC_0001.JPG".normalize("NFD"), "uno", new Date("2024-03-01T10:00:00Z"));
  await escribir(d2, "Shootings/2024/Nikón Cámara/DSC_0002.JPG".normalize("NFD"), "dos");
  await escribir(d2, "Shootings/Reunión (2025-02-20 21：05 GMT).mp4", "video");
  await escribir(d1, "Shootings/.DS_Store", "basura");
  await escribir(d1, "Shootings/a medio bajar.mov.partial", "x");
  // La misma ruta en los dos discos: gana la más nueva.
  await escribir(d1, "Shootings/doble.txt", "viejo", new Date("2020-01-01T00:00:00Z"));
  await escribir(d2, "Shootings/doble.txt", "nuevo", new Date("2025-01-01T00:00:00Z"));
  await fsp.mkdir(path.join(d1, "Shootings/vacía"), { recursive: true });
  return { raiz, d1, d2 };
}

function mavenFalsa({ falla } = {}) {
  const lotes = [];
  const fetchFn = async (url, init) => {
    const body = JSON.parse(init.body);
    if (falla) { const f = falla(lotes.length, body); if (f) return { ok: false, status: f, json: async () => ({ error: "falla de prueba" }) }; }
    lotes.push({ url, ...body, permisoLeido: verificar(SECRETO, body.permiso) });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  return { lotes, fetchFn };
}

test("ids estables: la misma ruta da el mismo id; otra unidad u otra ruta, otro", () => {
  assert.equal(idArchivo("u:1", "a/b.jpg"), idArchivo("u:1", "a/b.jpg"));
  assert.notEqual(idArchivo("u:1", "a/b.jpg"), idArchivo("u:2", "a/b.jpg"));
  assert.notEqual(idArchivo("u:1", "a/b.jpg"), idCarpeta("u:1", "a/b.jpg"));
  assert.equal(idCarpeta("u:1", ""), idCarpetaRaiz("u:1"));
  assert.match(uuidV5("x"), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("nombres: tildes del Mac (NFD) a NFC, «：» de rclone a «:», sin barras ni control, ≤ 255", () => {
  assert.equal(nombreParaMaven("Nikón Cámara"), "Nikón Cámara");
  assert.equal(nombreParaMaven("Reunión (21：05 GMT).mp4"), "Reunión (21:05 GMT).mp4");
  assert.equal(nombreParaMaven("a\\b"), "a＼b");
  assert.equal(nombreParaMaven("x\u0007y"), "x�y");
  const largo = nombreParaMaven("x".repeat(300) + ".pdf");
  assert.ok(largo.length <= 255 && largo.endsWith(".pdf"));
  assert.equal(mimeDe("FOTO.JPG"), "image/jpeg");
  assert.equal(mimeDe("pagina.html"), "application/octet-stream", "html nunca con su tipo: correría un script desde el NAS");
});

test("recorrer: une los dos discos, ignora basura del sistema y en una ruta doble gana la más nueva", async () => {
  const { d1, d2 } = await discosDePrueba();
  const a = await recorrer([d1, d2], "Shootings");
  const rels = [...a.archivos.keys()].map((r) => r.normalize("NFC")).sort();
  assert.deepEqual(rels, ["2024/Nikón Cámara/DSC_0001.JPG", "2024/Nikón Cámara/DSC_0002.JPG", "Reunión (2025-02-20 21：05 GMT).mp4", "doble.txt"]);
  assert.equal(a.archivos.get("doble.txt").disco, d2, "la más nueva");
  assert.deepEqual(a.dobles, ["doble.txt"]);
  assert.ok(a.carpetas.includes("vacía") && a.carpetas.includes("2024"));
  const nada = await recorrer([d1, d2], "No existe");
  assert.equal(nada.archivos.size, 0);
});

test("importar una carpeta: enlaces en el MISMO disco, fichas sin barras con la ruta de la agencia, y relanzar no duplica", async () => {
  const { d1, d2 } = await discosDePrueba();
  const conf = { tenant: T, discos: [d1, d2], raizDrive: "maven-drive", funciones: "https://x/functions/v1", secreto: SECRETO };
  const m = mavenFalsa();
  const carpeta = { clave: "unidad:ABC", nombre: "Shootings", origen: "Shootings", compartir: [{ user_id: ANA, rol: "editor" }] };
  const s = await importarCarpeta({ carpeta, grupoId: GRUPO, conf, fetchFn: m.fetchFn });
  assert.equal(s.archivos, 4);
  assert.equal(s.enlacesNuevos, 4);

  // Los permisos: firmados, op importar, con la agencia.
  assert.ok(m.lotes.every((l) => l.permisoLeido?.op === "importar" && l.permisoLeido.t === T));
  // 1º la raíz y su compartido; 2º las carpetas (madre antes que hija); 3º los archivos.
  assert.equal(m.lotes[0].items[0].id, idCarpetaRaiz("unidad:ABC"));
  assert.equal(m.lotes[0].items[0].parent_id, GRUPO);
  assert.deepEqual(m.lotes[0].compartidos, [{ item_id: idCarpetaRaiz("unidad:ABC"), user_id: ANA, rol: "editor" }]);
  const carpetas = m.lotes[1].items;
  const pos = new Map(carpetas.map((c, i) => [c.id, i]));
  for (const c of carpetas) if (pos.has(c.parent_id)) assert.ok(pos.get(c.parent_id) < pos.get(c.id), "la madre va antes");
  const archivos = m.lotes.slice(2).flatMap((l) => l.items);
  assert.equal(archivos.length, 4);
  const video = archivos.find((a) => a.nombre.startsWith("Reunión"));
  assert.equal(video.nombre, "Reunión (2025-02-20 21:05 GMT).mp4");
  assert.equal(video.storage_key, `${T}/google/${video.id}`);
  const foto = archivos.find((a) => a.nombre === "DSC_0001.JPG");
  assert.equal(foto.created_at, "2024-03-01T10:00:00.000Z", "la fecha de Google");
  assert.equal(foto.parent_id, idCarpeta("unidad:ABC", "2024/Nikón Cámara".normalize("NFD")));

  // El enlace está en el disco del archivo y es el MISMO archivo (mismo inodo).
  for (const a of archivos) {
    const enDisco1 = await fsp.stat(path.join(d1, "maven-drive", T, "google", a.id)).catch(() => null);
    const enDisco2 = await fsp.stat(path.join(d2, "maven-drive", T, "google", a.id)).catch(() => null);
    assert.ok(!!enDisco1 !== !!enDisco2, `${a.nombre}: en un solo disco`);
  }
  const doble = archivos.find((a) => a.nombre === "doble.txt");
  assert.equal(await fsp.readFile(path.join(d2, "maven-drive", T, "google", doble.id), "utf8"), "nuevo");

  // Relanzar: mismos ids, ningún enlace nuevo.
  const m2 = mavenFalsa();
  const s2 = await importarCarpeta({ carpeta, grupoId: GRUPO, conf, fetchFn: m2.fetchFn });
  assert.equal(s2.enlacesNuevos, 0);
  assert.equal(s2.enlacesYa, 4);
  assert.deepEqual(m2.lotes.flatMap((l) => l.items).map((i) => i.id).sort(), m.lotes.flatMap((l) => l.items).map((i) => i.id).sort());
});

test("un archivo que rclone reemplazó: el enlace se renueva y apunta al nuevo", async () => {
  const { d1 } = await discosDePrueba();
  const abs = path.join(d1, "Shootings/doble.txt");
  const st = await fsp.stat(abs);
  const arch = { disco: d1, abs, ino: st.ino, dev: st.dev };
  assert.equal(await enlazar(arch, "maven-drive", T, "id-1"), "nuevo");
  assert.equal(await enlazar(arch, "maven-drive", T, "id-1"), "ya");
  await fsp.rm(abs);
  await fsp.writeFile(abs, "reemplazado");
  const st2 = await fsp.stat(abs);
  assert.equal(await enlazar({ ...arch, ino: st2.ino, dev: st2.dev }, "maven-drive", T, "id-1"), "renovado");
  assert.equal(await fsp.readFile(path.join(d1, "maven-drive", T, "google", "id-1"), "utf8"), "reemplazado");
});

test("--prueba cuenta y no toca nada", async () => {
  const { d1, d2 } = await discosDePrueba();
  const m = mavenFalsa();
  const s = await importarCarpeta({
    carpeta: { clave: "u:1", nombre: "S", origen: "Shootings" }, grupoId: GRUPO, prueba: true, fetchFn: m.fetchFn,
    conf: { tenant: T, discos: [d1, d2], raizDrive: "maven-drive", funciones: "https://x", secreto: SECRETO },
  });
  assert.equal(s.archivos, 4);
  assert.equal(m.lotes.length, 0);
  assert.equal(await fsp.stat(path.join(d1, "maven-drive")).catch(() => null), null);
});

test("mandar: reintenta ante un 5xx y corta ante un 4xx (el lote está mal)", async () => {
  let llamadas = 0;
  const m = mavenFalsa({ falla: () => (llamadas++ === 0 ? 503 : 0) });
  const sinEsperar = async () => {};
  await mandar({ funciones: "https://x", secreto: SECRETO, tenant: T, items: [{ id: "x" }], fetchFn: m.fetchFn, espera: sinEsperar });
  assert.equal(llamadas, 2, "un 503 y después anduvo");
  assert.equal(m.lotes.length, 1);
  let malas = 0;
  const mala = mavenFalsa({ falla: () => { malas++; return 400; } });
  await assert.rejects(() => mandar({ funciones: "https://x", secreto: SECRETO, tenant: T, items: [{}], fetchFn: mala.fetchFn, espera: sinEsperar }), /400/);
  assert.equal(malas, 1, "un 400 no se reintenta");
  let caidas = 0;
  const caida = mavenFalsa({ falla: () => { caidas++; return 502; } });
  await assert.rejects(() => mandar({ funciones: "https://x", secreto: SECRETO, tenant: T, items: [{}], fetchFn: caida.fetchFn, espera: sinEsperar }), /502/);
  assert.equal(caidas, 4, "un 5xx se reintenta hasta 4 veces y después avisa");
});

test("una carpeta vacía (también en Google) no se crea", async () => {
  const { d1, d2 } = await discosDePrueba();
  const m = mavenFalsa();
  const s = await importarCarpeta({
    carpeta: { clave: "u:vacia", nombre: "HR", origen: "No existe en el NAS" }, grupoId: GRUPO, fetchFn: m.fetchFn,
    conf: { tenant: T, discos: [d1, d2], raizDrive: "maven-drive", funciones: "https://x", secreto: SECRETO },
  });
  assert.equal(s.vacia, true);
  assert.equal(m.lotes.length, 0, "no manda ni la carpeta raíz");
});
