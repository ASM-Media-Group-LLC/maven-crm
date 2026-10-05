// send-notification-email: el modo servidor sigue igual; desde el navegador solo
// plantillas fijas, a cuentas de la misma agencia, con tope y sin devolver correos.
//
//   deno test supabase/functions/send-notification-email/logica.test.ts
//
// Sin red: los puertos son dobles. Las dos RPC de verdad
// (correo_destinatarios_de_agencia y correo_navegador_turno) se prueban en
// supabase/tests/seguridad_archivos.ts.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  type DatosEvaluacion,
  type DatosQaChatter,
  type DatosQaCloser,
  type Envio,
  esCredencialDeServidor,
  manejar,
  type Puertos,
} from "./logica.ts";

const KASH = "t-kash", OTRA = "t-otra";
const U = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ANA = U(1), BETO = U(2), CLARA = U(3), OLGA = U(11);
const CUENTAS = [
  { id: ANA, email: "ana@maven-ai.me", tenant: KASH },
  { id: BETO, email: "beto@maven-ai.me", tenant: KASH },
  { id: CLARA, email: "clara@maven-ai.me", tenant: KASH },
  { id: OLGA, email: "olga@otra.test", tenant: OTRA },
];
const SESIONES: Record<string, string> = { "jwt-ana": ANA, "jwt-olga": OLGA };
const EV = "e0000000-0000-4000-8000-000000000001", CALL = "c0000000-0000-4000-8000-000000000001";
const REP = "f0000000-0000-4000-8000-000000000001";

const jwt = (claims: Record<string, unknown>) =>
  `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(claims)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}.firma`;

function datosEvaluacion(config: string[]): DatosEvaluacion {
  return {
    evaluacion: {
      id: EV, created_at: "2026-10-01T10:00:00Z", examiner_name: "Ana", verdict: "apto", score_pct: 85,
      feedback: "<script>alert(1)</script> Buen ritmo", criteria_results: [{ label: "Saludo", status: "pass" }, { label: "Cierre", status: "partial" }],
    },
    sesion: { id: "ses-1", chatter_name: "Lucía", profile_id: "p1" },
    perfil: { name: "Valentina" },
    mensajes: 12,
    config: { notification_emails: config },
  };
}
const datosQaCloser = (extra: Partial<DatosQaCloser["config"]> = {}, uploaded_by: string | null = BETO): DatosQaCloser => ({
  call: {
    id: CALL, created_at: "2026-09-18T10:00:00Z", call_date: "2026-09-18", evaluator_name: "IA", call_type: null, service_sold: null,
    claude_score: 64, uploaded_by,
    claude_analysis: { summary: "Buena llamada.", call_outcome: "no_cerro", dimensions: [], red_flags: [], key_moments: [], improvements: [] },
  },
  model: { name: "Jane", category: "A", ig_url: null },
  closer: { name: "Bob" },
  config: { notification_emails: ["jefa@unlok.me"], notify_on_analyzed: true, notify_on_low_score: false, low_score_threshold: 60, ...extra },
});
const datosQaChatter = (): DatosQaChatter => ({
  report: {
    id: REP, chatter_name: "Alex", company: "CM", period: "2026-02-01", evaluator_name: "IA", veredicto: "requiere_mejora",
    report: { resumen: "Buen ritmo." }, evaluated_models: [], sampling: {}, created_by: CLARA,
  },
  config: { notification_emails: ["ana@maven-ai.me"], notify_user_ids: [BETO, OLGA] },
});

interface Opciones {
  env?: Record<string, string>;
  ve?: { evaluacion?: DatosEvaluacion | null; qa?: DatosQaCloser | null; qaChatter?: DatosQaChatter | null };
  turno?: boolean;
  resendFalla?: boolean;
}
function armar(o: Opciones = {}) {
  const enviados: Envio[] = [];
  const turnos: string[] = [];
  const logs: string[] = [];
  const env: Record<string, string> = { SUPABASE_SERVICE_ROLE_KEY: "sb_secret_llave", CRON_INTERNAL_TOKEN: "cron-123", RESEND_API_KEY: "re_x", ...o.env };
  const p: Puertos = {
    env: (n) => env[n],
    persona: (t) => Promise.resolve(SESIONES[t] ? { id: SESIONES[t] } : null),
    comoPersona: () => ({
      evaluacionChatter: () => Promise.resolve(o.ve?.evaluacion === undefined ? datosEvaluacion(["ana@maven-ai.me"]) : o.ve.evaluacion),
      qaCloser: () => Promise.resolve(o.ve?.qa === undefined ? datosQaCloser() : o.ve.qa),
      qaChatter: () => Promise.resolve(o.ve?.qaChatter === undefined ? datosQaChatter() : o.ve.qaChatter),
    }),
    // Como la RPC: de esos ids y correos, solo las cuentas de la agencia de quien pide.
    destinatariosDeAgencia: (quien, ids, correos) => {
      const agencia = CUENTAS.find((c) => c.id === quien)?.tenant;
      return Promise.resolve(
        CUENTAS.filter((c) => c.tenant === agencia && (ids.includes(c.id) || correos.includes(c.email.toLowerCase())))
          .map((c) => ({ user_id: c.id, email: c.email })),
      );
    },
    turno: (quien, plantilla, ref) => {
      turnos.push(`${quien} ${plantilla} ${ref}`);
      return Promise.resolve(o.turno ?? true);
    },
    correoDeUsuario: (id) => Promise.resolve(CUENTAS.find((c) => c.id === id)?.email ?? null),
    enviar: (e) => {
      enviados.push(e);
      return Promise.resolve(o.resendFalla
        ? { ok: false, status: 422, id: null, detalle: `Invalid to: ${e.to.join(",")}` }
        : { ok: true, status: 200, id: `re-${enviados.length}`, detalle: "" });
    },
    log: (...a) => logs.push(a.map(String).join(" ")),
  };
  return { p, enviados, turnos, logs };
}
const nav = (token: string) => ({ authorization: `Bearer ${token}`, cronToken: null });

// ─── Servidor: igual que siempre ─────────────────────────────────────────────
Deno.test("servidor: la llave sb_secret, un JWT service_role y X-Cron-Token mandan HTML como siempre", async () => {
  const cuerpo = { to: ["jefe@unlok.me"], subject: "Ticket", html: "<p>hola</p>", tag: "ticket-nuevo" };
  for (const h of [
    { authorization: "Bearer sb_secret_llave", cronToken: null },
    { authorization: `Bearer ${jwt({ role: "service_role" })}`, cronToken: null },
    { authorization: "Bearer anon-key", cronToken: "cron-123" }, // pg_net: email_notify_enqueue
  ]) {
    const { p, enviados } = armar();
    const res = await manejar(h, cuerpo, p);
    assertEquals(res.status, 200);
    assertEquals(res.body, { success: true, id: "re-1" });
    assertEquals(enviados[0].to, ["jefe@unlok.me"]);
    assertEquals(enviados[0].html, "<p>hola</p>");
    assertEquals(enviados[0].from, "Maven CRM <noreply@mail.maven-ai.me>");
  }
});

Deno.test("servidor: also_include_user_ids se resuelve (qa-analyze manda al closer que subió la QA)", async () => {
  const { p, enviados } = armar();
  const res = await manejar({ authorization: "Bearer sb_secret_llave", cronToken: null },
    { to: ["jefa@unlok.me"], subject: "QA", html: "<p/>", also_include_user_ids: [BETO] }, p);
  assertEquals(res.status, 200);
  assertEquals(enviados[0].to, ["jefa@unlok.me", "beto@maven-ai.me"]);
});

Deno.test("servidor: un X-Cron-Token equivocado no es servidor", async () => {
  const { p, enviados } = armar();
  const res = await manejar({ authorization: "Bearer anon-key", cronToken: "otro" }, { to: ["x@y.z"], subject: "s", html: "h" }, p);
  assertEquals(res.status, 401);
  assertEquals(enviados.length, 0);
  assert(!esCredencialDeServidor(jwt({ role: "authenticated", sub: ANA }), "sb_secret_llave"));
});

// ─── Navegador: solo plantillas ──────────────────────────────────────────────
Deno.test("navegador: HTML libre, direcciones y user_ids sueltos se rechazan sin mandar nada", async () => {
  for (const cuerpo of [
    { to: ["victima@gmail.com"], subject: "Tu cuenta", html: "<a href='https://phish'>entra</a>" },
    { to: [], subject: "x", html: "x", also_include_user_ids: [BETO] },
    { plantilla: "evaluacion_chatter", id: EV, to: ["victima@gmail.com"] },
    { plantilla: "evaluacion_chatter", id: EV, html: "<b>otro</b>" },
    { plantilla: "otra_cosa", id: EV },
    { plantilla: "qa_closer", id: "1 or 1=1" },
  ]) {
    const { p, enviados, turnos } = armar();
    const res = await manejar(nav("jwt-ana"), cuerpo, p);
    assertEquals(res.status, 400, JSON.stringify(cuerpo));
    assertEquals(enviados.length, 0);
    assertEquals(turnos.length, 0);
  }
});

Deno.test("navegador: sin sesión válida, 401", async () => {
  const { p, enviados } = armar();
  assertEquals((await manejar(nav("jwt-vencido"), { plantilla: "qa_closer", id: CALL }, p)).status, 401);
  assertEquals((await manejar({ authorization: null, cronToken: null }, { plantilla: "qa_closer", id: CALL }, p)).status, 401);
  assertEquals(enviados.length, 0);
});

Deno.test("navegador: un reporte que la RLS no le deja ver es 404", async () => {
  const { p, enviados } = armar({ ve: { evaluacion: null } });
  const res = await manejar(nav("jwt-ana"), { plantilla: "evaluacion_chatter", id: EV }, p);
  assertEquals(res.status, 404);
  assertEquals(enviados.length, 0);
});

Deno.test("navegador: evaluación → un correo por cuenta de la agencia; lo de afuera se omite; la respuesta no trae correos", async () => {
  const { p, enviados, turnos } = armar({
    ve: { evaluacion: datosEvaluacion(["ana@maven-ai.me", "BETO@maven-ai.me", "olga@otra.test", "alguien@gmail.com", "no-es-correo"]) },
  });
  const res = await manejar(nav("jwt-ana"), { plantilla: "evaluacion_chatter", id: EV }, p);
  assertEquals(res.status, 200);
  assertEquals(res.body, { success: true, enviados: 2, fallidos: 0, omitidos: 2 });
  assert(!JSON.stringify(res.body).includes("@"), "la respuesta no trae direcciones");
  assertEquals(enviados.map((e) => e.to), [["ana@maven-ai.me"], ["beto@maven-ai.me"]], "uno por destinatario: nadie ve al otro");
  assertEquals(turnos, [`${ANA} evaluacion_chatter ${EV}`]);
  const e = enviados[0];
  assertEquals(e.subject, "[Maven Chatters] Evaluación — APTO: Lucía (85%)");
  assertEquals(e.tag, "chatter");
  assertStringIncludes(e.html, "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert(!e.html.includes("<script>"), "el texto del reporte va escapado");
  assertStringIncludes(e.html, "https://app.maven-ai.me/chatter-evaluator/history/ses-1");
  assertStringIncludes(e.html, "12 mensaje(s)");
});

Deno.test("navegador: NOTIFICATION_ALLOWED_DOMAINS deja pasar direcciones de esos dominios (y solo esas)", async () => {
  const { p, enviados } = armar({
    env: { NOTIFICATION_ALLOWED_DOMAINS: "unlok.me, @maven-ai.me" },
    ve: { qa: datosQaCloser({ notification_emails: ["jefa@unlok.me", "otro@gmail.com", "jefa@unlok.me.evil.com"] }, null) },
  });
  const res = await manejar(nav("jwt-ana"), { plantilla: "qa_closer", id: CALL }, p);
  assertEquals(res.body, { success: true, enviados: 1, fallidos: 0, omitidos: 2 });
  assertEquals(enviados.map((e) => e.to[0]), ["jefa@unlok.me"]);
});

Deno.test("navegador: QA de closer → la configuración y quien subió la llamada, si es de la agencia", async () => {
  const { p, enviados } = armar({ env: { NOTIFICATION_ALLOWED_DOMAINS: "unlok.me" } });
  const res = await manejar(nav("jwt-ana"), { plantilla: "qa_closer", id: CALL }, p);
  assertEquals(res.status, 200);
  assertEquals(enviados.map((e) => e.to[0]).sort(), ["beto@maven-ai.me", "jefa@unlok.me"]);
  assertStringIncludes(enviados[0].subject, "(No cerró)");
  assertEquals(enviados[0].tag, "qa");
  // Quien subió es de OTRA agencia: no se le manda (ni se dice su correo).
  const otra = armar({ ve: { qa: datosQaCloser({}, OLGA) } });
  const r2 = await manejar(nav("jwt-ana"), { plantilla: "qa_closer", id: CALL }, otra.p);
  assertEquals(r2.body, { success: true, enviados: 0, motivo: "sin_destinatarios", omitidos: 2 });
  assertEquals(otra.enviados.length, 0);
});

Deno.test("navegador: QA de closer con los avisos apagados no manda ni gasta turno", async () => {
  const { p, enviados, turnos } = armar({ ve: { qa: datosQaCloser({ notify_on_analyzed: false, notify_on_low_score: true, low_score_threshold: 50 }) } });
  const res = await manejar(nav("jwt-ana"), { plantilla: "qa_closer", id: CALL }, p);
  assertEquals(res.body, { success: true, enviados: 0, motivo: "apagado" });
  assertEquals(enviados.length + turnos.length, 0);
});

Deno.test("navegador: QA de chatters → en español, a notify_user_ids y a quien lo creó, de la agencia", async () => {
  const { p, enviados } = armar();
  const res = await manejar(nav("jwt-ana"), { plantilla: "qa_chatter", id: REP }, p);
  assertEquals(res.status, 200);
  assertEquals(res.body.enviados, 3);
  assertEquals(res.body.omitidos, 1, "Olga (otra agencia) en notify_user_ids se omite");
  assertEquals(enviados.map((e) => e.to[0]).sort(), ["ana@maven-ai.me", "beto@maven-ai.me", "clara@maven-ai.me"]);
  assertEquals(enviados[0].subject, "[Maven · QA Chatters] Alex · Kash Massive (CM) · Febrero 2026 (Requiere Mejora)");
  assertStringIncludes(enviados[0].html, "Febrero 2026");
  assert(!enviados[0].html.includes("February"));
});

Deno.test("navegador: la agencia es la de QUIEN PIDE (Olga no le manda a la gente de KASH)", async () => {
  const { p, enviados } = armar();
  const res = await manejar(nav("jwt-olga"), { plantilla: "qa_chatter", id: REP }, p);
  assertEquals(res.body.enviados, 1);
  assertEquals(enviados.map((e) => e.to[0]), ["olga@otra.test"]);
});

Deno.test("navegador: pasado el tope por minuto, 429 y nada sale", async () => {
  const { p, enviados } = armar({ turno: false });
  const res = await manejar(nav("jwt-ana"), { plantilla: "evaluacion_chatter", id: EV }, p);
  assertEquals(res.status, 429);
  assertEquals(enviados.length, 0);
});

Deno.test("navegador: si Resend falla, el error no trae la dirección (va al log)", async () => {
  const { p, logs } = armar({ resendFalla: true });
  const res = await manejar(nav("jwt-ana"), { plantilla: "evaluacion_chatter", id: EV }, p);
  assertEquals(res.status, 502);
  assert(!JSON.stringify(res.body).includes("@"));
  assert(logs.some((l) => l.includes("ana@maven-ai.me")), "el detalle queda en el log del servidor");
});

Deno.test("navegador: APP_URL arma los enlaces del correo", async () => {
  const { p, enviados } = armar({ env: { APP_URL: "https://maven.ejemplo.test/" } });
  await manejar(nav("jwt-ana"), { plantilla: "evaluacion_chatter", id: EV }, p);
  assertStringIncludes(enviados[0].html, "https://maven.ejemplo.test/chatter-evaluator/history/ses-1");
});

Deno.test("index.ts: lee como la persona y las dos RPC van con service_role", () => {
  const src = Deno.readTextFileSync(new URL("./index.ts", import.meta.url));
  assert(src.includes("manejar("), "index.ts delega en manejar");
  assert(src.includes("Authorization: `Bearer ${token}`"), "los reportes se leen con el JWT de la persona");
  assert(src.includes('admin.rpc("correo_destinatarios_de_agencia"') && src.includes('admin.rpc("correo_navegador_turno"'));
  for (const tabla of ["chatter_evaluations", "qa_calls", "chatter_qa_reports"]) {
    assert(!new RegExp(`admin\\s*\\.from\\("${tabla}"\\)`).test(src), `${tabla} nunca con service_role`);
  }
});
