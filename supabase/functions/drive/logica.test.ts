// Correr: deno test --no-check supabase/functions/drive/logica.test.ts
import { claveImportada, madresQueFaltanEnElLote, MAX_ARCHIVO, nombreValido, planDeSubida, TAMANO_PARTE, TOPE_LOTE, validarLote } from "./logica.ts";

function assert(c: boolean, m: string) { if (!c) throw new Error(m); }
const tira = (f: () => unknown) => { try { f(); return false; } catch { return true; } };

Deno.test("la parte entra en la ventana del proxy y en el tope del NAS (95 MB)", () => {
  assert(TAMANO_PARTE <= 32 * 1024 * 1024, "más de 32 MB no entra en ~60 s con una subida lenta");
  assert(TAMANO_PARTE < 95 * 1024 * 1024, "el NAS rechaza pedidos de más de 95 MB");
});

Deno.test("hasta una parte va entero; más, por partes redondeando para arriba", () => {
  assert(planDeSubida(1).partes === 0, "1 byte");
  assert(planDeSubida(TAMANO_PARTE).partes === 0, "justo una parte");
  assert(planDeSubida(TAMANO_PARTE + 1).partes === 2, "una más");
  assert(planDeSubida(MAX_ARCHIVO).partes === Math.ceil(MAX_ARCHIVO / TAMANO_PARTE), "el tope");
});

Deno.test("vacío, negativo o más de 20 GB: no", () => {
  assert(tira(() => planDeSubida(0)), "vacío");
  assert(tira(() => planDeSubida(-5)), "negativo");
  assert(tira(() => planDeSubida(NaN)), "NaN");
  assert(tira(() => planDeSubida(MAX_ARCHIVO + 1)), "más del tope");
});

Deno.test("⚠️ nombres: sin barras (serían carpetas), sin control, con largo razonable", () => {
  assert(nombreValido("  Balance 2026.pdf ") === "Balance 2026.pdf", "recorta");
  for (const malo of ["", "   ", "a/b.pdf", "a\\\\b", "x\\u0000y", "x".repeat(256), 5]) {
    assert(tira(() => nombreValido(malo)), `dejó pasar ${JSON.stringify(malo)}`);
  }
});

import { armarIndice, type ItemParaIndice } from "./logica.ts";

const item = (id: string, nombre: string, extra: Partial<ItemParaIndice> = {}): ItemParaIndice => ({
  id, tenant_id: "ag1", owner_id: "u1", parent_id: null, tipo: "archivo", nombre, size: 10, sha256: "a".repeat(64),
  storage_key: `ag1/${id}`, estado: "listo", trashed_at: null, created_at: "c", updated_at: "m", last_opened_at: null, ...extra,
});

Deno.test("el índice arma la ruta legible con las carpetas", () => {
  const filas = armarIndice([
    item("c1", "Contabilidad", { tipo: "carpeta", storage_key: null, size: null }),
    item("c2", "2026", { tipo: "carpeta", parent_id: "c1", storage_key: null, size: null }),
    item("a1", "Balance.pdf", { parent_id: "c2" }),
  ], new Map([["ag1", "ASM"]]), new Map([["u1", "Keila Suarez"]]), new Map([["u1", "keila@x.com"]]));
  const balance = filas.find((f) => f.nombre === "Balance.pdf")!;
  assert(balance.ruta === "Contabilidad/2026/Balance.pdf", balance.ruta);
  assert(balance.archivo_en_disco === "ag1/a1", "la llave al disco");
  assert(balance.agencia === "ASM" && balance.dueno === "Keila Suarez" && balance.correo_dueno === "keila@x.com", "datos del dueño");
  assert(filas.map((f) => f.ruta).join("|") === "Contabilidad|Contabilidad/2026|Contabilidad/2026/Balance.pdf", "orden por ruta");
});

Deno.test("una madre que falta no corta la ruta en silencio, y un ciclo no cuelga", () => {
  const huerfano = armarIndice([item("a1", "x.pdf", { parent_id: "no-existe" })], new Map(), new Map(), new Map());
  assert(huerfano[0].ruta === "(sin carpeta)/x.pdf", huerfano[0].ruta);
  const ciclo = armarIndice([item("a", "A", { parent_id: "b" }), item("b", "B", { parent_id: "a" })], new Map(), new Map(), new Map());
  assert(ciclo.length === 2, "terminó");
});

Deno.test("lo de la papelera y lo que se está subiendo también entra (marcado)", () => {
  const f = armarIndice([item("a", "viejo.pdf", { trashed_at: "t" }), item("b", "a medias.zip", { estado: "subiendo" })], new Map(), new Map(), new Map());
  assert(f.find((x) => x.nombre === "viejo.pdf")!.en_papelera === true, "papelera");
  assert(f.find((x) => x.nombre === "a medias.zip")!.estado === "subiendo", "subiendo");
});

import { chequearCupo, hayLugarEnElNas } from "./logica.ts";

Deno.test("cupo: entra justo; un byte más, no — y el mensaje dice cuánto", () => {
  const G = 1024 ** 3;
  chequearCupo(49 * G, 50 * G, G);
  let msg = "";
  try { chequearCupo(49 * G, 50 * G, G + 1); } catch (e) { msg = (e as Error).message; }
  assert(/No te alcanza el espacio: usas 49 GB de 50 GB/.test(msg), msg);
});

Deno.test("lugar en el NAS: 5% libre después de guardar, y el doble si va por partes", () => {
  const disco = [{ ok: true, libre: 100, total: 1000 }];
  assert(hayLugarEnElNas(disco, 50, false), "50 entra dejando 50 (5%)");
  assert(!hayLugarEnElNas(disco, 51, false), "51 deja menos del 5%");
  assert(!hayLugarEnElNas(disco, 30, true), "por partes necesita 60, deja 40 < 50");
  assert(!hayLugarEnElNas([{ ok: false }], 1, false), "un disco caído no cuenta");
  assert(hayLugarEnElNas([{ ok: true, libre: 10, total: 1000 }, disco[0]], 50, false), "alcanza con uno");
});

// ── Importar el archivo de Google ───────────────────────────────────────────
const T = "10000000-0000-4000-8000-000000000001";
const OTRA = "10000000-0000-4000-8000-000000000002";
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const carpeta = (id: string, parent: string | null = null) => ({ id, parent_id: parent, tipo: "carpeta", nombre: "Shootings" });
const archivo = (id: string, parent: string | null, extra: Record<string, unknown> = {}) =>
  ({ id, parent_id: parent, tipo: "archivo", nombre: "foto.jpg", mime: "image/jpeg", size: 1234, storage_key: claveImportada(T, id), created_at: "2025-02-20T21:05:00Z", ...extra });

Deno.test("importar: un lote sano entra sin dueño, listo, con la ruta de la agencia y la fecha de Google", () => {
  const { filas, shares } = validarLote(T, [carpeta(u(1)), archivo(u(2), u(1))], [{ item_id: u(1), user_id: u(9), rol: "editor" }]);
  assert(filas.length === 2 && shares.length === 1, "cuenta");
  const f = filas[1];
  assert(f.owner_id === null && f.estado === "listo" && f.tenant_id === T, "sin dueño, listo, de la agencia");
  assert(f.storage_key === `${T}/google/${u(2)}`, "la ruta del NAS lleva la agencia y google/");
  assert(f.created_at === "2025-02-20T21:05:00.000Z", "conserva la fecha");
  assert(f.updated_at === "2025-02-20T21:05:00.000Z", "y la muestra como última modificación");
  assert(filas[0].storage_key === null && filas[0].size === null && filas[0].mime === null, "la carpeta no tiene archivo");
});

Deno.test("⚠️ importar: un lote no puede apuntar una ficha a un archivo ajeno", () => {
  for (const clave of [`${OTRA}/google/${u(2)}`, `${T}/${u(2)}`, `${T}/google/${u(3)}`, `${T}/google/${u(2)}/../x`, null]) {
    assert(tira(() => validarLote(T, [archivo(u(2), null, { storage_key: clave })], [])), `dejó pasar ${clave}`);
  }
});

Deno.test("importar: filas malas rechazan el lote entero", () => {
  const malos: unknown[] = [
    { ...archivo(u(2), null), id: "no-uuid" },
    { ...archivo(u(2), null), parent_id: u(2) },
    { ...archivo(u(2), null), tipo: "otro" },
    { ...archivo(u(2), null), nombre: "a/b.jpg" },
    { ...archivo(u(2), null), size: -1 },
    { ...archivo(u(2), null), size: 1.5 },
    { ...carpeta(u(1)), storage_key: claveImportada(T, u(1)) },
  ];
  for (const m of malos) assert(tira(() => validarLote(T, [m], [])), `dejó pasar ${JSON.stringify(m)}`);
  assert(tira(() => validarLote(T, [archivo(u(2), null), archivo(u(2), null)], [])), "id repetido");
  assert(tira(() => validarLote(T, [], [])), "vacío");
  assert(tira(() => validarLote("x", [carpeta(u(1))], [])), "agencia inválida");
  assert(tira(() => validarLote(T, Array.from({ length: TOPE_LOTE + 1 }, (_, i) => carpeta(u(i + 1))), [])), "más del tope");
  assert(tira(() => validarLote(T, [], [{ item_id: u(1), user_id: u(9), rol: "dueno" }])), "rol que no existe");
});

Deno.test("importar: un archivo de más de 20 GB entra (videos crudos); sin mime, octet-stream", () => {
  const { filas } = validarLote(T, [archivo(u(2), null, { size: 60 * 1024 ** 3, mime: undefined })], []);
  assert(filas[0].size === 60 * 1024 ** 3 && filas[0].mime === "application/octet-stream", "tamaño y mime");
});

Deno.test("importar: las madres que el lote no trae son las que la edge tiene que buscar", () => {
  const { filas } = validarLote(T, [carpeta(u(1), u(7)), archivo(u(2), u(1)), archivo(u(3), u(8)), archivo(u(4), u(8))], []);
  assert(JSON.stringify(madresQueFaltanEnElLote(filas).sort()) === JSON.stringify([u(7), u(8)]), "solo 7 y 8");
});

// ── Unidades compartidas y el espacio de la agencia ─────────────────────────
import { chequearEspacioDeLaAgencia, validarUnidades } from "./logica.ts";

Deno.test("espacio de la agencia: sin tope (KASH) siempre entra; con tope, frena al pasarse", () => {
  assert(!tira(() => chequearEspacioDeLaAgencia(10e12, null, 5e12)), "sin tope no frena");
  const g = 1024 ** 3;
  assert(!tira(() => chequearEspacioDeLaAgencia(20 * g, 30 * g, 10 * g)), "justo el tope entra");
  assert(tira(() => chequearEspacioDeLaAgencia(20 * g, 30 * g, 10 * g + 1)), "un byte más, no");
});

Deno.test("unidades del lote: empresa sin persona, personal con o sin persona", () => {
  const us = validarUnidades([
    { item_id: u(1), tipo: "empresa" },
    { item_id: u(2), tipo: "personal", persona: u(9) },
    { item_id: u(3), tipo: "personal", persona: null },
  ]);
  assert(us.length === 3 && us[0].persona === null && us[1].persona === u(9) && us[2].persona === null, "las tres");
  assert(validarUnidades(undefined).length === 0, "sin unidades, nada");
});

Deno.test("⚠️ unidades del lote: lo raro rechaza el lote entero", () => {
  for (const malo of [
    [{ item_id: "x", tipo: "empresa" }],
    [{ item_id: u(1), tipo: "otra" }],
    [{ item_id: u(1), tipo: "personal", persona: "nadie" }],
    [{ item_id: u(1), tipo: "empresa", persona: u(9) }],
    [{ item_id: u(1), tipo: "empresa" }, { item_id: u(1), tipo: "empresa" }],
  ]) assert(tira(() => validarUnidades(malo)), `dejó pasar ${JSON.stringify(malo)}`);
});

// ── Bajar varios en un .zip ─────────────────────────────────────────────────
import {
  armarListaDelZip, CuentaDelZip, HttpError, idsParaZip, nombreDelZip, nombreParaElZip, TOPE_ZIP_BYTES, TOPE_ZIP_ENTRADAS,
  type FichaZip,
} from "./logica.ts";

const fz = (id: string, nombre: string, extra: Partial<FichaZip> = {}): FichaZip => ({
  id, parent_id: null, tipo: "archivo", nombre, size: 10, storage_key: `${T}/${id}`, estado: "listo", trashed_at: null, ...extra,
});
const cz = (id: string, nombre: string, extra: Partial<FichaZip> = {}) => fz(id, nombre, { tipo: "carpeta", size: null, storage_key: null, ...extra });
const codigoDe = (f: () => unknown) => { try { f(); return null; } catch (e) { return (e as HttpError).datos?.codigo ?? (e as Error).message; } };

Deno.test("zip: las carpetas van con su estructura (y una vacía también), los archivos con su ruta", () => {
  const hijos = new Map([
    [u(1), [fz(u(3), "Balance.pdf", { parent_id: u(1) }), cz(u(2), "2026", { parent_id: u(1) })]],
    [u(2), [fz(u(4), "Enero.xlsx", { parent_id: u(2) })]],
  ]);
  const { l, archivos, bytes } = armarListaDelZip([cz(u(1), "Contabilidad"), cz(u(5), "Vacía"), fz(u(6), "suelto.txt")], hijos);
  assert(JSON.stringify(l) === JSON.stringify([
    { n: "Contabilidad/" },
    { n: "Contabilidad/2026/" },
    { k: `${T}/${u(4)}`, n: "Contabilidad/2026/Enero.xlsx" },
    { k: `${T}/${u(3)}`, n: "Contabilidad/Balance.pdf" },
    { n: "Vacía/" },
    { k: `${T}/${u(6)}`, n: "suelto.txt" },
  ]), JSON.stringify(l));
  assert(archivos === 3 && bytes === 30, "cuenta");
});

Deno.test("⚠️ zip: el mismo nombre en la misma carpeta (aunque cambien las mayúsculas) no se pisa al descomprimir", () => {
  const { l } = armarListaDelZip([fz(u(1), "Foto.jpg"), fz(u(2), "foto.jpg"), fz(u(3), "Foto.jpg"), cz(u(4), "Fotos"), cz(u(5), "Fotos"), fz(u(6), "LEEME")], new Map());
  assert(JSON.stringify(l.map((e) => e.n)) === JSON.stringify(["Foto.jpg", "foto (2).jpg", "Foto (3).jpg", "Fotos/", "Fotos (2)/", "LEEME"]), JSON.stringify(l));
});

Deno.test("zip: lo de la papelera, lo que se está subiendo y un archivo sin lugar en el NAS no entran", () => {
  const { l } = armarListaDelZip([
    fz(u(1), "bien.pdf"), fz(u(2), "papelera.pdf", { trashed_at: "t" }), fz(u(3), "a medias.mov", { estado: "subiendo" }),
    fz(u(4), "sin archivo", { storage_key: null }), cz(u(5), "Tirada", { trashed_at: "t" }),
  ], new Map([[u(5), [fz(u(6), "adentro.pdf")]]]));
  assert(JSON.stringify(l.map((e) => e.n)) === JSON.stringify(["bien.pdf"]), JSON.stringify(l));
  assert(codigoDe(() => armarListaDelZip([fz(u(2), "x", { trashed_at: "t" })], new Map())) === "zip_vacio", "nada listo");
});

Deno.test("⚠️ zip: nombres que se pueden descomprimir en Windows y Mac", () => {
  assert(nombreParaElZip('Informe: "final" <v2>?.pdf') === "Informe_ _final_ _v2__.pdf", nombreParaElZip('Informe: "final" <v2>?.pdf'));
  assert(nombreParaElZip("Carpeta. ") === "Carpeta", "Windows borra los puntos y espacios del final");
  assert(nombreParaElZip("..") === "_" && nombreParaElZip(".") === "_" && nombreParaElZip("a\u0001b") === "a_b", "nunca . ni ..");
  // Mac guarda los acentos descompuestos (NFD): en el .zip van compuestos.
  assert(nombreParaElZip("Año".normalize("NFD")) === "Año".normalize("NFC"), "NFC");
});

Deno.test("zip: un ciclo (lo impide un trigger) no cuelga el armado", () => {
  const hijos = new Map([[u(1), [cz(u(2), "B", { parent_id: u(1) })]], [u(2), [cz(u(1), "A", { parent_id: u(2) })]]]);
  const { l } = armarListaDelZip([cz(u(1), "A")], hijos);
  assert(l.length === 2, JSON.stringify(l));
});

Deno.test("⚠️ zip: los topes frenan apenas se pasan (no se lee una carpeta de 40 mil para decir que no)", () => {
  const c = new CuentaDelZip();
  for (let i = 0; i < TOPE_ZIP_ENTRADAS; i++) c.sumar({ tipo: "archivo", size: 1 });
  assert(codigoDe(() => c.sumar({ tipo: "carpeta", size: null })) === "zip_demasiados", "una más");
  const g = new CuentaDelZip();
  g.sumar({ tipo: "archivo", size: TOPE_ZIP_BYTES });
  assert(codigoDe(() => g.sumar({ tipo: "archivo", size: 1 })) === "zip_muy_grande", "un byte más");
  // Y el armado final también los revisa.
  const muchos = Array.from({ length: TOPE_ZIP_ENTRADAS + 1 }, (_, i) => fz(u(i + 1), `f${i}`));
  assert(codigoDe(() => armarListaDelZip(muchos, new Map())) === "zip_demasiados", "lista");
  assert(codigoDe(() => armarListaDelZip([fz(u(1), "a", { size: TOPE_ZIP_BYTES }), fz(u(2), "b", { size: 1 })], new Map())) === "zip_muy_grande", "bytes");
});

Deno.test("zip: ids elegidos válidos, sin repetir y con tope", () => {
  assert(JSON.stringify(idsParaZip([u(1), u(1), u(2)])) === JSON.stringify([u(1), u(2)]), "sin repetir");
  assert(codigoDe(() => idsParaZip([])) === "zip_vacio" && codigoDe(() => idsParaZip("x")) === "zip_vacio", "vacío");
  assert(tira(() => idsParaZip(["no-uuid"])), "id raro");
  assert(codigoDe(() => idsParaZip(Array.from({ length: TOPE_ZIP_ENTRADAS + 1 }, (_, i) => u(i + 1)))) === "zip_demasiados", "tope");
});

Deno.test("zip: «Maven-<fecha>.zip» con la fecha de Bogotá; una sola carpeta le da su nombre", () => {
  // 03:00 UTC del 3 de octubre = 22:00 del 2 en Bogotá.
  const ahora = new Date("2026-10-03T03:00:00Z");
  assert(nombreDelZip([fz(u(1), "a.pdf"), fz(u(2), "b.pdf")], ahora) === "Maven-2026-10-02.zip", nombreDelZip([fz(u(1), "a.pdf")], ahora));
  assert(nombreDelZip([cz(u(1), "Shooting: julio")], ahora) === "Shooting_ julio-2026-10-02.zip", "una carpeta");
  assert(nombreDelZip([fz(u(1), "a.pdf")], ahora) === "Maven-2026-10-02.zip", "un archivo suelto no le da nombre");
});

import { TOPE_ZIP_PERMISO } from "./logica.ts";
import { firmar } from "../_shared/drive-firma.ts";

Deno.test("⚠️ zip: el permiso de 5000 rutas largas entra en lo que acepta el NAS, y los acentos firman igual que en Node", async () => {
  const l = Array.from({ length: TOPE_ZIP_ENTRADAS }, (_, i) => ({ k: `${T}/google/${u(i + 1)}`, n: `Contabilidad/Año 2026/Shootings de julio/Foto número ${i}.jpg` }));
  const t = await firmar("s".repeat(40), { op: "zip", e: 4102444800, n: "Maven-2026-10-02.zip", l } as never);
  assert(t.length < TOPE_ZIP_PERMISO, `${t.length}`);
  // El mismo vector que infra/nas-drive/test.mjs verifica con Node.
  assert(await firmar(VECTOR_ZIP.secreto, VECTOR_ZIP.datos as never) === VECTOR_ZIP.permiso, "Deno y Node firman distinto un nombre con acentos");
});

export const VECTOR_ZIP = {
  secreto: "vector-de-prueba-del-drive-0123456789abcdef",
  datos: { op: "zip", e: 4102444800, n: "Año-2026.zip", l: [{ n: "Contabilidad/" }, { k: "11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222", n: "Contabilidad/Balance — año.pdf" }] },
  // Lo firmó infra/nas-drive/firma.mjs (Node) el 02/10.
  permiso: "eyJvcCI6InppcCIsImUiOjQxMDI0NDQ4MDAsIm4iOiJBw7FvLTIwMjYuemlwIiwibCI6W3sibiI6IkNvbnRhYmlsaWRhZC8ifSx7ImsiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEvMjIyMjIyMjItMjIyMi0yMjIyLTIyMjItMjIyMjIyMjIyMjIyIiwibiI6IkNvbnRhYmlsaWRhZC9CYWxhbmNlIOKAlCBhw7FvLnBkZiJ9XX0.2A2QI0S31AhvUzhCDz1sM6aOdjqy62bWtC18bxnPXEw",
};

// ── Miniaturas ──────────────────────────────────────────────────────────────
import { extensionParaMiniatura, extensionParaVerComoJpg, idsParaMiniaturas, LADO_VISTA, TOPE_MINIATURAS, TRAMO_MINIATURA, venceMiniatura } from "./logica.ts";

Deno.test("miniaturas: por la extensión; el tipo de la ficha solo si la extensión no dice", () => {
  const casos: [string, string | null, string | null][] = [
    ["Foto.JPG", null, "jpg"], ["IMG_1234.HEIC", "application/octet-stream", "heic"], ["video.mov", null, "mov"],
    ["Contrato.docx", null, "docx"], ["Balance.xlsx", "application/zip", "xlsx"], ["cv.pdf", null, "pdf"],
    ["IMG_1234", "image/jpeg", "jpg"], ["grabacion", "video/mp4", "mp4"], ["escaneo", "application/pdf; charset=binary", "pdf"],
    ["logo.svg", "image/svg+xml", null], ["notas.txt", "text/plain", null], ["fotos.zip", "application/zip", null], ["x", null, null],
  ];
  for (const [nombre, mime, esperada] of casos) {
    assert(extensionParaMiniatura(nombre, mime) === esperada, `${nombre} (${mime}) → ${extensionParaMiniatura(nombre, mime)}`);
  }
});

Deno.test("HEIC: para mirarla va el JPG del NAS; lo que el navegador ya dibuja, el original", async () => {
  const casos: [string, string | null, string | null][] = [
    ["IMG_1234.HEIC", null, "heic"], ["IMG_1234.heif", "image/heif", "heif"], ["IMG_1234", "image/heic", "heic"],
    ["Foto.jpg", "image/jpeg", null], ["video.mov", null, null], ["cv.pdf", null, null], ["x", null, null],
  ];
  for (const [nombre, mime, esperada] of casos) {
    assert(extensionParaVerComoJpg(nombre, mime) === esperada, `${nombre} (${mime}) → ${extensionParaVerComoJpg(nombre, mime)}`);
  }
  // ⚠️ El NAS solo acepta este lado (además de la miniatura).
  const { LADO_VISTA: delNas } = await import("../../../infra/nas-drive/miniaturas.mjs");
  assert(LADO_VISTA === delNas, `edge ${LADO_VISTA} ≠ NAS ${delNas}`);
});

Deno.test("miniaturas: hasta 200 ids por pedido, todos uuid", () => {
  assert(idsParaMiniaturas([u(1), u(1), u(2)]).length === 2, "sin repetir");
  assert(idsParaMiniaturas([]).length === 0, "vacío vale (no hay nada que pedir)");
  assert(tira(() => idsParaMiniaturas(Array.from({ length: TOPE_MINIATURAS + 1 }, (_, i) => u(i + 1)))), "tope");
  assert(tira(() => idsParaMiniaturas(["x"])) && tira(() => idsParaMiniaturas("x")), "raros");
});

Deno.test("miniaturas: el vencimiento es el mismo durante un tramo (la URL se reusa de la caché) y vale entre 6 y 12 h", () => {
  const base = Date.UTC(2026, 9, 2, 12, 0, 0);
  const a = venceMiniatura(base);
  const b = venceMiniatura(base + 5 * 3600 * 1000);
  assert(a === b || b - a === TRAMO_MINIATURA, "estable dentro del tramo");
  for (const ms of [base, base + 3600 * 1000, base + 5.9 * 3600 * 1000]) {
    const resta = venceMiniatura(ms) - ms / 1000;
    assert(resta > 6 * 3600 && resta <= 12 * 3600, `quedan ${resta / 3600} h`);
  }
});

// ── Los tipos por la firma (Jhon, 06/10) ─────────────────────────────────────
Deno.test("validarTipos: agrupa por tipo, sin repetir; solo uuid y tipos de la lista", async () => {
  const { validarTipos, TOPE_TIPOS } = await import("./logica.ts");
  const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
  const g = validarTipos([{ id: a, mime: "video/mp4" }, { id: b, mime: "video/mp4" }, { id: a, mime: "video/mp4" }]);
  if (JSON.stringify([...g]) !== JSON.stringify([["video/mp4", [a, b]]])) throw new Error(JSON.stringify([...g]));
  const falla = (x: unknown) => { try { validarTipos(x); return false; } catch { return true; } };
  if (!falla([])) throw new Error("vacío");
  if (!falla([{ id: "x", mime: "video/mp4" }])) throw new Error("id");
  if (!falla([{ id: a, mime: "text/html" }])) throw new Error("un tipo fuera de la lista (html) no entra");
  if (!falla(Array.from({ length: TOPE_TIPOS + 1 }, () => ({ id: a, mime: "video/mp4" })))) throw new Error("tope");
});
