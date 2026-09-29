// Correr: deno test --no-check supabase/functions/drive/logica.test.ts
import { MAX_ARCHIVO, nombreValido, planDeSubida, TAMANO_PARTE } from "./logica.ts";

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
  assert(/No te alcanza el espacio: usás 49 GB de 50 GB/.test(msg), msg);
});

Deno.test("lugar en el NAS: 5% libre después de guardar, y el doble si va por partes", () => {
  const disco = [{ ok: true, libre: 100, total: 1000 }];
  assert(hayLugarEnElNas(disco, 50, false), "50 entra dejando 50 (5%)");
  assert(!hayLugarEnElNas(disco, 51, false), "51 deja menos del 5%");
  assert(!hayLugarEnElNas(disco, 30, true), "por partes necesita 60, deja 40 < 50");
  assert(!hayLugarEnElNas([{ ok: false }], 1, false), "un disco caído no cuenta");
  assert(hayLugarEnElNas([{ ok: true, libre: 10, total: 1000 }, disco[0]], 50, false), "alcanza con uno");
});
