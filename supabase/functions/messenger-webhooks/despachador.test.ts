// El despachador, por comportamiento: una base en memoria que imita los triggers
// (./base-falsa.ts), un feed simulado y un envío falso. Las reglas de la BASE se
// prueban además contra Postgres: supabase/tests/api_webhooks_tablas.ts (bloque O).
// Correr: deno test --allow-read --no-lock supabase/functions/messenger-webhooks/despachador.test.ts

import { assert, assertEquals, assertMatch } from "jsr:@std/assert";
import { type Envio, firmar, type Resultado, sellarSecreto } from "../_shared/webhook-salida.ts";
import { codificarCursor, decodificarCursor } from "../public-api/messenger-formato.ts";
import { aMicros, type BaseFalsa, crearBaseFalsa, deMicros, feedFalso, type FilaEp, type Opciones } from "./base-falsa.ts";
import {
  despachar,
  EN_PARALELO,
  type Endpoint,
  type Entorno,
  ESPERA_FALLA_PROPIA_MS,
  lineaDeLog,
  MARGEN_ANOTAR_MS,
  MARGEN_ESCRITURA_MS,
  MINIMO_PARA_LEER_MS,
  MINIMO_PARA_MANDAR_MS,
  motivoDeLlave,
  PAGINAS_POR_CORRIDA,
  PLAZO_DESPUES_MS,
  PRESUPUESTO_MS,
  RECLAMO_MAX,
  RECLAMO_S,
} from "./despachador.ts";
import type { PaginaDelFeed } from "./feed.ts";

const AHORA = Date.parse("2026-09-26T12:00:00Z");
const AGENCIA = "10000000-0000-4000-8000-000000000001";
const PERSONA = "20000000-0000-4000-8000-000000000002";
const LLAVE = "30000000-0000-4000-8000-000000000003";
const EP = "40000000-0000-4000-8000-000000000004";
const EP2 = "40000000-0000-4000-8000-000000000005";
const LLAVE2 = "30000000-0000-4000-8000-000000000006";
const CONV = "50000000-0000-4000-8000-000000000007";
const KEK = "k".repeat(40);
const ENTORNO = (v: string) => (v === "WEBHOOK_SIGNING_KEK" ? KEK : undefined);
const SECRETO = "whsec_" + btoa("s".repeat(33));
const URL_INTEGRADOR = "https://hooks.integrador.com/maven?token=secreto123";
const CERO = "00000000-0000-0000-0000-000000000000";
const MAXI = "ffffffff-ffff-ffff-ffff-ffffffffffff";

/** Un instante con microsegundos, en el formato de PostgREST. */
const enUs = (ms: number, extraUs = 0) => deMicros(ms * 1000 + extraUs);
const cursor = (t: string, i = CERO) => codificarCursor({ t, i });

async function escenario(o: Opciones & { ep?: Partial<FilaEp>; sinEndpoint?: boolean } = {}) {
  const b = crearBaseFalsa(AHORA, o);
  b.llaves.set(LLAVE, {
    id: LLAVE, tenant_id: AGENCIA, key_prefix: "mvk_live_ab12cd", scopes: ["messenger:read"],
    expires_at: new Date(AHORA + 30 * 86_400_000).toISOString(), revoked_at: null, acts_as_user_id: PERSONA,
    ip_whitelist: ["1.2.3.4"],
  });
  if (!o.sinEndpoint) await agregarEndpoint(b, EP, LLAVE, o.ep);
  return b;
}

async function agregarEndpoint(b: BaseFalsa, id: string, llave: string, extra: Partial<FilaEp> = {}) {
  const sellado = (await sellarSecreto(SECRETO, id, ENTORNO))!;
  b.endpoints.set(id, {
    id, tenant_id: AGENCIA, api_key_id: llave, acts_as_user_id: PERSONA, url: URL_INTEGRADOR, exclude_own: true,
    status: "active", disabled_reason: null, disabled_at: null, paused_at: null, paused_by: null,
    secret_cipher: sellado.cipher, secret_nonce: sellado.nonce, secret_key_version: sellado.version,
    // El cursor con microsegundos, como lo guarda la base.
    cursor_at: (AHORA - 5 * 60_000) * 1000 + 456, cursor_id: CERO, lease_until: null, next_attempt_at: (AHORA - 1_000) * 1000,
    consecutive_failures: 0, failing_since: null, last_attempt_at: null, last_success_at: null, last_status_code: null,
    last_error: null, ...extra,
  });
}

const pagina = (cantidad: number, siguiente: string, hayMas = false, conversaciones = [CONV]): PaginaDelFeed =>
  ({ ok: true, cantidad, conversaciones: cantidad ? conversaciones : [], siguiente, hayMas });
const HASTA = enUs(AHORA - 10_000);
const SIGUIENTE = cursor(HASTA, MAXI);

function correr(b: BaseFalsa, extra: Partial<Entorno> & { respuesta?: Resultado | ((e: Envio) => Promise<Resultado>); paginas?: PaginaDelFeed[] | ((p: unknown, n: number) => PaginaDelFeed) } = {}) {
  const envios: Envio[] = [];
  const logs: string[] = [];
  const feed = feedFalso((extra.paginas ?? [pagina(3, SIGUIENTE)]) as PaginaDelFeed[]);
  let n = 0;
  const respuesta = extra.respuesta ?? { tipo: "respuesta", estado: 204, retryAfterS: null, latenciaMs: 40 };
  const e: Entorno = {
    datos: b.datos,
    leerFeed: feed.leer,
    sesionConfigurada: () => true,
    entorno: ENTORNO,
    ahora: b.ahoraMs,
    uuid: () => `60000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    azar: () => 0.5,
    log: (l) => void logs.push(l),
    enviar: (env: Envio) => (envios.push(env), typeof respuesta === "function" ? respuesta(env) : Promise.resolve(respuesta)),
    ...extra,
  };
  return { corrida: despachar(e), envios, logs, feed };
}
const ep = (b: BaseFalsa, id = EP) => b.endpoints.get(id)!;
const timbresDe = (b: BaseFalsa, id = EP) => [...b.timbres.values()].filter((t) => t.endpoint_id === id);

// ─── el camino feliz ─────────────────────────────────────────────────────────

Deno.test("timbre nuevo: se lee el feed como la persona, se guarda con el cursor, se firma, se manda y queda entregado", async () => {
  const b = await escenario();
  const { corrida, envios, feed } = correr(b);
  const inf = await corrida;
  assertEquals(inf, { estado: 200, cuerpo: { ok: true, resultados: [{ id: EP, accion: "entregado" }] } });
  // El feed, como la persona y desde el cursor guardado.
  assertEquals(feed.pedidos.length, 1);
  const p = feed.pedidos[0];
  assertEquals([p.persona, p.agencia, p.sinPropios, p.conWhitelist], [PERSONA, AGENCIA, true, true]);
  assertEquals(decodificarCursor(p.despues), { t: deMicros((AHORA - 5 * 60_000) * 1000 + 456), i: CERO }, "desde el cursor exacto (con µs)");
  // El timbre: pendiente → entregado, con el cuerpo que se firmó.
  const [t] = timbresDe(b);
  assertEquals([t.state, t.attempts, t.last_status_code, t.last_error, t.uncertain, t.message_count], ["delivered", 1, 204, null, false, 3]);
  const cuerpo = JSON.parse(t.body);
  assertEquals(cuerpo.type, "messages.created");
  assertEquals([cuerpo.data.count, cuerpo.data.after, cuerpo.data.until, cuerpo.data.exclude_own], [3, p.despues, SIGUIENTE, true]);
  const e = envios[0];
  assertEquals(e.href, URL_INTEGRADOR);
  assertEquals(e.cuerpo, t.body, "se manda exactamente lo guardado");
  assertEquals(e.encabezados["webhook-id"], t.id);
  assertEquals(e.encabezados["webhook-signature"], await firmar(SECRETO, t.id, Number(e.encabezados["webhook-timestamp"]), e.cuerpo));
  // El endpoint: cursor en el until, racha en cero, reclamo suelto, turno siguiente ya.
  const f = ep(b);
  assertEquals(deMicros(f.cursor_at!), deMicros(aMicros(HASTA, 0)));
  assertEquals(f.cursor_id, MAXI);
  assertEquals([f.consecutive_failures, f.failing_since, f.last_status_code, f.last_error, f.lease_until], [0, null, 204, null, null]);
  assertEquals(f.next_attempt_at, AHORA * 1000);
  assert(f.last_success_at !== null);
});

Deno.test("el orden: timbrar → adelanto (endpoint) → intento (timbre) → envío → timbre → endpoint final", async () => {
  const b = await escenario();
  let alMandar: string[] = [];
  const { corrida } = correr(b, {
    respuesta: () => ((alMandar = [...b.llamadas]), Promise.resolve<Resultado>({ tipo: "respuesta", estado: 200, retryAfterS: null, latenciaMs: 1 })),
  });
  await corrida;
  assertEquals(alMandar.slice(alMandar.indexOf("timbrar")), ["timbrar", "actualizarEndpoint:antes", "anotarTimbre:antes"]);
  assertEquals(b.llamadas.slice(b.llamadas.indexOf("anotarTimbre:antes") + 1), ["anotarTimbre:despues", "actualizarEndpoint:despues"]);
  assert(!b.llamadas.includes("soltar"), "la escritura final ya soltó el reclamo");
});

Deno.test("antes de mandar ya quedó el intento anotado: si la corrida se muere a mitad del envío, el turno siguiente espera", async () => {
  const b = await escenario();
  let foto: FilaEp | null = null;
  let attempts = -1;
  const { corrida } = correr(b, {
    respuesta: () => {
      foto = { ...ep(b) };
      attempts = timbresDe(b)[0].attempts;
      return Promise.resolve<Resultado>({ tipo: "respuesta", estado: 204, retryAfterS: null, latenciaMs: 1 });
    },
  });
  await corrida;
  const f = foto as unknown as FilaEp;
  assertEquals([f.consecutive_failures, attempts], [1, 1]);
  assertEquals(f.next_attempt_at, (AHORA + 30_000) * 1000, "espera de 30 s (la primera, con el azar en el medio)");
  assert(f.failing_since !== null);
});

Deno.test("timbre pendiente: se reintenta el MISMO (id y cuerpo), sin leer el feed", async () => {
  const b = await escenario({ ep: { consecutive_failures: 2, failing_since: (AHORA - 3_600_000) * 1000 } });
  b.timbres.set("70000000-0000-4000-8000-000000000001", {
    id: "70000000-0000-4000-8000-000000000001", endpoint_id: EP, tenant_id: AGENCIA, event_type: "messages.created",
    body: '{"x":1}', message_count: 4, state: "pending", drop_reason: null, attempts: 2, last_attempt_at: null,
    last_status_code: 503, last_error: "http_503", latency_ms: 5, uncertain: true, created_at: AHORA * 1000, delivered_at: null,
  });
  const { corrida, envios, feed } = correr(b, { respuesta: { tipo: "respuesta", estado: 503, retryAfterS: 600, latenciaMs: 9 } });
  assertEquals((await corrida).cuerpo.resultados, [{ id: EP, accion: "reintentar" }]);
  assertEquals(feed.pedidos.length, 0);
  assertEquals([envios[0].cuerpo, envios[0].encabezados["webhook-id"]], ['{"x":1}', "70000000-0000-4000-8000-000000000001"]);
  const t = b.timbres.get("70000000-0000-4000-8000-000000000001")!;
  assertEquals([t.state, t.attempts, t.last_status_code, t.uncertain], ["pending", 3, 503, true], "uncertain se acumula");
  const f = ep(b);
  assertEquals([f.consecutive_failures, f.failing_since, f.last_error, f.lease_until], [3, (AHORA - 3_600_000) * 1000, "http_503", null]);
  assertEquals(f.next_attempt_at, (AHORA + 600_000) * 1000, "10 min: el tercer escalón, que coincide con el Retry-After");
});

// ─── el feed ─────────────────────────────────────────────────────────────────

Deno.test("páginas vacías con has_more: se sigue leyendo desde cada next_cursor; el timbre va desde la página con mensajes", async () => {
  const b = await escenario();
  const c1 = cursor(enUs(AHORA - 4 * 60_000), MAXI), c2 = cursor(enUs(AHORA - 3 * 60_000), MAXI), c3 = cursor(enUs(AHORA - 2 * 60_000), MAXI);
  const { corrida, feed } = correr(b, { paginas: [pagina(0, c1, true), pagina(0, c2, true), pagina(0, c3, true), pagina(2, SIGUIENTE)] });
  assertEquals((await corrida).cuerpo.resultados, [{ id: EP, accion: "entregado" }]);
  assertEquals(feed.pedidos.map((p) => p.despues).slice(1), [c1, c2, c3]);
  const cuerpo = JSON.parse(timbresDe(b)[0].body);
  assertEquals([cuerpo.data.after, cuerpo.data.until], [c3, SIGUIENTE]);
  assertEquals(deMicros(ep(b).cursor_at!), deMicros(aMicros(HASTA, 0)), "el cursor guardado quedó en el until (la guarda usó el del reclamo)");
});

Deno.test("feed vacío y al día: se mueve el cursor, no se manda nada, y se limpia un maven_* viejo", async () => {
  const b = await escenario({ ep: { last_error: "maven_feed_base" } });
  const { corrida, envios } = correr(b, { paginas: [pagina(0, SIGUIENTE, false)] });
  assertEquals((await corrida).cuerpo.resultados, [{ id: EP, accion: "al_dia" }]);
  assertEquals(envios.length, 0);
  assertEquals(timbresDe(b).length, 0);
  const f = ep(b);
  assertEquals([deMicros(f.cursor_at!), f.cursor_id, f.last_error, f.lease_until], [deMicros(aMicros(HASTA, 0)), MAXI, null, null]);
});

Deno.test("feed vacío: un last_error del receptor (no maven_*) no se toca", async () => {
  const b = await escenario({ ep: { last_error: "http_503" } });
  await correr(b, { paginas: [pagina(0, SIGUIENTE, false)] }).corrida;
  assertEquals(ep(b).last_error, "http_503");
});

Deno.test("tope de páginas POR CORRIDA (entre todos los endpoints, que se lo reparten): lo que falta, el turno siguiente, sin espera", async () => {
  const b = await escenario();
  b.llaves.set(LLAVE2, { ...b.llaves.get(LLAVE)!, id: LLAVE2 });
  await agregarEndpoint(b, EP2, LLAVE2, { next_attempt_at: AHORA * 1000 - 500 });
  let k = 0;
  const { corrida, feed } = correr(b, { paginas: () => pagina(0, cursor(enUs(AHORA - 5 * 60_000 + ++k * 1_000), MAXI), true) });
  const r = (await corrida).cuerpo.resultados!;
  assertEquals(feed.pedidos.length, PAGINAS_POR_CORRIDA, "48 entre los dos, no 48 cada uno");
  for (const x of r) {
    assert(x.accion === "cursor" || x.accion === "sin_tiempo", x.accion);
    const f = ep(b, x.id);
    assertEquals([f.lease_until, f.next_attempt_at <= AHORA * 1000, f.last_error], [null, true, null], "suelto y sin espera");
  }
});

// ─── la llave y la persona, en cada vuelta ───────────────────────────────────

Deno.test("llave muerta o persona fuera: se detiene con el motivo, sin leer el feed ni mandar", async () => {
  const casos: Array<[string, (b: BaseFalsa) => void, string]> = [
    ["revocada", (b) => void (b.llaves.get(LLAVE)!.revoked_at = "2026-09-25T00:00:00Z"), "key_revoked"],
    ["no está", (b) => void b.llaves.delete(LLAVE), "key_revoked"],
    ["vencida", (b) => void (b.llaves.get(LLAVE)!.expires_at = new Date(AHORA - 1).toISOString()), "key_expired"],
    ["sin vencimiento", (b) => void (b.llaves.get(LLAVE)!.expires_at = null), "key_expired"],
    ["sin Messenger", (b) => void (b.llaves.get(LLAVE)!.scopes = ["creators:read"]), "scope_removed"],
    ["sin IPs", (b) => void (b.llaves.get(LLAVE)!.ip_whitelist = []), "config_error"],
    ["otra persona", (b) => void (b.llaves.get(LLAVE)!.acts_as_user_id = LLAVE2), "config_error"],
    ["persona de baja", (b) => void b.vigentes.set(LLAVE, false), "person_inactive"],
  ];
  for (const [nombre, preparar, motivo] of casos) {
    const b = await escenario();
    b.timbres.set("70000000-0000-4000-8000-000000000009", {
      id: "70000000-0000-4000-8000-000000000009", endpoint_id: EP, tenant_id: AGENCIA, event_type: "messages.created",
      body: "{}", message_count: 1, state: "pending", drop_reason: null, attempts: 1, last_attempt_at: null,
      last_status_code: null, last_error: null, latency_ms: null, uncertain: false, created_at: AHORA * 1000, delivered_at: null,
    });
    preparar(b);
    const { corrida, envios, feed } = correr(b);
    assertEquals((await corrida).cuerpo.resultados, [{ id: EP, accion: "detenido" }], nombre);
    const f = ep(b);
    assertEquals([f.status, f.disabled_reason, f.lease_until, f.paused_at], ["disabled", motivo, null, null], nombre);
    assertEquals([envios.length, feed.pedidos.length], [0, 0], nombre);
    assertEquals(b.timbres.get("70000000-0000-4000-8000-000000000009")!.state, "dropped", `${nombre}: el trigger descartó el pendiente`);
  }
});

Deno.test("secreto que no abre (otra KEK, o a medio rotar): se ESPERA, no se detiene, y se cura solo con la KEK buena", async () => {
  const b1 = await escenario({ ep: { consecutive_failures: 2 } });
  const { corrida, envios } = correr(b1, { entorno: (v) => (v === "WEBHOOK_SIGNING_KEK" ? "z".repeat(40) : undefined) });
  assertEquals((await corrida).cuerpo.resultados, [{ id: EP, accion: "espera" }]);
  const f = ep(b1);
  assertEquals([f.status, f.last_error, f.consecutive_failures, f.next_attempt_at, envios.length], ["active", "maven_secreto", 2, (AHORA + ESPERA_FALLA_PROPIA_MS) * 1000, 0]);
  // Pasa la espera y se carga la KEK buena: anda.
  b1.pasar(ESPERA_FALLA_PROPIA_MS + 1_000);
  const r2 = correr(b1, { paginas: [pagina(1, cursor(enUs(AHORA + ESPERA_FALLA_PROPIA_MS - 9_000), MAXI))] });
  assertEquals((await r2.corrida).cuerpo.resultados, [{ id: EP, accion: "entregado" }]);
});

Deno.test("feed que rechaza el pedido (o el tope de conversaciones): config_error", async () => {
  for (const falla of ["tope", "feed_400", "feed_403", "feed_404"] as const) {
    const b = await escenario();
    const { corrida, envios } = correr(b, { paginas: [{ ok: false, permanente: true, falla }] });
    assertEquals((await corrida).cuerpo.resultados, [{ id: EP, accion: "detenido" }], falla);
    assertEquals([ep(b).disabled_reason, envios.length], ["config_error", 0], falla);
  }
});

// ─── fallas propias: espera, nunca el turno siguiente ────────────────────────

Deno.test("falla propia (base, llave, feed): espera de 5 min + la clase en last_error, suelta, y NO suma fallos", async () => {
  const casos: Array<[string, Opciones, PaginaDelFeed[] | undefined, string]> = [
    ["no se pudo leer la llave", { falla: { llave: "error" } }, undefined, "maven_llave"],
    ["no se supo la vigencia", { falla: { llaveVigente: "error" } }, undefined, "maven_vigencia"],
    ["no se pudo leer el pendiente", { falla: { timbrePendiente: "error" } }, undefined, "maven_timbre"],
    ["feed: la sesión", {}, [{ ok: false, permanente: false, falla: "sesion" }], "maven_sesion"],
    ["feed: la base", {}, [{ ok: false, permanente: false, falla: "base" }], "maven_base"],
    ["feed: plazo", {}, [{ ok: false, permanente: false, falla: "plazo" }], "maven_plazo"],
    ["feed: forma", {}, [{ ok: false, permanente: false, falla: "forma" }], "maven_forma"],
    ["timbrar falló", { falla: { timbrar: "error" } }, undefined, "maven_timbrar"],
    ["algo tiró", { falla: { timbrePendiente: "tira" } }, undefined, "maven_interno"],
  ];
  for (const [nombre, o, paginas, clase] of casos) {
    const b = await escenario({ ...o, ep: { consecutive_failures: 4 } });
    const { corrida, envios } = correr(b, { paginas });
    const acc = (await corrida).cuerpo.resultados![0].accion;
    assert(acc === "espera" || acc === "error", `${nombre}: ${acc}`);
    const f = ep(b);
    assertEquals([f.next_attempt_at, f.last_error, f.lease_until, f.consecutive_failures], [(AHORA + ESPERA_FALLA_PROPIA_MS) * 1000, clase, null, 4], nombre);
    assertEquals([envios.length, timbresDe(b).length], [0, 0], nombre);
  }
});

Deno.test("feed que falla después de avanzar en vacío: guarda lo avanzado junto con la espera", async () => {
  const b = await escenario();
  const c1 = cursor(enUs(AHORA - 4 * 60_000), MAXI);
  await correr(b, { paginas: [pagina(0, c1, true), { ok: false, permanente: false, falla: "base" }] }).corrida;
  const f = ep(b);
  assertEquals([deMicros(f.cursor_at!), f.last_error], [deMicros(aMicros(decodificarCursor(c1)!.t, 0)), "maven_base"]);
});

Deno.test("si la espera tampoco se puede escribir, el reclamo NO se suelta (hace de espera 60 s)", async () => {
  const b = await escenario({ falla: { llave: "error", actualizarEndpoint: "error" } });
  await correr(b).corrida;
  assert(ep(b).lease_until !== null, "sigue reclamado");
  assert(!b.llamadas.includes("soltar"));
});

Deno.test("freno: con la base fallando en un endpoint, los demás no se empiezan (quedan reclamados, sin escribir)", async () => {
  const b = await escenario({ falla: { llave: "error" } });
  b.llaves.set(LLAVE2, { ...b.llaves.get(LLAVE)!, id: LLAVE2 });
  await agregarEndpoint(b, EP2, LLAVE2, { next_attempt_at: AHORA * 1000 - 500 });
  // De a uno, para que el orden sea fijo.
  const { corrida } = correr(b);
  const r = (await corrida).cuerpo.resultados!;
  const acciones = r.map((x) => x.accion);
  assert(acciones.includes("espera"));
  // Con 4 en paralelo los dos arrancan juntos: el freno corta al que llega después
  // de la falla. Acá basta con que ninguno de los dos haya mandado ni escrito un timbre.
  assertEquals(timbresDe(b, EP).length + timbresDe(b, EP2).length, 0);
});

// ─── carreras ────────────────────────────────────────────────────────────────

Deno.test("Resume (o pausa) en el medio: la guarda del cursor no pasa y no se crea ni se manda nada", async () => {
  const b = await escenario({
    antes: {
      timbrar: (x) => {
        // Otra admin pausa y la persona reanuda: el cursor cambia (arranca desde ahora).
        const e = x.endpoints.get(EP)!;
        x.endpoints.set(EP, { ...e, cursor_at: x.reloj.us - 10_000_000, cursor_id: CERO });
      },
    },
  });
  const { corrida, envios } = correr(b);
  assertEquals((await corrida).cuerpo.resultados, [{ id: EP, accion: "perdio" }]);
  assertEquals([timbresDe(b).length, envios.length, ep(b).lease_until], [0, 0, null]);
});

Deno.test("la pausa llega DURANTE el envío: el timbre ya no está pendiente → carrera perdida, sin anotar nada más", async () => {
  const b = await escenario();
  const { corrida } = correr(b, {
    respuesta: () => {
      const e = b.endpoints.get(EP)!;
      b.endpoints.set(EP, { ...e, status: "paused", paused_at: b.reloj.us, paused_by: PERSONA });
      b.timbres.forEach((t) => t.state === "pending" && ((t.state = "dropped"), (t.drop_reason = "endpoint_paused")));
      return Promise.resolve<Resultado>({ tipo: "respuesta", estado: 204, retryAfterS: null, latenciaMs: 3 });
    },
  });
  assertEquals((await corrida).cuerpo.resultados, [{ id: EP, accion: "perdio" }]);
  assertEquals(timbresDe(b)[0].state, "dropped");
  assertEquals([ep(b).status, ep(b).lease_until], ["paused", null], "se suelta igual");
});

Deno.test("23505: ya había un timbre pendiente (otra corrida) → no se mueve el cursor ni se manda", async () => {
  const b = await escenario({
    antes: {
      timbrar: (x) => {
        x.timbres.set("70000000-0000-4000-8000-00000000000a", {
          id: "70000000-0000-4000-8000-00000000000a", endpoint_id: EP, tenant_id: AGENCIA, event_type: "messages.created",
          body: "{}", message_count: 1, state: "pending", drop_reason: null, attempts: 0, last_attempt_at: null,
          last_status_code: null, last_error: null, latency_ms: null, uncertain: false, created_at: x.reloj.us, delivered_at: null,
        });
      },
    },
  });
  const antes = ep(b).cursor_at;
  const { corrida, envios } = correr(b);
  assertEquals((await corrida).cuerpo.resultados, [{ id: EP, accion: "ya_hay_timbre" }]);
  assertEquals([ep(b).cursor_at, envios.length, ep(b).lease_until], [antes, 0, null]);
});

Deno.test("reclamo con microsegundos: toda escritura usa el texto tal cual (ninguna pierde la guarda)", async () => {
  const b = await escenario();
  await correr(b).corrida;
  assertEquals(ep(b).lease_until, null);
  assert(!b.llamadas.includes("soltar"), "si alguna guarda hubiera recortado los µs, habría caído en el soltar");
});

// ─── el receptor ─────────────────────────────────────────────────────────────

Deno.test("410: el timbre se descarta (receiver_gone) y el endpoint se detiene, en ese orden y en una escritura cada uno", async () => {
  const b = await escenario();
  await correr(b, { respuesta: { tipo: "respuesta", estado: 410, retryAfterS: null, latenciaMs: 5 } }).corrida;
  const t = timbresDe(b)[0];
  assertEquals([t.state, t.drop_reason, t.last_status_code, t.attempts], ["dropped", "receiver_gone", 410, 1]);
  const f = ep(b);
  assertEquals([f.status, f.disabled_reason, f.last_status_code, f.lease_until], ["disabled", "receiver_gone", 410, null]);
  assertEquals(b.llamadas.slice(-2), ["anotarTimbre:despues", "actualizarEndpoint:despues"]);
});

Deno.test("la URL guardada ya no se acepta (host_prohibido): config_error, el timbre descartado como endpoint_disabled", async () => {
  const b = await escenario();
  await correr(b, { respuesta: { tipo: "sin_enviar", clase: "host_prohibido", latenciaMs: 0 } }).corrida;
  assertEquals([timbresDe(b)[0].state, timbresDe(b)[0].drop_reason], ["dropped", "endpoint_disabled"]);
  assertEquals([ep(b).status, ep(b).disabled_reason], ["disabled", "config_error"]);
});

Deno.test("72 h fallando: el intento se anota JUNTO con su descarte y el endpoint se detiene (receiver_failing)", async () => {
  const b = await escenario({ ep: { consecutive_failures: 15, failing_since: (AHORA - 73 * 3_600_000) * 1000 } });
  b.timbres.set("70000000-0000-4000-8000-000000000002", {
    id: "70000000-0000-4000-8000-000000000002", endpoint_id: EP, tenant_id: AGENCIA, event_type: "messages.created",
    body: "{}", message_count: 1, state: "pending", drop_reason: null, attempts: 15, last_attempt_at: null,
    last_status_code: 503, last_error: "http_503", latency_ms: 5, uncertain: false, created_at: AHORA * 1000, delivered_at: null,
  });
  const { corrida } = correr(b, { respuesta: { tipo: "respuesta", estado: 503, retryAfterS: null, latenciaMs: 5 } });
  assertEquals((await corrida).cuerpo.resultados, [{ id: EP, accion: "detenido" }]);
  const t = b.timbres.get("70000000-0000-4000-8000-000000000002")!;
  assertEquals([t.state, t.drop_reason, t.attempts, t.last_status_code], ["dropped", "receiver_failing", 16, 503]);
  const f = ep(b);
  assertEquals([f.status, f.disabled_reason, f.lease_until], ["disabled", "receiver_failing", null]);
});

Deno.test("un timbre NUEVO arranca racha nueva: la vieja (71,9 h, 15 fallos) no lo puede detener en falso", async () => {
  const b = await escenario({ ep: { consecutive_failures: 15, failing_since: (AHORA - 71.9 * 3_600_000) * 1000 } });
  b.pasar(0);
  await correr(b, { respuesta: { tipo: "respuesta", estado: 503, retryAfterS: null, latenciaMs: 5 } }).corrida;
  const f = ep(b);
  assertEquals([f.status, f.consecutive_failures, f.failing_since], ["active", 1, AHORA * 1000]);
  assertEquals(f.next_attempt_at, (AHORA + 30_000) * 1000, "la primera espera, no la de 8 h");
});

Deno.test("incierto (se cortó después de mandar): reintentar, con uncertain = true", async () => {
  const b = await escenario();
  await correr(b, { respuesta: { tipo: "incierto", clase: "plazo", latenciaMs: 10_000 } }).corrida;
  const t = timbresDe(b)[0];
  assertEquals([t.state, t.uncertain, t.last_error, t.last_status_code], ["pending", true, "plazo", null]);
  assertEquals(ep(b).consecutive_failures, 1);
});

// ─── el presupuesto ──────────────────────────────────────────────────────────

Deno.test("sin presupuesto para mandar: el timbre queda pendiente para el turno siguiente, sin adelanto", async () => {
  const b = await escenario();
  const { corrida, envios } = correr(b, { fin: AHORA + 2_500 });
  assertEquals((await corrida).cuerpo.resultados, [{ id: EP, accion: "sin_tiempo" }]);
  assertEquals([envios.length, timbresDe(b)[0].state, timbresDe(b)[0].attempts, ep(b).consecutive_failures], [0, "pending", 0, 0]);
  assertEquals(ep(b).lease_until, null);
});

Deno.test("el plazo del envío sale del presupuesto (menos lo que se reserva para anotar)", async () => {
  const b = await escenario();
  const { corrida, envios } = correr(b, { fin: AHORA + 7_000 });
  await corrida;
  assertEquals(envios[0].plazoMs, 5_000);
  const b2 = await escenario();
  const r2 = correr(b2);
  await r2.corrida;
  assertEquals(r2.envios[0].plazoMs, 10_000);
  assertEquals(PRESUPUESTO_MS, 20_000);
});

// ─── la corrida entera ───────────────────────────────────────────────────────

Deno.test("sin los secretos: 503 y ni una consulta", async () => {
  const b = await escenario();
  const sinJwt = await correr(b, { sesionConfigurada: () => false }).corrida;
  assertEquals(sinJwt, { estado: 503, cuerpo: { ok: false, motivo: "sin_configurar" } });
  const sinKek = await correr(b, { entorno: () => undefined }).corrida;
  assertEquals(sinKek.estado, 503);
  assertEquals(b.llamadas, []);
});

Deno.test("dos agencias: se detiene TODO endpoint no detenido (respaldo del trigger) y no se reclama nada", async () => {
  const b = await escenario({ agencias: 2 });
  b.llaves.set(LLAVE2, { ...b.llaves.get(LLAVE)!, id: LLAVE2 });
  await agregarEndpoint(b, EP2, LLAVE2, { status: "paused", paused_at: AHORA * 1000, paused_by: PERSONA });
  const inf = await correr(b).corrida;
  assertEquals(inf.cuerpo.motivo, "varias_agencias");
  assertEquals([ep(b).disabled_reason, ep(b, EP2).disabled_reason], ["multi_agency", "multi_agency"]);
  assertEquals(b.llamadas, ["agencias", "detenerPorAgencias"]);
  // Sin saber cuántas hay: no se hace nada.
  const b2 = await escenario({ agencias: null });
  const inf2 = await correr(b2).corrida;
  assertEquals([inf2.cuerpo.motivo, ep(b2).status, b2.llamadas], ["agencias_sin_verificar", "active", ["agencias"]]);
});

Deno.test("sin nada que reclamar: 200 vacío; el reclamo que falla: 503", async () => {
  const b = await escenario({ sinEndpoint: true });
  assertEquals(await correr(b).corrida, { estado: 200, cuerpo: { ok: true, resultados: [] } });
  const b2 = await escenario({ falla: { reclamar: "error" } });
  assertEquals(await correr(b2).corrida, { estado: 503, cuerpo: { ok: false, motivo: "reclamo" } });
});

Deno.test("logs: solo la plantilla, sin la URL, el token, el cuerpo ni el secreto", async () => {
  const todas: string[] = [];
  for (const respuesta of [
    { tipo: "respuesta", estado: 204, retryAfterS: null, latenciaMs: 1 },
    { tipo: "respuesta", estado: 503, retryAfterS: null, latenciaMs: 1 },
    { tipo: "respuesta", estado: 410, retryAfterS: null, latenciaMs: 1 },
    { tipo: "incierto", clase: "cortado", latenciaMs: 1 },
  ] as Resultado[]) {
    const b = await escenario();
    const { corrida, logs } = correr(b, { respuesta });
    await corrida;
    todas.push(...logs, ...[...b.timbres.values()].map((t) => t.body));
  }
  const soloLogs = todas.filter((l) => l.startsWith("[messenger-webhooks]"));
  assert(soloLogs.length >= 4);
  for (const l of soloLogs) {
    assertMatch(l, /^\[messenger-webhooks\] [0-9a-f-]{36} [a-z_]+( [a-z_0-9]+)?( timbre [0-9a-f-]{36})?( intento \d+)?( [a-z_0-9]+)?( \d+ms)?$/);
    for (const prohibido of ["secreto123", "hooks.integrador.com", "whsec_", SECRETO, KEK, '"data"']) assert(!l.includes(prohibido), `${prohibido} en ${l}`);
  }
  assertEquals(lineaDeLog(null, "sin_configurar"), "[messenger-webhooks] - sin_configurar");
});

Deno.test("lineaDeLog: nada de texto libre, aunque alguien fuerce los tipos (un `as` o un String(err))", () => {
  const url = "https://hooks.integrador.com/x?token=secreto123";
  const l = lineaDeLog(url, "error" as never, { clase: `falló: ${url}` as never, timbre: `x ${url}`, envio: `http_503 ${url}`, intento: Number.NaN, ms: 1.6 });
  assert(!l.includes("secreto123") && !l.includes("hooks.integrador.com"), l);
  assertEquals(l, "[messenger-webhooks] ? error ? timbre ? intento ? ? 2ms");
});


// ─── lo que encontró la revisión por mutaciones ──────────────────────────────

/** Cinco endpoints listos (EP primero), todos con la misma llave. */
const CINCO = [EP, ...[1, 2, 3, 4].map((n) => `40000000-0000-4000-8000-0000000010${n}0`)];
async function cinco(o: Opciones = {}) {
  const b = await escenario(o);
  for (const id of CINCO.slice(1)) await agregarEndpoint(b, id, LLAVE, { next_attempt_at: AHORA * 1000 - 500 });
  return b;
}
const T_PEND = "70000000-0000-4000-8000-0000000000b1";
const pendiente = (b: BaseFalsa, attempts: number) =>
  b.timbres.set(T_PEND, {
    id: T_PEND, endpoint_id: EP, tenant_id: AGENCIA, event_type: "messages.created", body: '{"x":1}', message_count: 1,
    state: "pending", drop_reason: null, attempts, last_attempt_at: null, last_status_code: null, last_error: null,
    latency_ms: null, uncertain: false, created_at: AHORA * 1000, delivered_at: null,
  });
const R204: Resultado = { tipo: "respuesta", estado: 204, retryAfterS: null, latenciaMs: 1 };
const R503: Resultado = { tipo: "respuesta", estado: 503, retryAfterS: null, latenciaMs: 77 };
const escriturasEp = (b: BaseFalsa) => b.llamadas.filter((l) => l.startsWith("actualizarEndpoint") || l === "soltar");

Deno.test("la corrida: los topes que protegen a la base, y nunca vive más que su reclamo", () => {
  assertEquals(
    [PRESUPUESTO_MS, PLAZO_DESPUES_MS, RECLAMO_MAX, RECLAMO_S, EN_PARALELO, PAGINAS_POR_CORRIDA, MINIMO_PARA_LEER_MS, MINIMO_PARA_MANDAR_MS, MARGEN_ESCRITURA_MS, ESPERA_FALLA_PROPIA_MS],
    [20_000, 5_000, 5, 60, 4, 48, 2_000, 3_000, 2_000, 300_000],
  );
  // Lo más largo: el presupuesto, más hasta tres escrituras de después (timbre, endpoint, soltar).
  assert(PRESUPUESTO_MS + 3 * PLAZO_DESPUES_MS < RECLAMO_S * 1000);
});

Deno.test("reclama RECLAMO_MAX por RECLAMO_S y atiende de a EN_PARALELO", async () => {
  const b = await cinco();
  await agregarEndpoint(b, "40000000-0000-4000-8000-000000001050", LLAVE, { next_attempt_at: AHORA * 1000 - 400 });
  let pedido: number[] = [];
  const reclamar = b.datos.reclamar;
  b.datos.reclamar = (m, s) => ((pedido = [m, s]), reclamar(m, s));
  let enVuelo = 0, maximo = 0;
  const { corrida } = correr(b, {
    leerFeed: async () => {
      maximo = Math.max(maximo, ++enVuelo);
      await new Promise((r) => setTimeout(r, 5));
      enVuelo--;
      return pagina(0, SIGUIENTE, false);
    },
  });
  const r = (await corrida).cuerpo.resultados!;
  assertEquals(pedido, [5, 60]);
  assertEquals(r.length, 5, "6 listos, 5 reclamados");
  assertEquals(maximo, 4, "de a 4, ni 1 ni todos");
});

Deno.test("el pedido al feed: el vencimiento de la llave y hasta el fin del presupuesto", async () => {
  const b = await escenario();
  const { corrida, feed } = correr(b);
  await corrida;
  const p = feed.pedidos[0];
  assertEquals(p.venceEl, b.llaves.get(LLAVE)!.expires_at, "sin venceEl el feed contesta 403 y el endpoint se detiene por config_error");
  assertEquals(p.hastaMs, AHORA + PRESUPUESTO_MS);
});

Deno.test("el cuerpo: key_prefix de la llave, created_at del intento y has_more; la página llena con más por delante es la del timbre", async () => {
  const b = await escenario();
  const c1 = cursor(enUs(AHORA - 4 * 60_000), MAXI);
  const { corrida, feed } = correr(b, { paginas: [pagina(100, c1, true), pagina(0, SIGUIENTE, false)] });
  assertEquals((await corrida).cuerpo.resultados, [{ id: EP, accion: "entregado" }]);
  assertEquals(feed.pedidos.length, 1, "no se sigue leyendo más allá de la página con mensajes");
  const cuerpo = JSON.parse(timbresDe(b)[0].body);
  assertEquals([cuerpo.key_prefix, cuerpo.created_at, cuerpo.data.count, cuerpo.data.has_more], ["mvk_live_ab12cd", new Date(AHORA).toISOString(), 100, true]);
  assertEquals([cuerpo.data.after, cuerpo.data.until], [feed.pedidos[0].despues, c1]);
});

Deno.test("la firma lleva la hora del intento (la ventana del receptor es de 5 min)", async () => {
  const b = await escenario();
  const { corrida, envios } = correr(b);
  await corrida;
  assertEquals(envios[0].encabezados["webhook-timestamp"], String(Math.floor(AHORA / 1000)));
});

Deno.test("al día: UNA lectura del feed y UNA escritura (la que suelta); reintentar y esperar tampoco sueltan aparte", async () => {
  const b = await escenario();
  const { corrida, feed } = correr(b, { paginas: [pagina(0, SIGUIENTE, false)] });
  assertEquals((await corrida).cuerpo.resultados, [{ id: EP, accion: "al_dia" }]);
  assertEquals(feed.pedidos.length, 1, "al día no se vuelve a leer");
  assertEquals(escriturasEp(b), ["actualizarEndpoint:despues"], "la del cursor va con el plazo de las escrituras finales");
  const b2 = await escenario();
  await correr(b2, { respuesta: R503 }).corrida;
  assertEquals(escriturasEp(b2), ["actualizarEndpoint:antes", "actualizarEndpoint:despues"]);
  const b3 = await escenario({ falla: { llave: "error" } });
  await correr(b3).corrida;
  assertEquals(escriturasEp(b3), ["actualizarEndpoint:despues"], "la espera: una escritura, con el plazo de después");
});

Deno.test("presupuesto: con menos de MINIMO_PARA_LEER no se toca ni la llave; con lo reservado justo se manda con MINIMO_PARA_MANDAR", async () => {
  const b = await escenario();
  assertEquals((await correr(b, { fin: AHORA + 1_999 }).corrida).cuerpo.resultados, [{ id: EP, accion: "sin_tiempo" }]);
  assert(!b.llamadas.includes("llave"), "ni una consulta con el tiempo agotado");
  assertEquals(ep(b).lease_until, null);
  const b2 = await escenario();
  const { corrida, envios } = correr(b2, { fin: AHORA + MARGEN_ANOTAR_MS + MARGEN_ESCRITURA_MS + MINIMO_PARA_MANDAR_MS });
  await corrida;
  assertEquals(envios.map((e) => e.plazoMs), [MINIMO_PARA_MANDAR_MS + MARGEN_ANOTAR_MS]);
});

Deno.test("el feed deja de leer cuando el presupuesto baja de MINIMO_PARA_LEER, y guarda lo avanzado sin espera", async () => {
  const b = await escenario();
  let k = 0;
  const { corrida, feed } = correr(b, {
    fin: AHORA + 5_500,
    paginas: () => (b.pasar(1_000), pagina(0, cursor(enUs(AHORA - 5 * 60_000 + ++k * 1_000), MAXI), true)),
  });
  assertEquals((await corrida).cuerpo.resultados, [{ id: EP, accion: "cursor" }]);
  assertEquals(feed.pedidos.length, 4);
  assertEquals([ep(b).last_error, ep(b).lease_until, deMicros(ep(b).cursor_at!)], [null, null, deMicros(aMicros(enUs(AHORA - 5 * 60_000 + 4_000), 0))]);
});

Deno.test("freno: la primera falla de la BASE (lectura o escritura) hace que no se empiece ningún endpoint más; una forma rara no frena", async () => {
  const casos: Array<[string, Opciones, PaginaDelFeed[] | undefined]> = [
    ["llave", { falla: { llave: "error" } }, undefined],
    ["vigencia", { falla: { llaveVigente: "error" } }, undefined],
    ["pendiente", { falla: { timbrePendiente: "error" } }, undefined],
    ["timbrar", { falla: { timbrar: "error" } }, undefined],
    ["marca del intento", { falla: { anotarTimbre: "error" } }, undefined],
    ["escritura del cursor", { falla: { actualizarEndpoint: "error" } }, [pagina(0, SIGUIENTE, false)]],
    ["feed: sesion", {}, [{ ok: false, permanente: false, falla: "sesion" }]],
    ["feed: base", {}, [{ ok: false, permanente: false, falla: "base" }]],
    ["feed: plazo", {}, [{ ok: false, permanente: false, falla: "plazo" }]],
  ];
  for (const [nombre, o, paginas] of casos) {
    const b = await cinco(o);
    const r = (await correr(b, { paginas }).corrida).cuerpo.resultados!;
    const frenados = r.filter((x) => x.accion === "freno");
    assertEquals(frenados.length, 1, `${nombre}: ${r.map((x) => x.accion)}`);
    const f = ep(b, frenados[0].id);
    assert(f.lease_until !== null && f.last_error === null, `${nombre}: el frenado queda reclamado y sin escribir`);
  }
  const b = await cinco();
  const r = (await correr(b, { paginas: [{ ok: false, permanente: false, falla: "forma" }] }).corrida).cuerpo.resultados!;
  assertEquals(r.filter((x) => x.accion === "freno").length, 0, "forma no es la base");
});

Deno.test("una escritura que falla por la base NO suelta el reclamo (60 s de espera, no el turno siguiente)", async () => {
  const casos: Array<[string, () => Promise<BaseFalsa>, PaginaDelFeed[] | undefined]> = [
    ["detención", async () => {
      const b = await escenario({ falla: { actualizarEndpoint: "error" } });
      b.llaves.get(LLAVE)!.revoked_at = "2026-09-25T00:00:00Z";
      return b;
    }, undefined],
    ["cursor", () => escenario({ falla: { actualizarEndpoint: "error" } }), [pagina(0, SIGUIENTE, false)]],
    ["adelanto", () => escenario({ falla: { actualizarEndpoint: "error" } }), undefined],
    ["la espera de una excepción", () => escenario({ falla: { timbrePendiente: "tira", actualizarEndpoint: "tira" } }), undefined],
  ];
  for (const [nombre, armar, paginas] of casos) {
    const b = await armar();
    const { corrida, envios } = correr(b, { paginas });
    await corrida;
    assert(ep(b).lease_until !== null, `${nombre}: sigue reclamado`);
    assert(!b.llamadas.includes("soltar"), `${nombre}: sin soltar`);
    assertEquals(envios.length, 0, nombre);
  }
});

Deno.test("si el intento no quedó anotado ANTES (adelanto o marca con error de base), no se manda", async () => {
  for (const falla of ["actualizarEndpoint", "anotarTimbre"] as const) {
    const b = await escenario({ falla: { [falla]: "error" } });
    const { corrida, envios } = correr(b);
    assertEquals([envios.length, (await corrida).cuerpo.resultados![0].accion], [0, "error"], falla);
  }
});

Deno.test("el adelanto deja la espera del escalón que toca: si la corrida muere mandando, el backoff igual crece", async () => {
  const b = await escenario({ ep: { consecutive_failures: 2, failing_since: (AHORA - 3_600_000) * 1000 } });
  pendiente(b, 2);
  let foto: FilaEp | null = null;
  await correr(b, { respuesta: () => ((foto = { ...ep(b) }), Promise.resolve(R204)) }).corrida;
  assertEquals((foto as unknown as FilaEp).next_attempt_at, (AHORA + 600_000) * 1000, "tercer fallo: 10 min, no 30 s");
});

Deno.test("Retry-After más largo que el escalón manda (hasta 1 h)", async () => {
  const b = await escenario();
  await correr(b, { respuesta: { tipo: "respuesta", estado: 429, retryAfterS: 1_800, latenciaMs: 1 } }).corrida;
  assertEquals(ep(b).next_attempt_at, (AHORA + 1_800_000) * 1000);
});

Deno.test("un timbre NUEVO con la racha vieja de MÁS de 72 h no se detiene: el horizonte es el de la racha nueva", async () => {
  const b = await escenario({ ep: { consecutive_failures: 15, failing_since: (AHORA - 73 * 3_600_000) * 1000 } });
  const r = (await correr(b, { respuesta: R503 }).corrida).cuerpo.resultados;
  assertEquals(r, [{ id: EP, accion: "reintentar" }]);
  assertEquals([ep(b).status, ep(b).consecutive_failures, timbresDe(b)[0].state], ["active", 1, "pending"]);
});

Deno.test("después de un 503 quedan la latencia y la hora del intento, en el timbre y en el endpoint", async () => {
  const b = await escenario();
  await correr(b, { respuesta: R503 }).corrida;
  const t = timbresDe(b)[0];
  assertEquals([t.latency_ms, t.last_attempt_at, ep(b).last_attempt_at], [77, AHORA * 1000, AHORA * 1000]);
});

Deno.test("una lectura buena limpia el maven_* aunque la corrida no llegue a mandar", async () => {
  const b = await escenario({ ep: { last_error: "maven_base" } });
  await correr(b, { fin: AHORA + 2_500 }).corrida;
  assertEquals([ep(b).last_error, timbresDe(b).length], [null, 1]);
});

Deno.test("página con mensajes y un cursor ilegible, o un cuerpo que no se arma: espera de 5 min con su clase", async () => {
  for (const [pag, clase] of [[pagina(1, "no-es-un-cursor"), "maven_forma"], [pagina(101, SIGUIENTE), "maven_cuerpo"]] as const) {
    const b = await escenario();
    await correr(b, { paginas: [pag] }).corrida;
    assertEquals([ep(b).last_error, ep(b).next_attempt_at, timbresDe(b).length], [clase, (AHORA + ESPERA_FALLA_PROPIA_MS) * 1000, 0], clase);
  }
});

Deno.test("agencias que TIRA: no se sabe cuántas hay → no se reclama nada; reclamar que tira → 503", async () => {
  const b = await escenario({ falla: { agencias: "tira" } });
  const inf = await correr(b).corrida;
  assertEquals([inf.cuerpo.motivo, b.llamadas], ["agencias_sin_verificar", ["agencias"]]);
  const b2 = await escenario({ falla: { reclamar: "tira" } });
  assertEquals((await correr(b2).corrida).estado, 503);
});

Deno.test("motivoDeLlave: vence justo ahora = vencida; llave de OTRA agencia = config_error", () => {
  const k = b0Llave();
  const e = { tenant_id: AGENCIA, acts_as_user_id: PERSONA } as Endpoint;
  assertEquals(motivoDeLlave(k, e, AHORA), null);
  assertEquals(motivoDeLlave({ ...k, expires_at: new Date(AHORA).toISOString() }, e, AHORA), "key_expired");
  assertEquals(motivoDeLlave({ ...k, tenant_id: "99999999-0000-4000-8000-000000000000" }, e, AHORA), "config_error");
  assertEquals(motivoDeLlave({ ...k, ip_whitelist: null }, e, AHORA), "config_error");
});
function b0Llave() {
  return {
    id: LLAVE, tenant_id: AGENCIA, key_prefix: "mvk_live_ab12cd", scopes: ["messenger:read"],
    expires_at: new Date(AHORA + 1).toISOString(), revoked_at: null, acts_as_user_id: PERSONA, ip_whitelist: ["1.2.3.4"],
  };
}

Deno.test("el informe y los logs dicen lo que pasó", async () => {
  // Espera que perdió la guarda = perdio; detención que no se pudo escribir = error.
  const b = await escenario({ falla: { llave: "error" }, antes: { actualizarEndpoint: (x) => void (x.endpoints.get(EP)!.cursor_id = MAXI) } });
  assertEquals((await correr(b).corrida).cuerpo.resultados, [{ id: EP, accion: "perdio" }]);
  const b2 = await escenario({ falla: { actualizarEndpoint: "error" } });
  b2.llaves.get(LLAVE)!.revoked_at = "2026-09-25T00:00:00Z";
  assertEquals((await correr(b2).corrida).cuerpo.resultados, [{ id: EP, accion: "error" }]);
  // Cada dato en su lugar.
  assertEquals(
    lineaDeLog(EP, "reintentar", { clase: "anotacion", timbre: "70000000-0000-4000-8000-0000000000c1", intento: 3, envio: 503, ms: 12 }),
    `[messenger-webhooks] ${EP} reintentar anotacion timbre 70000000-0000-4000-8000-0000000000c1 intento 3 503 12ms`,
  );
  const b3 = await escenario();
  const r3 = correr(b3);
  await r3.corrida;
  assertEquals(r3.logs, [`[messenger-webhooks] ${EP} entregado timbre 60000000-0000-4000-8000-000000000001 intento 1 204 40ms`]);
  const b4 = await escenario({ agencias: 2 });
  const r4 = correr(b4);
  await r4.corrida;
  assertEquals(r4.logs, ["[messenger-webhooks] - multi_agency varias_agencias"]);
});


Deno.test("el envío nunca sale con un plazo que no alcanza: o sale con ≥ 3 s, o queda para el turno siguiente", async () => {
  // Sin lo reservado para las dos escrituras previas: ni se anota el intento.
  const a = await escenario();
  const ra = correr(a, { fin: AHORA + MARGEN_ANOTAR_MS + MARGEN_ESCRITURA_MS + MINIMO_PARA_MANDAR_MS - 1 });
  assertEquals((await ra.corrida).cuerpo.resultados, [{ id: EP, accion: "sin_tiempo" }]);
  assertEquals([ra.envios.length, timbresDe(a)[0].attempts, ep(a).consecutive_failures], [0, 0, 0]);
  // Las escrituras previas se comen lo reservado (la base lenta): no se manda con 2,5 s;
  // el adelanto ya dejó la espera.
  const b = await escenario({ antes: { actualizarEndpoint: (x) => x.pasar(2_000) } });
  const rb = correr(b, { fin: AHORA + 6_500 });
  assertEquals((await rb.corrida).cuerpo.resultados, [{ id: EP, accion: "sin_tiempo" }]);
  assertEquals([rb.envios.length, ep(b).lease_until, ep(b).next_attempt_at > b.reloj.us], [0, null, true]);
  // Con tiempo: sale con lo que queda menos lo de las escrituras de después.
  const c = await escenario({ antes: { actualizarEndpoint: (x) => x.pasar(2_000) } });
  const rc = correr(c, { fin: AHORA + 9_000 });
  await rc.corrida;
  assertEquals(rc.envios.map((e) => e.plazoMs), [5_000]);
});
