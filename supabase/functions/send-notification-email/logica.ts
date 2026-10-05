// send-notification-email — la lógica, sin red ni Deno.serve (logica.test.ts la
// prueba con dobles; index.ts le pasa los puertos de verdad).
//
// DOS MODOS, según QUIÉN llama:
//
// 1. INTERNO (servidor): service_role (JWT con role=service_role o la llave
//    sb_secret_… del proyecto) o el secreto X-Cron-Token. Lo usan qa-analyze
//    (reporte de QA de Closers), ticket-notify (ticket nuevo) y los avisos por
//    correo de Ajustes → Eventos (email_notify_enqueue, por pg_net). Contrato de
//    siempre: { to[], subject, html, tag?, also_include_user_ids? }.
//
// 2. NAVEGADOR (JWT de una persona): SOLO plantillas fijas.
//      { plantilla: "evaluacion_chatter" | "qa_closer" | "qa_chatter", id }
//    Sin HTML, sin asunto, sin direcciones, sin user_ids. La edge lee el
//    reporte CON LA RLS DE LA PERSONA (si no lo ve, 404), arma el correo con la
//    plantilla, y elige a quién mandarlo:
//      · las direcciones de la configuración del módulo y los user_ids del
//        reporte (quien subió la llamada, quien creó el QA, notify_user_ids),
//      · pero SOLO las que son cuentas de Maven de la MISMA agencia que quien
//        pide (RPC correo_destinatarios_de_agencia). Una dirección que no es de
//        una cuenta solo pasa si su dominio está en NOTIFICATION_ALLOWED_DOMAINS
//        (p. ej. «unlok.me»): así la configuración no se vuelve un relé abierto.
//    Un correo por destinatario (nadie ve la dirección de otro en el «Para»).
//    La respuesta trae cuántos se mandaron, nunca a quién. Tope: 5 pedidos por
//    minuto por persona (RPC correo_navegador_turno).
//
// Antes (hasta el 05/10/2026) cualquier sesión mandaba HTML libre a cualquier
// dirección desde noreply@mail.maven-ai.me, y con also_include_user_ids
// averiguaba el correo de quien quisiera.

import { buildEmailHtml, buildEmailSubject, armarPayloadEvaluacionChatter, type DatosEvaluacionChatter } from "./plantillas/evaluacion-chatter.ts";
import { buildChatterQaEmailHtml, buildChatterQaEmailSubject, armarPayloadQaChatter, type FilaQaChatter } from "./plantillas/qa-chatter.ts";
import {
  type AnalisisQa,
  armarPayloadQaCloser,
  buildQaEmailHtml,
  buildQaEmailSubject,
  debeAvisarQaCloser,
} from "../_shared/correo-qa-closer.ts";

export const PLANTILLAS = ["evaluacion_chatter", "qa_closer", "qa_chatter"] as const;
export type Plantilla = (typeof PLANTILLAS)[number];

/** Tope de destinatarios de un pedido del navegador. */
export const TOPE_DESTINATARIOS = 25;

export interface DatosQaCloser {
  call: {
    id: string;
    created_at: string | null;
    call_date: string | null;
    evaluator_name: string | null;
    call_type: string | null;
    service_sold: string | null;
    claude_score: number | null;
    claude_analysis: AnalisisQa | null;
    uploaded_by: string | null;
  };
  model: { name: string | null; category: string | null; ig_url: string | null } | null;
  closer: { name: string | null } | null;
  config: {
    notification_emails: string[] | null;
    notify_on_analyzed: boolean | null;
    notify_on_low_score: boolean | null;
    low_score_threshold: number | null;
  } | null;
}

export interface DatosQaChatter {
  report: FilaQaChatter;
  config: { notification_emails: string[] | null; notify_user_ids: string[] | null } | null;
}

export interface DatosEvaluacion extends DatosEvaluacionChatter {
  config: { notification_emails: string[] | null } | null;
}

/** Lo que se lee con el JWT de quien pide: si la RLS no lo deja, null. */
export interface LectorComoPersona {
  evaluacionChatter(id: string): Promise<DatosEvaluacion | null>;
  qaCloser(id: string): Promise<DatosQaCloser | null>;
  qaChatter(id: string): Promise<DatosQaChatter | null>;
}

export interface Envio {
  from: string;
  to: string[];
  subject: string;
  html: string;
  tag: string | null;
}

export interface Puertos {
  env(nombre: string): string | undefined;
  /** El id de la cuenta del JWT, o null si no es una sesión válida. */
  persona(token: string): Promise<{ id: string } | null>;
  comoPersona(token: string): LectorComoPersona;
  /** RPC correo_destinatarios_de_agencia (service_role). */
  destinatariosDeAgencia(quien: string, userIds: string[], correos: string[]): Promise<{ user_id: string; email: string }[]>;
  /** RPC correo_navegador_turno (service_role): false = pasó el tope. */
  turno(quien: string, plantilla: Plantilla, ref: string): Promise<boolean>;
  /** Modo interno: el correo de cada user_id (auth.admin). */
  correoDeUsuario(userId: string): Promise<string | null>;
  enviar(e: Envio): Promise<{ ok: boolean; status: number; id: string | null; detalle: string }>;
  log?: (...a: unknown[]) => void;
}

export interface Respuesta {
  status: number;
  body: Record<string, unknown>;
}
const r = (status: number, body: Record<string, unknown>): Respuesta => ({ status, body });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORREO = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

/** ¿Es una credencial de servidor? La llave del proyecto (sb_secret_… o el JWT
 *  del env) por igualdad, o un JWT con role=service_role. Este segundo camino
 *  es seguro porque la función corre con verify_jwt=true: el gateway ya validó
 *  la firma antes de llegar aquí. */
export function esCredencialDeServidor(token: string, serviceKey: string): boolean {
  if (serviceKey && token === serviceKey) return true;
  try {
    const b64 = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? "";
    const claims = JSON.parse(atob(b64)) as { role?: string };
    return claims?.role === "service_role";
  } catch {
    return false;
  }
}

export function remitente(env: (n: string) => string | undefined): string {
  // Si viene la dirección pelada, se le antepone "Maven CRM <...>" para que
  // Gmail muestre el nombre en vez de "noreply".
  const raw = env("NOTIFICATION_FROM_EMAIL") || "noreply@mail.maven-ai.me";
  return raw.includes("<") ? raw : `Maven CRM <${raw}>`;
}

export const urlDeLaApp = (env: (n: string) => string | undefined) =>
  (env("APP_URL") || "https://app.maven-ai.me").replace(/\/$/, "");

const textos = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim()) : [];

// ─── El correo de cada plantilla ────────────────────────────────────────────
export interface CorreoArmado {
  subject: string;
  html: string;
  tag: string;
  /** Direcciones de la configuración del módulo (las filtra la agencia). */
  correos: string[];
  /** user_ids del reporte o de la configuración (los filtra la agencia). */
  userIds: string[];
}

export function armarCorreo(plantilla: Plantilla, datos: unknown, appUrl: string): CorreoArmado | { apagado: true } {
  if (plantilla === "evaluacion_chatter") {
    const d = datos as DatosEvaluacion;
    const p = armarPayloadEvaluacionChatter(d, appUrl);
    return {
      subject: buildEmailSubject(p),
      html: buildEmailHtml(p),
      tag: "chatter",
      correos: textos(d.config?.notification_emails),
      userIds: [],
    };
  }
  if (plantilla === "qa_closer") {
    const d = datos as DatosQaCloser;
    const score = d.call.claude_score ?? d.call.claude_analysis?.overall_score ?? 0;
    // Los interruptores de qa_config, igual que antes en el navegador y en qa-analyze.
    if (!d.config || !debeAvisarQaCloser(d.config, score)) return { apagado: true };
    const p = armarPayloadQaCloser({ call: d.call, analysis: d.call.claude_analysis, score, model: d.model, closer: d.closer, appUrl });
    return {
      subject: buildQaEmailSubject(p),
      html: buildQaEmailHtml(p),
      tag: "qa",
      correos: textos(d.config.notification_emails),
      userIds: d.call.uploaded_by ? [d.call.uploaded_by] : [],
    };
  }
  const d = datos as DatosQaChatter;
  const p = armarPayloadQaChatter(d.report, appUrl);
  const ids = textos(d.config?.notify_user_ids);
  if (d.report.created_by && !ids.includes(d.report.created_by)) ids.push(d.report.created_by);
  return {
    subject: buildChatterQaEmailSubject(p),
    html: buildChatterQaEmailHtml(p),
    tag: "chatter-qa",
    correos: textos(d.config?.notification_emails),
    userIds: ids,
  };
}

/** Dominios de NOTIFICATION_ALLOWED_DOMAINS («unlok.me, maven-ai.me»). */
export function dominiosPermitidos(env: (n: string) => string | undefined): Set<string> {
  return new Set(
    (env("NOTIFICATION_ALLOWED_DOMAINS") ?? "")
      .split(",")
      .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean),
  );
}

/** A quién se manda: cuentas de la agencia + direcciones de dominios permitidos. */
export async function elegirDestinatarios(
  p: Puertos,
  quien: string,
  correo: CorreoArmado,
): Promise<{ para: string[]; omitidos: number }> {
  const correos = [...new Set(correo.correos.map((c) => c.toLowerCase()).filter((c) => CORREO.test(c)))];
  const ids = [...new Set(correo.userIds.filter((u) => UUID.test(u)))];
  const cuentas = correos.length || ids.length ? await p.destinatariosDeAgencia(quien, ids, correos) : [];
  const deCuentas = new Set(cuentas.map((c) => c.email.toLowerCase()));
  const idsResueltos = new Set(cuentas.map((c) => c.user_id));
  const permitidos = dominiosPermitidos(p.env);
  const para = new Set(deCuentas);
  for (const c of correos) {
    if (!deCuentas.has(c) && permitidos.has(c.split("@")[1] ?? "")) para.add(c);
  }
  const omitidos = correos.filter((c) => !para.has(c)).length + ids.filter((u) => !idsResueltos.has(u)).length;
  return { para: [...para].slice(0, TOPE_DESTINATARIOS), omitidos };
}

// ─── El pedido ──────────────────────────────────────────────────────────────
export async function manejar(
  headers: { authorization: string | null; cronToken: string | null },
  body: Record<string, unknown> | null,
  p: Puertos,
): Promise<Respuesta> {
  const auth = headers.authorization ?? "";
  if (!auth.startsWith("Bearer ")) return r(401, { error: "Unauthorized", reason: "missing_auth_header" });
  const token = auth.slice("Bearer ".length);
  const serviceKey = p.env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const cronToken = p.env("CRON_INTERNAL_TOKEN") ?? "";
  // Triggers de Postgres (pg_net): llegan con el anon key de Bearer (para el
  // verify_jwt del gateway) y el secreto en X-Cron-Token.
  const interno = esCredencialDeServidor(token, serviceKey) ||
    (cronToken.length > 0 && headers.cronToken === cronToken);

  if (interno) {
    if (!body) return r(400, { error: "Body inválido (JSON requerido)" });
    return await modoInterno(body, p);
  }

  const yo = await p.persona(token);
  if (!yo) {
    // Sin exponer el token: solo su forma, para distinguir «sesión vencida» de
    // «credencial de servidor no reconocida» (el bug del 29-jul).
    p.log?.(`[send-notification-email] 401 — token no válido (len=${token.length}, jwt_like=${token.startsWith("ey")}, sb_key_like=${token.startsWith("sb_")})`);
    return r(401, { error: "Unauthorized", reason: "invalid_token" });
  }
  if (!body) return r(400, { error: "Body inválido (JSON requerido)" });
  return await modoNavegador(yo.id, token, body, p);
}

async function modoInterno(body: Record<string, unknown>, p: Puertos): Promise<Respuesta> {
  const to = textos(body.to);
  const subject = typeof body.subject === "string" ? body.subject : "";
  const html = typeof body.html === "string" ? body.html : "";
  const tag = typeof body.tag === "string" ? body.tag : null;
  for (const uid of textos(body.also_include_user_ids)) {
    try {
      const email = await p.correoDeUsuario(uid);
      if (email && !to.includes(email)) to.push(email);
    } catch (e) {
      p.log?.("[send-notification-email] no se pudo resolver el correo de", uid, (e as Error).message);
    }
  }
  if (to.length === 0) return r(400, { error: "to[] vacío" });
  if (!subject) return r(400, { error: "subject requerido" });
  if (!html) return r(400, { error: "html requerido" });
  if (!p.env("RESEND_API_KEY")) return r(500, { error: "RESEND_API_KEY no configurada" });
  const res = await p.enviar({ from: remitente(p.env), to, subject, html, tag });
  if (!res.ok) {
    p.log?.("[send-notification-email] Resend falló", res.status, res.detalle);
    return r(502, { error: `Resend ${res.status}`, detail: res.detalle.slice(0, 400) });
  }
  return r(200, { success: true, id: res.id });
}

const SOLO_PLANTILLAS =
  "Desde el navegador solo se piden plantillas fijas: { plantilla, id }. El correo lo arma el servidor.";

async function modoNavegador(yo: string, token: string, body: Record<string, unknown>, p: Puertos): Promise<Respuesta> {
  // Nada de lo que servía para armar un correo a mano se acepta aquí.
  for (const campo of ["to", "html", "subject", "also_include_user_ids", "tag", "from"]) {
    if (campo in body) return r(400, { error: SOLO_PLANTILLAS });
  }
  const plantilla = body.plantilla;
  const id = body.id;
  if (typeof plantilla !== "string" || !(PLANTILLAS as readonly string[]).includes(plantilla)) {
    return r(400, { error: SOLO_PLANTILLAS });
  }
  if (typeof id !== "string" || !UUID.test(id)) return r(400, { error: "falta el id del reporte" });
  const cual = plantilla as Plantilla;

  const lector = p.comoPersona(token);
  const datos = cual === "evaluacion_chatter"
    ? await lector.evaluacionChatter(id)
    : cual === "qa_closer"
    ? await lector.qaCloser(id)
    : await lector.qaChatter(id);
  if (!datos) return r(404, { error: "No encontramos ese reporte o no tienes acceso a él" });

  const armado = armarCorreo(cual, datos, urlDeLaApp(p.env));
  if ("apagado" in armado) return r(200, { success: true, enviados: 0, motivo: "apagado" });

  const { para, omitidos } = await elegirDestinatarios(p, yo, armado);
  if (para.length === 0) return r(200, { success: true, enviados: 0, motivo: "sin_destinatarios", omitidos });

  if (!p.env("RESEND_API_KEY")) return r(500, { error: "RESEND_API_KEY no configurada" });
  if (!(await p.turno(yo, cual, id))) {
    return r(429, { error: "Pediste demasiados correos en el último minuto. Espera un momento e inténtalo de nuevo." });
  }

  // Un correo por destinatario: nadie ve en el «Para» la dirección de otro.
  let enviados = 0;
  let fallidos = 0;
  for (const destino of para) {
    const res = await p.enviar({ from: remitente(p.env), to: [destino], subject: armado.subject, html: armado.html, tag: armado.tag });
    if (res.ok) enviados++;
    else {
      fallidos++;
      // El detalle de Resend puede traer la dirección: va al log, nunca a la respuesta.
      p.log?.("[send-notification-email] Resend falló (plantilla)", cual, res.status, res.detalle.slice(0, 300));
    }
  }
  if (enviados === 0) return r(502, { error: "No se pudo enviar el correo. Inténtalo de nuevo en un rato." });
  return r(200, { success: true, enviados, fallidos, omitidos });
}
