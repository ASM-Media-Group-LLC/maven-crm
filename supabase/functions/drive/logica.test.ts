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
