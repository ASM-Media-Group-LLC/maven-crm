// datos.ts, el DatosDespacho de producción (supabase-js con service_role), contra un
// PostgREST en memoria que aplica de verdad los filtros eq/neq, proyecta las columnas
// del select, devuelve solo lo que pide `.select()` después de un update y da
// PGRST116 si maybeSingle() encuentra más de una fila. El banco PGlite prueba la
// base con OTRO DatosDespacho (en SQL): este archivo es el único que ejercita datos.ts.
// Correr: deno test --allow-read --no-lock supabase/functions/messenger-webhooks/datos.test.ts

import { assert, assertEquals } from "jsr:@std/assert";
import { crearDatosDespacho } from "./datos.ts";
import type { Guarda } from "./despachador.ts";

type Fila = Record<string, unknown>;
type Err = { message: string; code?: string } | null;
interface Consulta {
  cliente: "antes" | "despues";
  tabla?: string;
  rpc?: string;
  args?: Record<string, unknown>;
  op: "select" | "update";
  filtros: ["eq" | "neq", string, unknown][];
  cols?: string;
  opts?: { count?: string; head?: boolean };
  valores?: Fila;
  devolver?: string;
  single: boolean;
}
interface Base {
  tablas: Record<string, Fila[]>;
  rpc?: (nombre: string, args: Record<string, unknown>) => { data: unknown; error: Err };
  falla?: (q: Consulta) => Err;
}

const proyectar = (f: Fila, cols: string) => Object.fromEntries(cols.split(",").map((c) => c.trim()).filter((c) => c in f).map((c) => [c, f[c]]));

function cliente(nombre: "antes" | "despues", db: Base, log: Consulta[]) {
  const ejecutar = (q: Consulta) => {
    log.push(q);
    const error = db.falla?.(q) ?? null;
    if (error) return Promise.resolve({ data: null, error, count: null });
    const filas = (db.tablas[q.tabla!] ?? []).filter((f) =>
      q.filtros.every(([op, c, v]) => (op === "eq" ? f[c] !== null && String(f[c]) === String(v) : String(f[c]) !== String(v)))
    );
    if (q.op === "update") {
      for (const f of filas) Object.assign(f, q.valores);
      return Promise.resolve({ data: q.devolver ? filas.map((f) => proyectar(f, q.devolver!)) : null, error: null, count: null });
    }
    // Un conteo que no es "exact" es una ESTIMACIÓN del planificador: acá, siempre 1.
    const count = q.opts?.count === "exact" ? filas.length : q.opts?.count ? 1 : null;
    const data = q.opts?.head ? null : filas.map((f) => proyectar(f, q.cols ?? "*"));
    if (q.single) {
      if ((data ?? []).length > 1) return Promise.resolve({ data: null, error: { message: "varias filas", code: "PGRST116" }, count: null });
      return Promise.resolve({ data: (data ?? [])[0] ?? null, error: null, count });
    }
    return Promise.resolve({ data, error: null, count });
  };
  const constructor = (q: Consulta) => {
    const b = {
      select(cols: string, opts?: Consulta["opts"]) {
        if (q.op === "update") q.devolver = cols;
        else (q.cols = cols), (q.opts = opts);
        return b;
      },
      update(valores: Fila) {
        q.op = "update";
        q.valores = valores;
        return b;
      },
      eq(c: string, v: unknown) {
        q.filtros.push(["eq", c, v]);
        return b;
      },
      neq(c: string, v: unknown) {
        q.filtros.push(["neq", c, v]);
        return b;
      },
      maybeSingle() {
        q.single = true;
        return ejecutar(q);
      },
      then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
        return ejecutar(q).then(res, rej);
      },
    };
    return b;
  };
  return {
    from: (tabla: string) => constructor({ cliente: nombre, tabla, op: "select", filtros: [], single: false }),
    rpc: (rpc: string, args: Record<string, unknown>) => {
      const q: Consulta = { cliente: nombre, rpc, args, op: "select", filtros: [], single: false };
      log.push(q);
      const error = db.falla?.(q) ?? null;
      if (error) return Promise.resolve({ data: null, error });
      return Promise.resolve(db.rpc ? db.rpc(rpc, args) : { data: null, error: { message: "sin rpc" } });
    },
  };
}

function armar(db: Base) {
  const log: Consulta[] = [];
  const datos = crearDatosDespacho({ antes: cliente("antes", db, log), despues: cliente("despues", db, log) });
  return { datos, log };
}

const T1 = "10000000-0000-4000-8000-000000000001";
const T2 = "10000000-0000-4000-8000-000000000002";
const EP = "40000000-0000-4000-8000-000000000004";
const EP2 = "40000000-0000-4000-8000-000000000005";
const EP3 = "40000000-0000-4000-8000-000000000006";
const K1 = "30000000-0000-4000-8000-000000000001";
const K2 = "30000000-0000-4000-8000-000000000002";
const K3 = "30000000-0000-4000-8000-000000000003";
const RECLAMO = "2026-09-26T12:01:00.123456+00:00";
const CURSOR = "2026-09-26T11:55:00.000456+00:00";
const CID = "00000000-0000-0000-0000-000000000000";
const BOOM: Err = { message: "boom" };

const endpoint = (id: string, extra: Fila = {}): Fila => ({
  id, tenant_id: T1, status: "active", lease_until: RECLAMO, cursor_at: CURSOR, cursor_id: CID, disabled_reason: null,
  disabled_at: null, paused_at: null, paused_by: null, ...extra,
});
const guarda = (id = EP, extra: Partial<Guarda> = {}): Guarda => ({ id, tenantId: T1, reclamo: RECLAMO, cursorAt: CURSOR, cursorId: CID, ...extra });

Deno.test("datos.agencias: conteo EXACTO (no una estimación); error → null", async () => {
  const db: Base = { tablas: { tenants: [{ id: T1 }, { id: T2 }] } };
  const { datos, log } = armar(db);
  assertEquals(await datos.agencias(), 2);
  assertEquals(log[0].cliente, "antes");
  db.falla = () => BOOM;
  assertEquals(await datos.agencias(), null, "si no se pudo contar, null (la puerta cierra)");
});

Deno.test("datos.detenerPorAgencias: detiene todo lo no detenido, sin pisar el motivo de los ya detenidos", async () => {
  const db: Base = {
    tablas: {
      api_webhook_endpoints: [
        endpoint(EP),
        endpoint(EP2, { status: "paused", paused_at: "2026-09-26T10:00:00+00:00", paused_by: K1 }),
        endpoint(EP3, { status: "disabled", disabled_reason: "key_revoked", disabled_at: "2026-09-20T00:00:00+00:00" }),
      ],
    },
  };
  const { datos, log } = armar(db);
  assertEquals(await datos.detenerPorAgencias(), true);
  const [a, b, c] = db.tablas.api_webhook_endpoints;
  assertEquals([a.status, a.disabled_reason, a.disabled_at], ["disabled", "multi_agency", "now"]);
  assertEquals([b.status, b.disabled_reason, b.paused_at, b.paused_by], ["disabled", "multi_agency", null, null]);
  assertEquals([c.disabled_reason, c.disabled_at], ["key_revoked", "2026-09-20T00:00:00+00:00"], "el ya detenido conserva su motivo");
  assertEquals(log[0].cliente, "despues");
  db.falla = () => BOOM;
  assertEquals(await datos.detenerPorAgencias(), false);
});

Deno.test("datos.reclamar: los parámetros con su nombre; error → null", async () => {
  let args: unknown = null;
  const db: Base = { tablas: {}, rpc: (n, a) => ((args = { n, a }), { data: [{ id: EP }], error: null }) };
  const { datos, log } = armar(db);
  assertEquals(await datos.reclamar(5, 60), [{ id: EP }] as never);
  assertEquals(args, { n: "api_webhooks_reclamar", a: { _max: 5, _lease_s: 60 } });
  assertEquals(log[0].cliente, "antes");
  db.falla = () => BOOM;
  assertEquals(await datos.reclamar(5, 60), null);
});

Deno.test("datos.llave: por id Y agencia, con TODAS las columnas que mira el despachador (y ninguna más)", async () => {
  const k1 = {
    id: K1, tenant_id: T1, key_prefix: "mvk_live_ab12cd", scopes: ["messenger:read"], expires_at: "2026-12-01T00:00:00+00:00",
    revoked_at: null, acts_as_user_id: EP3, ip_whitelist: ["1.2.3.4"],
  };
  const db: Base = {
    tablas: {
      api_keys: [
        { ...k1, key_hash: "NO-SALE" },
        { ...k1, id: K2, key_hash: "NO-SALE" },
        { ...k1, id: K3, tenant_id: T2, key_hash: "NO-SALE" },
      ],
    },
  };
  const { datos, log } = armar(db);
  assertEquals(await datos.llave(K1, T1), { ok: true, valor: k1 }, "exactamente esas 8 columnas");
  assertEquals(await datos.llave(K3, T1), { ok: true, valor: null }, "la llave de otra agencia no existe para esta");
  assertEquals(await datos.llave(K1, T2), { ok: true, valor: null });
  assert(log.every((q) => q.cliente === "antes"));
  db.falla = () => BOOM;
  assertEquals(await datos.llave(K1, T1), { ok: false }, "un error NO es 'no está' (que detendría con key_revoked)");
});

Deno.test("datos.llaveVigente: solo true es vigente; null (sin fila) no; error → no se sabe", async () => {
  const db: Base = { tablas: {}, rpc: (n, a) => ({ data: n === "api_key_vigente" ? (a._id === K1 ? true : a._id === K2 ? null : false) : "x", error: null }) };
  const { datos } = armar(db);
  assertEquals(await datos.llaveVigente(K1), { ok: true, valor: true });
  assertEquals(await datos.llaveVigente(K2), { ok: true, valor: false });
  assertEquals(await datos.llaveVigente(K3), { ok: true, valor: false });
  db.falla = () => BOOM;
  assertEquals(await datos.llaveVigente(K1), { ok: false });
});

Deno.test("datos.timbrePendiente: el de ESTE endpoint, pendiente y de mensajes (no una prueba, no otro endpoint)", async () => {
  const d = (id: string, extra: Fila): Fila => ({
    id, endpoint_id: EP, tenant_id: T1, state: "pending", event_type: "messages.created", body: `b-${id}`, attempts: 2,
    uncertain: true, message_count: 3, last_error: "http_503", ...extra,
  });
  const db: Base = {
    tablas: {
      api_webhook_deliveries: [
        d("d1", {}),
        d("d2", { event_type: "webhook.test", attempts: 0, uncertain: false }),
        d("d3", { state: "delivered" }),
        d("d4", { endpoint_id: EP2 }),
      ],
    },
  };
  const { datos } = armar(db);
  assertEquals(await datos.timbrePendiente(EP, T1), { ok: true, valor: { id: "d1", body: "b-d1", attempts: 2, uncertain: true } });
  assertEquals(await datos.timbrePendiente(EP2, T1), { ok: true, valor: { id: "d4", body: "b-d4", attempts: 2, uncertain: true } });
  assertEquals(await datos.timbrePendiente(EP, T2), { ok: true, valor: null });
  db.falla = () => BOOM;
  assertEquals(await datos.timbrePendiente(EP, T1), { ok: false });
});

Deno.test("datos.timbrar: cada parámetro en su lugar; ok / perdio / 23505 / cualquier otra cosa → error", async () => {
  const respuestas: { data: unknown; error: Err }[] = [
    { data: "ok", error: null },
    { data: "perdio", error: null },
    { data: null, error: { message: "dup", code: "23505" } },
    { data: null, error: { message: "regla", code: "P0001" } },
    { data: "raro", error: null },
    { data: null, error: null },
  ];
  const args: unknown[] = [];
  const db: Base = { tablas: {}, rpc: (n, a) => (args.push({ n, a }), respuestas.shift()!) };
  const { datos } = armar(db);
  const g = guarda();
  const nuevo = { t: "2026-09-26T11:59:50.654321+00:00", i: "ffffffff-ffff-ffff-ffff-ffffffffffff" };
  const t = { id: "70000000-0000-4000-8000-000000000001", body: "{}", cantidad: 7 };
  const salidas = [];
  for (let n = 0; n < 6; n++) salidas.push(await datos.timbrar(g, nuevo, t, n === 0));
  assertEquals(salidas, ["ok", "perdio", "ya_hay_uno", "error", "error", "error"]);
  assertEquals(args[0], {
    n: "api_webhooks_timbrar",
    a: {
      _endpoint: EP, _tenant: T1, _reclamo: RECLAMO, _cursor_at: CURSOR, _cursor_id: CID, _nuevo_at: nuevo.t, _nuevo_id: nuevo.i,
      _timbre: t.id, _cuerpo: "{}", _cantidad: 7, _limpiar_error: true,
    },
  });
});

Deno.test("datos.actualizarEndpoint: la guarda entera, SOLO esa fila, el cliente de la fase; 0 filas → false; error → null", async () => {
  // EP2 comparte agencia, reclamo (mismo api_webhooks_reclamar) y cursor: solo el id la separa.
  const db: Base = { tablas: { api_webhook_endpoints: [endpoint(EP), endpoint(EP2)] } };
  const { datos, log } = armar(db);
  assertEquals(await datos.actualizarEndpoint(guarda(), { next_attempt_at: "now" }, "antes"), true);
  const [a, b] = db.tablas.api_webhook_endpoints;
  assertEquals([a.next_attempt_at, b.next_attempt_at], ["now", undefined], "no tocó la otra fila");
  assertEquals(log.at(-1)!.cliente, "antes");
  assertEquals(await datos.actualizarEndpoint(guarda(), { x: 1 }, "despues"), true);
  assertEquals(log.at(-1)!.cliente, "despues");
  for (const mala of [{ reclamo: "2026-09-26T12:01:00.123+00:00" }, { cursorAt: "2026-09-26T11:55:00+00:00" }, { cursorId: EP }, { tenantId: T2 }]) {
    assertEquals(await datos.actualizarEndpoint(guarda(EP, mala), { y: 1 }, "antes"), false, JSON.stringify(mala));
  }
  a.status = "paused";
  assertEquals(await datos.actualizarEndpoint(guarda(), { y: 1 }, "antes"), false, "pausado: no pasa");
  assertEquals([a.y, b.y], [undefined, undefined]);
  db.falla = () => BOOM;
  assertEquals(await datos.actualizarEndpoint(guarda(EP2), { y: 1 }, "antes"), null);
});

Deno.test("datos.anotarTimbre: SOLO ese timbre y solo si sigue pendiente; error → null", async () => {
  const db: Base = {
    tablas: {
      api_webhook_deliveries: [
        { id: "d1", endpoint_id: EP, tenant_id: T1, state: "pending", attempts: 1 },
        { id: "d2", endpoint_id: EP2, tenant_id: T1, state: "pending", attempts: 1 },
        { id: "d3", endpoint_id: EP, tenant_id: T1, state: "dropped", attempts: 1 },
      ],
    },
  };
  const { datos, log } = armar(db);
  assertEquals(await datos.anotarTimbre("d1", T1, { attempts: 2 }, "antes"), true);
  assertEquals(db.tablas.api_webhook_deliveries.map((f) => f.attempts), [2, 1, 1]);
  assertEquals(log.at(-1)!.cliente, "antes");
  assertEquals(await datos.anotarTimbre("d3", T1, { attempts: 9 }, "despues"), false, "ya no está pendiente");
  assertEquals(log.at(-1)!.cliente, "despues");
  assertEquals(await datos.anotarTimbre("d1", T2, { attempts: 9 }, "despues"), false, "otra agencia");
  db.falla = () => BOOM;
  assertEquals(await datos.anotarTimbre("d1", T1, { attempts: 9 }, "despues"), null);
});

Deno.test("datos.soltar: SOLO esa fila y solo si el reclamo es el nuestro, con el cliente de después", async () => {
  const db: Base = {
    tablas: { api_webhook_endpoints: [endpoint(EP), endpoint(EP2), endpoint(EP3, { lease_until: "2026-09-26T12:05:00+00:00" })] },
  };
  const { datos, log } = armar(db);
  await datos.soltar(EP, T1, RECLAMO);
  await datos.soltar(EP3, T1, RECLAMO);
  assertEquals(db.tablas.api_webhook_endpoints.map((f) => f.lease_until), [null, RECLAMO, "2026-09-26T12:05:00+00:00"]);
  assert(log.every((q) => q.cliente === "despues"));
});
