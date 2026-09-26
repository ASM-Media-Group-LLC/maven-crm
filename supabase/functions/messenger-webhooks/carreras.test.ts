// Carreras contra la base: lo que pasa cuando una escritura no llega (la base no
// contestó a tiempo, o el runtime cortó la corrida en ese punto). Salieron de la
// revisión del código del PR 4: todos eran rojos sobre a239d460.
// Correr: deno test --allow-read --no-lock supabase/functions/messenger-webhooks/carreras.test.ts
import { assert, assertEquals } from "jsr:@std/assert";
import { type Envio, type Resultado, sellarSecreto } from "../_shared/webhook-salida.ts";
import { codificarCursor } from "../public-api/messenger-formato.ts";
import { type BaseFalsa, crearBaseFalsa, deMicros, feedFalso, type FilaEp, type Opciones } from "./base-falsa.ts";
import { type DatosDespacho, despachar, type Entorno } from "./despachador.ts";
import type { PaginaDelFeed } from "./feed.ts";

const AHORA = Date.parse("2026-09-26T12:00:00Z");
const AGENCIA = "10000000-0000-4000-8000-000000000001";
const PERSONA = "20000000-0000-4000-8000-000000000002";
const LLAVE = "30000000-0000-4000-8000-000000000003";
const EP = "40000000-0000-4000-8000-000000000004";
const CONV = "50000000-0000-4000-8000-000000000007";
const KEK = "k".repeat(40);
const ENTORNO = (v: string) => (v === "WEBHOOK_SIGNING_KEK" ? KEK : undefined);
const SECRETO = "whsec_" + btoa("s".repeat(33));
const URL_INTEGRADOR = "https://hooks.integrador.com/maven?token=secreto123";
const CERO = "00000000-0000-0000-0000-000000000000";
const MAXI = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const enUs = (ms: number, extraUs = 0) => deMicros(ms * 1000 + extraUs);
const cursor = (t: string, i = CERO) => codificarCursor({ t, i });

async function escenario(o: Opciones & { ep?: Partial<FilaEp> } = {}) {
  const b = crearBaseFalsa(AHORA, o);
  b.llaves.set(LLAVE, {
    id: LLAVE, tenant_id: AGENCIA, key_prefix: "mvk_live_ab12cd", scopes: ["messenger:read"],
    expires_at: new Date(AHORA + 30 * 86_400_000).toISOString(), revoked_at: null, acts_as_user_id: PERSONA,
    ip_whitelist: ["1.2.3.4"],
  });
  const sellado = (await sellarSecreto(SECRETO, EP, ENTORNO))!;
  b.endpoints.set(EP, {
    id: EP, tenant_id: AGENCIA, api_key_id: LLAVE, acts_as_user_id: PERSONA, url: URL_INTEGRADOR, exclude_own: true,
    status: "active", disabled_reason: null, disabled_at: null, paused_at: null, paused_by: null,
    secret_cipher: sellado.cipher, secret_nonce: sellado.nonce, secret_key_version: sellado.version,
    cursor_at: (AHORA - 5 * 60_000) * 1000 + 456, cursor_id: CERO, lease_until: null, next_attempt_at: (AHORA - 1_000) * 1000,
    consecutive_failures: 0, failing_since: null, last_attempt_at: null, last_success_at: null, last_status_code: null,
    last_error: null, ...o.ep,
  });
  return b;
}
const pagina = (cantidad: number, siguiente: string, hayMas = false): PaginaDelFeed =>
  ({ ok: true, cantidad, conversaciones: cantidad ? [CONV] : [], siguiente, hayMas });

function correr(b: BaseFalsa, extra: Partial<Entorno> & { respuesta?: Resultado; paginas?: (p: unknown, n: number) => PaginaDelFeed } = {}) {
  const envios: Envio[] = [];
  const feed = feedFalso(extra.paginas ?? (() => pagina(3, cursor(enUs(b.ahoraMs() - 10_000), MAXI))));
  let n = 0;
  const e: Entorno = {
    datos: b.datos, leerFeed: feed.leer, sesionConfigurada: () => true, entorno: ENTORNO, ahora: b.ahoraMs,
    uuid: () => `60000000-0000-4000-8000-${String(++n + Math.floor(Math.random() * 1e6)).padStart(12, "0")}`,
    azar: () => 0.5, log: () => {},
    enviar: (env: Envio) => (envios.push(env), Promise.resolve(extra.respuesta ?? { tipo: "respuesta", estado: 204, retryAfterS: null, latenciaMs: 40 })),
    ...extra,
  };
  return { corrida: despachar(e), envios, feed };
}
const ep = (b: BaseFalsa) => b.endpoints.get(EP)!;
const pendienteDe72h = (b: BaseFalsa) => b.timbres.set("70000000-0000-4000-8000-000000000002", {
  id: "70000000-0000-4000-8000-000000000002", endpoint_id: EP, tenant_id: AGENCIA, event_type: "messages.created",
  body: "{}", message_count: 1, state: "pending", drop_reason: null, attempts: 15, last_attempt_at: null,
  last_status_code: 503, last_error: "http_503", latency_ms: 5, uncertain: false, created_at: AHORA * 1000, delivered_at: null,
});

/** Envuelve la base: `falla(metodo, fase, cambios)` true = esa escritura da error
 *  (la base no contestó a tiempo, o la corrida se murió ahí). */
function conFalla(b: BaseFalsa, falla: (m: "actualizarEndpoint" | "anotarTimbre", fase: string, c: Record<string, unknown>) => boolean): DatosDespacho {
  const d = b.datos;
  return {
    ...d,
    actualizarEndpoint: (g, c, f) => (falla("actualizarEndpoint", f, c) ? Promise.resolve(null) : d.actualizarEndpoint(g, c, f)),
    anotarTimbre: (id, t, c, f) => (falla("anotarTimbre", f, c) ? Promise.resolve(null) : d.anotarTimbre(id, t, c, f)),
  };
}

// ─── 1. 72 h: descarte ANTES de detener → si la detención no se escribe, la racha se reinicia ───
Deno.test("72 h fallando + la detención no llega a escribirse: el turno siguiente NO puede arrancar otra racha de 72 h", async () => {
  const b = await escenario({ ep: { consecutive_failures: 15, failing_since: (AHORA - 73 * 3_600_000) * 1000 } });
  pendienteDe72h(b);
  // La detención (escritura final 'despues' con status disabled) no llega: timeout de 5 s o la corrida muerta.
  const datos = conFalla(b, (m, f, c) => m === "actualizarEndpoint" && f === "despues" && c.status === "disabled");
  await correr(b, { datos, respuesta: { tipo: "respuesta", estado: 503, retryAfterS: null, latenciaMs: 5 } }).corrida;
  // Turno siguiente: venció el reclamo y la espera del adelanto; llegaron mensajes nuevos; el receptor sigue caído.
  b.pasar(9 * 3_600_000);
  await correr(b, { respuesta: { tipo: "respuesta", estado: 503, retryAfterS: null, latenciaMs: 5 } }).corrida;
  const f = ep(b);
  assertEquals([f.status, f.disabled_reason], ["disabled", "receiver_failing"],
    `quedó ${f.status}, racha ${f.consecutive_failures}, failing_since hace ${(b.ahoraMs() - (f.failing_since ?? 0) / 1000) / 3_600_000} h`);
});

Deno.test("410 + la detención no llega a escribirse: el turno siguiente no le vuelve a mandar un timbre NUEVO a un receptor Gone", async () => {
  const b = await escenario();
  const datos = conFalla(b, (m, f, c) => m === "actualizarEndpoint" && f === "despues" && c.status === "disabled");
  const r1 = correr(b, { datos, respuesta: { tipo: "respuesta", estado: 410, retryAfterS: null, latenciaMs: 5 } });
  await r1.corrida;
  b.pasar(120_000);
  const r2 = correr(b, { respuesta: { tipo: "respuesta", estado: 410, retryAfterS: null, latenciaMs: 5 } });
  await r2.corrida;
  const ids = [...r1.envios, ...r2.envios].map((e) => e.encabezados["webhook-id"]);
  assertEquals(new Set(ids).size, 1, `se mandaron ${ids.length} envíos con ${new Set(ids).size} timbres distintos`);
  assertEquals([ep(b).status, ep(b).disabled_reason], ["disabled", "receiver_gone"]);
});

// ─── 2. el plazo del envío: está en despachador.test.ts ("o sale con ≥ 3 s, o queda
// para el turno siguiente"): se eligió no mandar si no alcanza, en vez de mandar con 1 s.

// ─── 3. lo caminado en vacío se pierde si la página con mensajes llega sin tiempo ───
Deno.test("páginas vacías caminadas y la de mensajes llega con < 2 s: lo caminado se guarda (no se relee todo el turno siguiente)", async () => {
  const b = await escenario({ ep: { cursor_at: (AHORA - 40 * 3_600_000) * 1000 + 456 } });
  const hora = (k: number) => cursor(enUs(AHORA - 40 * 3_600_000 + k * 3_600_000), MAXI);
  // 30 horas vacías (0,6 s cada una) y después una con mensajes.
  const paginas = (_: unknown, n: number) => {
    b.pasar(600);
    return n < 30 ? pagina(0, hora(n + 1), true) : pagina(2, hora(n + 1), true);
  };
  const r = correr(b, { paginas, fin: AHORA + 20_000 });
  const inf = await r.corrida;
  const guardado = deMicros(ep(b).cursor_at!);
  assert(guardado !== enUs(AHORA - 40 * 3_600_000, 456),
    `acción ${JSON.stringify(inf.cuerpo.resultados)}, ${r.feed.pedidos.length} páginas leídas y el cursor guardado sigue en ${guardado}`);
});

Deno.test("el loop sale por tiempo en una página vacía: la escritura que guarda lo caminado va con el plazo propio (no con el sobrante < 1 s)", async () => {
  const b = await escenario({ ep: { cursor_at: (AHORA - 40 * 3_600_000) * 1000 + 456 } });
  const hora = (k: number) => cursor(enUs(AHORA - 40 * 3_600_000 + k * 3_600_000), MAXI);
  const paginas = (_: unknown, n: number) => (b.pasar(700), pagina(0, hora(n + 1), true));
  let fase = "";
  let sobrante = NaN;
  const d = b.datos;
  const fin = AHORA + 20_000;
  const datos: DatosDespacho = {
    ...d,
    actualizarEndpoint: (g, c, f) => ("cursor_at" in c && ((fase = f), (sobrante = Math.min(Math.max(fin - b.ahoraMs() - 1_000, 500), 5_000))), d.actualizarEndpoint(g, c, f)),
  };
  await correr(b, { datos, paginas, fin }).corrida;
  assertEquals(fase, "despues", `fue en '${fase}': con index.ts ese pedido se corta a los ${sobrante} ms`);
});
