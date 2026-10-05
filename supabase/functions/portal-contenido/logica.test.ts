// portal-contenido: la creadora y su carpeta de contenido.
//
//   deno test supabase/functions/portal-contenido/logica.test.ts
//
// Sin red: los puertos son dobles con un Drive en memoria. La base de verdad (la
// carpeta como unidad, quién del equipo la abre) se prueba en
// supabase/tests/portal_contenido.ts.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { type Item, manejar, nombreValido, partesDe, type Puertos, TAMANO_PARTE } from "./logica.ts";

const T1 = "t-asm";
const C1 = "c0000000-0000-4000-8000-000000000001"; // la ficha de Sofi
const C2 = "c0000000-0000-4000-8000-000000000002"; // la de otra creadora
const id = (n: number) => `e1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const RAIZ = id(1), SESION = id(2), FOTO = id(3), VIEJA = id(4), AJENA = id(5), TIRADA = id(6), OTRA_RAIZ = id(7), DE_OTRA = id(8);
const AHORA = Date.parse("2026-10-06T12:00:00Z");
const hace = (horas: number) => new Date(AHORA - horas * 3600_000).toISOString();

const GENTE: Record<string, { id: string; esCreadora: boolean }> = {
  "tok-sofi": { id: "u-sofi", esCreadora: true },
  "tok-luna": { id: "u-luna", esCreadora: true },
  "tok-jhon": { id: "u-jhon", esCreadora: false },
};

function item(over: Partial<Item> & Pick<Item, "id">): Item {
  return {
    tenant_id: T1, parent_id: RAIZ, unidad_id: RAIZ, owner_id: "u-sofi", tipo: "archivo", nombre: "x.jpg", mime: "image/jpeg",
    size: 100, estado: "listo", storage_key: `${T1}/${over.id}`, created_at: hace(1), updated_at: hace(1), trashed_at: null, ...over,
  };
}

function armar(o: { sinCarpeta?: boolean; espacio?: { usado: number; cupo: number | null }; nas?: { ok: boolean; libre: number; total: number }[] | null; nasBorra?: boolean } = {}) {
  const items = new Map<string, Item>([
    [RAIZ, item({ id: RAIZ, parent_id: null, owner_id: null, tipo: "carpeta", nombre: "Contenido · Sofi", mime: null, size: null, storage_key: null })],
    [SESION, item({ id: SESION, tipo: "carpeta", nombre: "Sesión cocina", mime: null, size: null, storage_key: null })],
    [FOTO, item({ id: FOTO, parent_id: SESION, nombre: "foto.jpg" })],
    [VIEJA, item({ id: VIEJA, parent_id: SESION, nombre: "vieja.mp4", mime: "video/mp4", created_at: hace(30) })],
    [AJENA, item({ id: AJENA, owner_id: "u-jhon", nombre: "de la agencia.pdf", mime: "application/pdf" })],
    [TIRADA, item({ id: TIRADA, nombre: "tirada.jpg", trashed_at: hace(2) })],
    [OTRA_RAIZ, item({ id: OTRA_RAIZ, parent_id: null, unidad_id: OTRA_RAIZ, owner_id: null, tipo: "carpeta", nombre: "Contenido · Otra", storage_key: null })],
    [DE_OTRA, item({ id: DE_OTRA, parent_id: OTRA_RAIZ, unidad_id: OTRA_RAIZ, owner_id: "u-otra", nombre: "suya.jpg" })],
  ]);
  const log = { creadas: 0, insertadas: [] as Item[], borradas: [] as string[], enNas: [] as string[], permisos: [] as Record<string, unknown>[], confirmadas: [] as string[] };
  let n = 100;
  const p: Puertos = {
    persona: (t) => Promise.resolve(GENTE[t] ?? null),
    fichaDe: (uid, cid) => Promise.resolve(uid === "u-sofi" && cid === C1 ? { creator_id: C1, tenant_id: T1, nombre: "Sofi" } : null),
    carpetaDe: () => {
      if (o.sinCarpeta) { log.creadas++; o.sinCarpeta = false; }
      return Promise.resolve(RAIZ);
    },
    item: (i) => Promise.resolve(items.get(i) ?? null),
    itemsPorId: (ids) => Promise.resolve(ids.map((i) => items.get(i)).filter(Boolean) as Item[]),
    hijos: (c) => Promise.resolve([...items.values()].filter((i) => i.parent_id === c && !i.trashed_at)),
    tieneHijos: (c) => Promise.resolve([...items.values()].some((i) => i.parent_id === c)),
    insertar: (f) => {
      const nuevo = { ...f, unidad_id: RAIZ, created_at: new Date(AHORA).toISOString(), updated_at: new Date(AHORA).toISOString(), trashed_at: null } as Item;
      items.set(f.id, nuevo); log.insertadas.push(nuevo);
      return Promise.resolve({ error: null });
    },
    renombrar: (i, nombre) => { items.get(i)!.nombre = nombre; return Promise.resolve({ error: null }); },
    borrarFila: (i) => { items.delete(i); log.borradas.push(i); return Promise.resolve(); },
    confirmar: (i, size) => { const x = items.get(i)!; x.estado = "listo"; x.size = size; log.confirmadas.push(i); return Promise.resolve(); },
    espacio: () => Promise.resolve(o.espacio ?? { usado: 0, cupo: null }),
    saludNas: () => Promise.resolve(o.nas === undefined ? [{ ok: true, libre: 1e12, total: 2e12 }] : o.nas),
    permiso: (datos) => { log.permisos.push(datos); return Promise.resolve(`https://nas.test/o?t=${datos.op}-${datos.k}`); },
    verificarRecibo: (rec) => Promise.resolve(rec.startsWith("ok:") ? { op: "recibo", k: rec.slice(3).split("|")[0], size: Number(rec.split("|")[1]), sha256: "a".repeat(64) } : null),
    borrarEnNas: (k) => { log.enNas.push(k); return Promise.resolve(o.nasBorra ?? true); },
    uuid: () => id(n++),
    ahora: () => AHORA,
  };
  return { p, log, items };
}
const pedir = (tok: string, body: Record<string, unknown>, a = armar()) => manejar(tok, { creator_id: C1, ...body }, a.p);

Deno.test("solo la creadora y solo su ficha", async () => {
  assertEquals((await pedir("", { accion: "raiz" })).status, 401);
  assertEquals((await pedir("tok-jhon", { accion: "raiz" })).body.error, "solo_creadoras");
  assertEquals((await pedir("tok-luna", { accion: "raiz" })).body.error, "no_es_tu_ficha");
  assertEquals((await pedir("tok-sofi", { accion: "raiz", creator_id: C2 })).body.error, "no_es_tu_ficha");
  assertEquals((await pedir("tok-sofi", { accion: "raiz", creator_id: "1 or 1=1" })).body.error, "creator_id_invalido");
  assertEquals((await pedir("tok-sofi", { accion: "borrar_todo" })).body.error, "accion_desconocida");
});

Deno.test("la primera vez se crea su carpeta; después, la misma", async () => {
  const a = armar({ sinCarpeta: true });
  assertEquals((await pedir("tok-sofi", { accion: "raiz" }, a)).body.raiz, RAIZ);
  assertEquals((await pedir("tok-sofi", { accion: "raiz" }, a)).body.raiz, RAIZ);
  assertEquals(a.log.creadas, 1);
});

Deno.test("listar: lo suyo, sin la papelera, con las migas; nada de otra carpeta", async () => {
  const raiz = await pedir("tok-sofi", { accion: "listar" });
  assertEquals(raiz.status, 200);
  const nombres = (raiz.body.items as { nombre: string }[]).map((i) => i.nombre).sort();
  assertEquals(nombres, ["Sesión cocina", "de la agencia.pdf"]);
  const sesion = await pedir("tok-sofi", { accion: "listar", carpeta: SESION });
  assertEquals((sesion.body.ruta as { id: string }[]).map((x) => x.id), [RAIZ, SESION]);
  const it = sesion.body.items as { nombre: string; se_puede_borrar: boolean; mio: boolean }[];
  assertEquals(it.find((x) => x.nombre === "foto.jpg")?.se_puede_borrar, true);
  assertEquals(it.find((x) => x.nombre === "vieja.mp4")?.se_puede_borrar, false);
  assert(!JSON.stringify(sesion.body).includes("storage_key"), "la ruta física del NAS no sale");
  assertEquals((await pedir("tok-sofi", { accion: "listar", carpeta: OTRA_RAIZ })).body.error, "no_existe");
  assertEquals((await pedir("tok-sofi", { accion: "listar", carpeta: FOTO })).body.error, "no_existe");
});

Deno.test("crear carpeta y renombrar: solo adentro de la suya, con un nombre válido", async () => {
  const a = armar();
  const r1 = await pedir("tok-sofi", { accion: "crear_carpeta", carpeta: SESION, nombre: "  Fotos sueltas " }, a);
  assertEquals(r1.status, 200);
  assertEquals(a.log.insertadas[0].nombre, "Fotos sueltas");
  assertEquals(a.log.insertadas[0].owner_id, "u-sofi");
  assertEquals(a.log.insertadas[0].parent_id, SESION);
  assertEquals((await pedir("tok-sofi", { accion: "crear_carpeta", carpeta: DE_OTRA, nombre: "x" }, a)).body.error, "no_existe");
  assertEquals((await pedir("tok-sofi", { accion: "crear_carpeta", nombre: "a/b" }, a)).body.error, "nombre_invalido");
  assertEquals((await pedir("tok-sofi", { accion: "renombrar", id: FOTO, nombre: "nueva.jpg" }, a)).status, 200);
  assertEquals(a.items.get(FOTO)?.nombre, "nueva.jpg");
  assertEquals((await pedir("tok-sofi", { accion: "renombrar", id: RAIZ, nombre: "otra" }, a)).body.error, "no_existe");
  assertEquals((await pedir("tok-sofi", { accion: "renombrar", id: DE_OTRA, nombre: "x" }, a)).body.error, "no_existe");
  assertEquals((await pedir("tok-sofi", { accion: "renombrar", id: TIRADA, nombre: "x" }, a)).body.error, "no_existe");
});

Deno.test("borrar: lo suyo hasta 24 horas, primero en el NAS; carpetas vacías", async () => {
  const a = armar();
  assertEquals((await pedir("tok-sofi", { accion: "borrar", id: FOTO }, a)).status, 200);
  assertEquals(a.log.enNas, [`${T1}/${FOTO}`]);
  assertEquals(a.log.borradas, [FOTO]);
  assertEquals((await pedir("tok-sofi", { accion: "borrar", id: VIEJA }, a)).body.error, "ya_no_se_borra");
  assertEquals((await pedir("tok-sofi", { accion: "borrar", id: AJENA }, a)).body.error, "ya_no_se_borra");
  assertEquals((await pedir("tok-sofi", { accion: "borrar", id: SESION }, a)).body.error, "carpeta_con_cosas");
  assertEquals((await pedir("tok-sofi", { accion: "borrar", id: RAIZ }, a)).body.error, "no_existe");
  const b = armar({ nasBorra: false });
  assertEquals((await pedir("tok-sofi", { accion: "borrar", id: FOTO }, b)).body.error, "nas_no_borro");
  assertEquals(b.log.borradas, [], "si el NAS no borra, la ficha queda");
});

Deno.test("subir: partes de 8 MB firmadas para el NAS, con espacio y lugar", async () => {
  const a = armar();
  const size = TAMANO_PARTE * 2 + 5;
  const r1 = await pedir("tok-sofi", { accion: "subir_iniciar", carpeta: SESION, nombre: "video.mov", size, mime: "video/quicktime" }, a);
  assertEquals(r1.status, 200);
  assertEquals((r1.body.partes as string[]).length, 3);
  assertEquals(r1.body.tamano_parte, 8 * 1024 * 1024);
  const fila = a.log.insertadas[0];
  assertEquals([fila.estado, fila.owner_id, fila.parent_id, fila.storage_key], ["subiendo", "u-sofi", SESION, `${T1}/${fila.id}`]);
  assertEquals(a.log.permisos.map((x) => x.op), ["parte", "parte", "parte", "completar"]);
  assertEquals(a.log.permisos[0].total, size);
  const chico = await pedir("tok-sofi", { accion: "subir_iniciar", nombre: "foto.heic", size: 1000 }, a);
  assert(typeof chico.body.url === "string" && !chico.body.partes, "uno chico va entero");

  assertEquals((await pedir("tok-sofi", { accion: "subir_iniciar", carpeta: DE_OTRA, nombre: "x.jpg", size: 10 }, a)).body.error, "no_existe");
  assertEquals((await pedir("tok-sofi", { accion: "subir_iniciar", nombre: "x.jpg", size: 0 }, a)).body.error, "tamano_invalido");
  assertEquals((await pedir("tok-sofi", { accion: "subir_iniciar", nombre: "x.jpg", size: 11 * 1024 ** 3 }, a)).body.error, "demasiado_grande");
  const llena = armar({ espacio: { usado: 900, cupo: 1000 } });
  assertEquals((await pedir("tok-sofi", { accion: "subir_iniciar", nombre: "x.jpg", size: 200 }, llena)).body.error, "sin_espacio_en_la_agencia");
  const caido = armar({ nas: null });
  assertEquals((await pedir("tok-sofi", { accion: "subir_iniciar", nombre: "x.jpg", size: 200 }, caido)).body.error, "nas_no_responde");
  const lleno = armar({ nas: [{ ok: true, libre: 100, total: 1000 }] });
  assertEquals((await pedir("tok-sofi", { accion: "subir_iniciar", nombre: "x.jpg", size: 200 }, lleno)).body.error, "nas_sin_lugar");
});

Deno.test("confirmar: con el recibo del NAS de ESE archivo, y no más grande de lo anunciado", async () => {
  const a = armar();
  const r1 = await pedir("tok-sofi", { accion: "subir_iniciar", nombre: "video.mp4", size: 5000 }, a);
  const nuevo = String(r1.body.id), k = `${T1}/${nuevo}`;
  assertEquals((await pedir("tok-sofi", { accion: "subir_confirmar", id: nuevo, recibo: "falso" }, a)).body.error, "recibo_invalido");
  assertEquals((await pedir("tok-sofi", { accion: "subir_confirmar", id: nuevo, recibo: `ok:${T1}/${FOTO}|10` }, a)).body.error, "recibo_invalido");
  assertEquals((await pedir("tok-sofi", { accion: "subir_confirmar", id: nuevo, recibo: `ok:${k}|9999` }, a)).body.error, "tamano_no_coincide");
  assertEquals((await pedir("tok-sofi", { accion: "subir_confirmar", id: nuevo, recibo: `ok:${k}|4990` }, a)).status, 200);
  assertEquals(a.items.get(nuevo)?.estado, "listo");
  assertEquals((await pedir("tok-sofi", { accion: "subir_confirmar", id: nuevo, recibo: `ok:${k}|4990` }, a)).body.error, "sin_subida");
  assertEquals((await pedir("tok-sofi", { accion: "subir_confirmar", id: AJENA, recibo: `ok:${T1}/${AJENA}|1` }, a)).body.error, "sin_subida");
});

Deno.test("abrir y miniaturas: solo lo suyo y listo", async () => {
  const a = armar();
  const r1 = await pedir("tok-sofi", { accion: "abrir", id: FOTO }, a);
  assertEquals(r1.status, 200);
  assertEquals(a.log.permisos.at(-1)?.op, "get");
  assertEquals((await pedir("tok-sofi", { accion: "abrir", id: DE_OTRA }, a)).body.error, "no_existe");
  assertEquals((await pedir("tok-sofi", { accion: "abrir", id: TIRADA }, a)).body.error, "no_existe");
  const m = await pedir("tok-sofi", { accion: "miniaturas", ids: [FOTO, VIEJA, DE_OTRA, TIRADA] }, a);
  assertEquals(Object.keys(m.body.urls as object).sort(), [FOTO, VIEJA].sort());
  assertEquals((await pedir("tok-sofi", { accion: "miniaturas", ids: [FOTO, "basura"] }, a)).body.error, "ids_invalidos");
});

Deno.test("nombres y partes", () => {
  assertEquals(nombreValido("  Sesión cocina "), "Sesión cocina");
  assertEquals(nombreValido("a/b"), null);
  assertEquals(nombreValido(".."), null);
  assertEquals(nombreValido("x".repeat(256)), null);
  assertEquals(nombreValido("ok\u0000"), "ok");
  assertEquals(partesDe(TAMANO_PARTE), 0);
  assertEquals(partesDe(TAMANO_PARTE + 1), 2);
});
