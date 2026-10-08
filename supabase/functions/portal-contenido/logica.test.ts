// portal-contenido: la creadora y su carpeta de contenido.
//
//   deno test supabase/functions/portal-contenido/logica.test.ts
//
// Sin red: los puertos son dobles con un Drive en memoria. La base de verdad (la
// carpeta como unidad, quién del equipo la abre) se prueba en
// supabase/tests/portal_contenido.ts.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { type Item, manejar, nombreValido, partesDe, type Puertos, TAMANO_PARTE } from "./logica.ts";
import { type FilaPedido, motivoValido, NOMBRE_CARPETA, PEDIDOS_DESDE, SE_PUEDE } from "./pedidos.ts";

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

// Sus pedidos (lo que trae la base con service_role, con lo que NO debe viajar).
const PED = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADJ = (n: number) => `a1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = {
  fan_handle: "fan_01", description: "Video bailando", price_usd: 120, content_type: "video", duration_or_qty: "3 min",
  requested_on: "2026-10-06", creadora_motivo: null, fan_total_spent_usd: 900, paid_usd: 120, notes: "nota interna", chatter_name: "Ana",
};
const PEDIDOS: FilaPedido[] = [
  { ...base, id: PED(1), status: "entregado", due_on: null, created_at: "2026-10-01T10:00:00Z" },
  { ...base, id: PED(2), status: "aprobado", due_on: "2026-10-10", created_at: "2026-10-05T10:00:00Z",
    custom_request_attachments: [
      { id: ADJ(1), kind: "referencia", file_name: "idea.jpg", mime_type: "image/jpeg", size_bytes: 10, drive_item_id: null, storage_path: `${PED(2)}/1-idea.jpg`, created_at: "2026-10-05T10:00:00Z" },
      { id: ADJ(2), kind: "entrega", file_name: "del equipo.mp4", mime_type: "video/mp4", size_bytes: 10, drive_item_id: null, storage_path: `${PED(2)}/2-x.mp4`, created_at: "2026-10-05T11:00:00Z" },
    ] },
  { ...base, id: PED(3), status: "solicitado", due_on: "2026-10-08", created_at: "2026-10-06T10:00:00Z" },
];
const ADJUNTOS: Record<string, { kind: string; storage_path: string | null; creator_id: string | null }> = {
  [ADJ(1)]: { kind: "referencia", storage_path: `${PED(2)}/1-idea.jpg`, creator_id: C1 },
  [ADJ(3)]: { kind: "referencia", storage_path: "otro/1-ajena.jpg", creator_id: C2 },
};

function item(over: Partial<Item> & Pick<Item, "id">): Item {
  return {
    tenant_id: T1, parent_id: RAIZ, unidad_id: RAIZ, owner_id: "u-sofi", tipo: "archivo", nombre: "x.jpg", mime: "image/jpeg",
    size: 100, estado: "listo", storage_key: `${T1}/${over.id}`, created_at: hace(1), updated_at: hace(1), trashed_at: null, ...over,
  };
}

function armar(o: {
  sinCarpeta?: boolean; espacio?: { usado: number; cupo: number | null }; nas?: { ok: boolean; libre: number; total: number }[] | null;
  nasBorra?: boolean; respuestaPedido?: Record<string, unknown>;
} = {}) {
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
  const log = {
    creadas: 0, insertadas: [] as Item[], borradas: [] as string[], enNas: [] as string[], permisos: [] as Record<string, unknown>[],
    confirmadas: [] as string[], ocultadas: [] as string[], acciones: [] as Record<string, unknown>[],
  };
  const ocultos = new Set<string>();
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
    ocultos: () => Promise.resolve(new Set(ocultos)),
    ocultar: (i) => { ocultos.add(i); log.ocultadas.push(i); return Promise.resolve(); },
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
    pedidosDe: (cid) => Promise.resolve(cid === C1 ? PEDIDOS : []),
    accionPedido: (uid, pid, accion, motivo, item) => {
      log.acciones.push({ uid, pid, accion, motivo, item });
      return Promise.resolve(o.respuestaPedido ?? { ok: true, estado: "listo" });
    },
    adjunto: (aid) => Promise.resolve(ADJUNTOS[aid] ?? null),
    firmarReferencia: (ruta) => Promise.resolve(`https://storage.test/${ruta}`),
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
  assertEquals(it.find((x) => x.nombre === "vieja.mp4")?.se_puede_borrar, true, "sin el límite de 24 horas");
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

Deno.test("borrar: sale de SU vista y nada más (el archivo sigue en el Drive de la agencia)", async () => {
  const a = armar();
  assertEquals((await pedir("tok-sofi", { accion: "borrar", id: VIEJA }, a)).status, 200);
  assertEquals(a.log.ocultadas, [VIEJA]);
  assertEquals([a.log.enNas, a.log.borradas], [[], []], "ni en el NAS ni en la base");
  assert(a.items.has(VIEJA), "la ficha sigue");
  const sesion = await pedir("tok-sofi", { accion: "listar", carpeta: SESION }, a);
  assert(!(sesion.body.items as { id: string }[]).some((i) => i.id === VIEJA), "y ella ya no lo ve");
  assertEquals((await pedir("tok-sofi", { accion: "abrir", id: VIEJA }, a)).body.error, "no_existe");
  assertEquals((await pedir("tok-sofi", { accion: "renombrar", id: VIEJA, nombre: "otra" }, a)).body.error, "no_existe");

  // Una carpeta con cosas: también, y lo de adentro desaparece con ella.
  assertEquals((await pedir("tok-sofi", { accion: "borrar", id: SESION }, a)).status, 200);
  assert(!((await pedir("tok-sofi", { accion: "listar" }, a)).body.items as { id: string }[]).some((i) => i.id === SESION));
  assertEquals((await pedir("tok-sofi", { accion: "listar", carpeta: SESION }, a)).body.error, "no_existe");
  assertEquals((await pedir("tok-sofi", { accion: "abrir", id: FOTO }, a)).body.error, "no_existe", "lo de adentro de lo borrado, tampoco");
  const m = await pedir("tok-sofi", { accion: "miniaturas", ids: [FOTO] }, a);
  assertEquals(Object.keys(m.body.urls as object), []);
  assertEquals((await pedir("tok-sofi", { accion: "borrar", id: RAIZ }, a)).body.error, "no_existe", "la carpeta de arriba, nunca");
  assertEquals((await pedir("tok-sofi", { accion: "borrar", id: DE_OTRA }, a)).body.error, "no_existe");
});

Deno.test("borrar una subida suya que quedó a medias: esa sí, de verdad (primero el NAS)", async () => {
  const a = armar();
  const id = String((await pedir("tok-sofi", { accion: "subir_iniciar", nombre: "cortado.mov", size: 5000 }, a)).body.id);
  assertEquals((await pedir("tok-sofi", { accion: "borrar", id }, a)).status, 200);
  assertEquals(a.log.enNas, [`${T1}/${id}`]);
  assertEquals(a.log.borradas, [id]);
  assertEquals(a.log.ocultadas, []);
  const b = armar({ nasBorra: false });
  const id2 = String((await pedir("tok-sofi", { accion: "subir_iniciar", nombre: "cortado.mov", size: 5000 }, b)).body.id);
  assertEquals((await pedir("tok-sofi", { accion: "borrar", id: id2 }, b)).body.error, "nas_no_borro");
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
  // Una foto del iPhone: para mirarla, el JPG que convierte el NAS; para bajarla, la original.
  a.items.set(FOTO, { ...a.items.get(FOTO)!, nombre: "IMG_0001.HEIC", mime: "image/heic" });
  await pedir("tok-sofi", { accion: "abrir", id: FOTO }, a);
  assertEquals(a.log.permisos.at(-1), { op: "mini", k: `${T1}/${FOTO}`, x: "heic", l: 2048 });
  await pedir("tok-sofi", { accion: "abrir", id: FOTO, descargar: true }, a);
  assertEquals(a.log.permisos.at(-1)?.op, "get");
  assertEquals(a.log.permisos.at(-1)?.dl, true);
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

// ── Los personalizados (fase 3) ─────────────────────────────────────────────
Deno.test("sus pedidos: los por hacer primero (el que vence antes arriba), y solo lo que ella ve", async () => {
  const res = await pedir("tok-sofi", { accion: "pedidos" });
  const ps = res.body.pedidos as Record<string, unknown>[];
  assertEquals(ps.map((x) => x.id), [PED(3), PED(2), PED(1)]);
  const p2 = ps[1];
  assertEquals([p2.fan, p2.precio_usd, p2.descripcion, p2.para_el], ["fan_01", 120, "Video bailando", "2026-10-10"]);
  // NO viaja: lo que gastó el fan en total, lo cobrado, las notas, quién lo vendió.
  for (const x of ps) for (const k of ["fan_total_spent_usd", "paid_usd", "notes", "chatter_name"]) assertEquals(k in x, false, k);
  assertEquals((p2.referencias as unknown[]).length, 1);
  assertEquals((p2.entregas as unknown[]).length, 0, "las entregas del bucket (del equipo) no son suyas");
  assertEquals([ps[0].por_aprobar, ps[0].se_puede_empezar, p2.se_puede_empezar], [true, false, true]);
});

Deno.test("otra creadora (o la misma cuenta con otra ficha) no ve estos pedidos", async () => {
  assertEquals((await pedir("tok-luna", { accion: "pedidos" })).status, 403);
  assertEquals((await manejar("tok-sofi", { accion: "pedidos", creator_id: C2 }, armar().p)).status, 403);
});

Deno.test("su carpeta «Personalizados»: la crea una vez, después la reusa", async () => {
  const a = armar();
  const r1 = await pedir("tok-sofi", { accion: "pedido_carpeta" }, a);
  assertEquals(a.log.insertadas.length, 1);
  assertEquals([a.log.insertadas[0].nombre, a.log.insertadas[0].parent_id, a.log.insertadas[0].tipo], [NOMBRE_CARPETA, RAIZ, "carpeta"]);
  const r2 = await pedir("tok-sofi", { accion: "pedido_carpeta" }, a);
  assertEquals(r2.body.carpeta, r1.body.carpeta);
  assertEquals(a.log.insertadas.length, 1);
});

Deno.test("«No puedo hacerlo» exige motivo; las acciones van a la base con SU usuario", async () => {
  const a = armar();
  assertEquals((await pedir("tok-sofi", { accion: "pedido_no_puede", pedido: PED(2), motivo: "  " }, a)).body.error, "falta_motivo");
  assertEquals(a.log.acciones.length, 0);
  await pedir("tok-sofi", { accion: "pedido_no_puede", pedido: PED(2), motivo: "No grabo en exteriores" }, a);
  await pedir("tok-sofi", { accion: "pedido_empezar", pedido: PED(2) }, a);
  assertEquals(a.log.acciones.map((x) => [x.uid, x.accion, x.motivo]), [["u-sofi", "no_puede", "No grabo en exteriores"], ["u-sofi", "empezar", null]]);
  assertEquals((await pedir("tok-sofi", { accion: "pedido_empezar", pedido: "x" }, a)).status, 400);
});

Deno.test("la entrega: solo un archivo SUYO terminado (ni de la agencia, ni de otra, ni a medio subir)", async () => {
  const a = armar();
  for (const f of [AJENA, DE_OTRA, TIRADA]) {
    const r = await pedir("tok-sofi", { accion: "pedido_entregar", pedido: PED(2), archivo: f }, a);
    // AJENA es de su carpeta aunque la subió la agencia: la base decide; lo de otra o en la papelera, no llega.
    if (f !== AJENA) assertEquals(r.body.error, "archivo_invalido", f);
  }
  a.items.set(id(90), item({ id: id(90), estado: "subiendo", nombre: "a medias.mp4" }));
  assertEquals((await pedir("tok-sofi", { accion: "pedido_entregar", pedido: PED(2), archivo: id(90) }, a)).body.error, "archivo_invalido");
  const ok = await pedir("tok-sofi", { accion: "pedido_entregar", pedido: PED(2), archivo: FOTO }, a);
  assertEquals([ok.status, a.log.acciones.at(-1)?.item], [200, FOTO]);
});

Deno.test("lo que dice la base se traduce a un status: no es tuyo 404, por aprobar 409", async () => {
  assertEquals((await pedir("tok-sofi", { accion: "pedido_empezar", pedido: PED(3) }, armar({ respuestaPedido: { error: "por_aprobar" } }))).status, 409);
  assertEquals((await pedir("tok-sofi", { accion: "pedido_empezar", pedido: PED(3) }, armar({ respuestaPedido: { error: "no_es_tuyo" } }))).status, 404);
});

Deno.test("las referencias: solo las de SUS pedidos se firman", async () => {
  const ok = await pedir("tok-sofi", { accion: "pedido_referencia", id: ADJ(1) });
  assertEquals(ok.body.url, `https://storage.test/${PED(2)}/1-idea.jpg`);
  assertEquals((await pedir("tok-sofi", { accion: "pedido_referencia", id: ADJ(3) })).status, 404, "la de otra creadora");
  assertEquals((await pedir("tok-sofi", { accion: "pedido_referencia", id: ADJ(2) })).status, 404, "una entrega no es una referencia");
});

Deno.test("los botones que se ofrecen son los que la base acepta", () => {
  assertEquals(SE_PUEDE.empezar("solicitado"), false);
  assertEquals(SE_PUEDE.entregar("solicitado"), true);
  assertEquals(SE_PUEDE.rechazar("listo"), false);
  assertEquals(motivoValido("ok"), null);
  assert(motivoValido("No grabo en exteriores"));
});

// Jhon, 08/10: «solo nuevas peticiones». La lista sale de la base con el filtro de
// fecha (index.ts); los avisos los corta el trigger con la misma fecha (el banco
// portal_pedidos.ts compara las dos).
Deno.test("al portal solo llegan los pedidos nuevos: desde el 08/10 a las 00:00 de Bogotá", async () => {
  assertEquals(new Date(PEDIDOS_DESDE).toISOString(), "2026-10-08T05:00:00.000Z");
  const index = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const consulta = index.slice(index.indexOf("pedidosDe:"), index.indexOf("accionPedido:"));
  assert(/\.eq\("creator_id", creatorId\)\.gte\("created_at", PEDIDOS_DESDE\)/.test(consulta), "pedidosDe no filtra por PEDIDOS_DESDE");
});
