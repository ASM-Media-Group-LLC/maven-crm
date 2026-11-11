// El despachador de los avisos del equipo (./equipo.ts) con una base y un envío de
// mentira: qué se anota con cada resultado, que la firma es la de Standard Webhooks y
// que los logs no llevan la URL, el cuerpo ni el secreto. Las reglas de la base
// (reclamar, anotar, detener, la ventana) se prueban en supabase/tests/agencias_conectadas.ts.
// Correr: deno test --allow-read --no-check supabase/functions/messenger-webhooks/equipo.test.ts

import { assert, assertEquals } from "jsr:@std/assert";
import { firmar, type Resultado } from "../_shared/webhook-salida.ts";
import {
  type Anotacion,
  type DatosEquipo,
  despacharEquipo,
  type EntregaReclamada,
  lineaDeLogEquipo,
  MINIMO_PARA_MANDAR_MS,
} from "./equipo.ts";

const SECRETO = "whsec_" + btoa(String.fromCharCode(...new Uint8Array(48).map((_, i) => i + 1)));
const URL_SECRETA = "https://hooks.plataforma.io/eventos/token-secreto";
const ID = (n: number) => `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const entrega = (n: number, extra: Partial<EntregaReclamada> = {}): EntregaReclamada => ({
  id: ID(n),
  webhook_id: ID(100 + n),
  tenant_id: ID(200),
  evento: "equipo.rol_cambio",
  url: URL_SECRETA,
  cuerpo: JSON.stringify({ id: ID(n), type: "equipo.rol_cambio", data: { correo: "ana@kash.test" } }),
  intento: 1,
  secreto: SECRETO,
  reclamo: "2026-11-11T15:00:00.123456+00:00",
  ...extra,
});

function base(reclamadas: EntregaReclamada[] | null, respuestaAnotar: "ok" | "perdio" | null = "ok") {
  const anotadas: Anotacion[] = [];
  const datos: DatosEquipo = {
    reclamar: () => Promise.resolve(reclamadas),
    anotar: (a) => {
      anotadas.push(a);
      return Promise.resolve(respuestaAnotar);
    },
  };
  return { datos, anotadas };
}

type Envio = { href: string; cuerpo: string; encabezados: Record<string, string>; plazoMs?: number };
function envio(resultado: Resultado) {
  const enviados: Envio[] = [];
  const enviar = (e: Envio) => {
    enviados.push(e);
    return Promise.resolve(resultado);
  };
  return { enviar, enviados };
}

const AHORA = 1_762_873_200_000;

Deno.test("equipo: un 2xx se anota entregado, con el mismo reclamo, y va firmado (Standard Webhooks)", async () => {
  const { datos, anotadas } = base([entrega(1)]);
  const { enviar, enviados } = envio({ tipo: "respuesta", estado: 204, retryAfterS: null, latenciaMs: 80 });
  const logs: string[] = [];
  const r = await despacharEquipo({ datos, enviar: enviar as never, fin: AHORA + 20_000, ahora: () => AHORA, log: (l) => logs.push(l) });
  assertEquals(r.estado, 200);
  assertEquals(r.cuerpo.resultados, [{ id: ID(1), accion: "entregado" }]);
  assertEquals(enviados.length, 1);
  assertEquals(enviados[0].href, URL_SECRETA);
  assertEquals(enviados[0].cuerpo, entrega(1).cuerpo, "los bytes que se guardaron, tal cual");
  const h = enviados[0].encabezados;
  assertEquals(h["webhook-id"], ID(1));
  assertEquals(h["webhook-timestamp"], String(Math.floor(AHORA / 1000)));
  assertEquals(h["webhook-signature"], await firmar(SECRETO, ID(1), Math.floor(AHORA / 1000), entrega(1).cuerpo));
  assertEquals(anotadas, [{
    id: ID(1), reclamo: entrega(1).reclamo, accion: "entregado", codigo: 204, error: null, incierto: false,
    reintentarEnS: null, latenciaMs: 80, motivo: null,
  }]);
  for (const l of logs) {
    assert(!l.includes("hooks.plataforma.io") && !l.includes("token-secreto") && !l.includes("whsec_") && !l.includes("ana@kash.test"),
      `un log con la URL, el secreto o el cuerpo: ${l}`);
  }
});

Deno.test("equipo: 410 la detiene (receiver_gone); 5xx con Retry-After, reintentar; incierto se dice", async () => {
  const casos: [Resultado, Partial<Anotacion>, string][] = [
    [{ tipo: "respuesta", estado: 410, retryAfterS: null, latenciaMs: 5 }, { accion: "detener", motivo: "receiver_gone", codigo: 410 }, "detenido"],
    [{ tipo: "respuesta", estado: 503, retryAfterS: 120, latenciaMs: 5 }, { accion: "reintentar", reintentarEnS: 120, codigo: 503, error: "http_503" }, "reintentar"],
    [{ tipo: "incierto", clase: "plazo", latenciaMs: 9_000 }, { accion: "reintentar", incierto: true, codigo: null, error: "plazo" }, "reintentar"],
    [{ tipo: "sin_enviar", clase: "host_prohibido", latenciaMs: 0 }, { accion: "detener", motivo: "config_error" }, "detenido"],
    [{ tipo: "sin_enviar", clase: "dns", latenciaMs: 0 }, { accion: "reintentar", incierto: false, error: "dns" }, "reintentar"],
  ];
  for (const [resultado, esperado, accion] of casos) {
    const { datos, anotadas } = base([entrega(2)]);
    const { enviar } = envio(resultado);
    const r = await despacharEquipo({ datos, enviar: enviar as never, fin: AHORA + 20_000, ahora: () => AHORA, log: () => {} });
    assertEquals(r.cuerpo.resultados?.[0].accion, accion, JSON.stringify(resultado));
    for (const [k, v] of Object.entries(esperado)) assertEquals(anotadas[0][k as keyof Anotacion], v, `${JSON.stringify(resultado)} ${k}`);
  }
});

Deno.test("equipo: sin secreto no se manda (se detiene); sin tiempo no se manda (ya quedó la espera)", async () => {
  const sinSecreto = base([entrega(3, { secreto: null })]);
  const e1 = envio({ tipo: "respuesta", estado: 200, retryAfterS: null, latenciaMs: 1 });
  const r1 = await despacharEquipo({ datos: sinSecreto.datos, enviar: e1.enviar as never, fin: AHORA + 20_000, ahora: () => AHORA, log: () => {} });
  assertEquals(e1.enviados.length, 0);
  assertEquals(sinSecreto.anotadas[0].accion, "detener");
  assertEquals(sinSecreto.anotadas[0].motivo, "config_error");
  assertEquals(r1.cuerpo.resultados?.[0].accion, "detenido");

  const sinTiempo = base([entrega(4)]);
  const e2 = envio({ tipo: "respuesta", estado: 200, retryAfterS: null, latenciaMs: 1 });
  const r2 = await despacharEquipo({ datos: sinTiempo.datos, enviar: e2.enviar as never, fin: AHORA + MINIMO_PARA_MANDAR_MS - 1, ahora: () => AHORA, log: () => {} });
  assertEquals(e2.enviados.length, 0);
  assertEquals(sinTiempo.anotadas.length, 0);
  assertEquals(r2.cuerpo.resultados?.[0].accion, "sin_tiempo");
});

Deno.test("equipo: la base no reclama → 503; anotar perdió o falló → se dice así, sin tirar", async () => {
  const caida = await despacharEquipo({ datos: base(null).datos, fin: AHORA + 20_000, ahora: () => AHORA, log: () => {} });
  assertEquals(caida, { estado: 503, cuerpo: { ok: false, motivo: "reclamo" } });
  const vacia = await despacharEquipo({ datos: base([]).datos, fin: AHORA + 20_000, ahora: () => AHORA, log: () => {} });
  assertEquals(vacia, { estado: 200, cuerpo: { ok: true, resultados: [] } });
  for (const [respuesta, accion] of [["perdio", "perdio"], [null, "error"]] as const) {
    const { datos } = base([entrega(5)], respuesta);
    const { enviar } = envio({ tipo: "respuesta", estado: 200, retryAfterS: null, latenciaMs: 1 });
    const r = await despacharEquipo({ datos, enviar: enviar as never, fin: AHORA + 20_000, ahora: () => AHORA, log: () => {} });
    assertEquals(r.cuerpo.resultados?.[0].accion, accion);
  }
  const tira: DatosEquipo = { reclamar: () => Promise.reject(new Error("x")), anotar: () => Promise.reject(new Error("x")) };
  assertEquals((await despacharEquipo({ datos: tira, fin: AHORA + 20_000, log: () => {} })).estado, 503);
});

Deno.test("equipo: los logs solo llevan ids, acciones y clases (un texto raro sale como ?)", () => {
  assertEquals(lineaDeLogEquipo(ID(1), "entregado", { intento: 2, envio: 204, ms: 80.4 }), `[messenger-webhooks equipo] ${ID(1)} entregado intento 2 204 80ms`);
  assertEquals(lineaDeLogEquipo("https://x.io/a", "error", { envio: "http_500 cuerpo" }), "[messenger-webhooks equipo] ? error ?");
});
