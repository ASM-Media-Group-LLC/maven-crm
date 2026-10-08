// CORREOS PROGRAMADOS («Programar envío», como Gmail. Keila, 08/10/2026).
//
// Dos caminos:
//   · `programarCorreo`: la flecha al lado de «Enviar». Revisa el correo IGUAL
//     que si se mandara ahora —una dirección mala tiene que decirse mientras la
//     persona está mirando, no a las 8 de la mañana cuando nadie mira— y lo
//     guarda con su hora (tabla mail_programados).
//   · `mandarLosVencidos`: el cron de cada minuto (con X-Cron-Token). Toma los
//     que ya tienen que salir y los manda por enviar.ts, el mismo camino del
//     botón Enviar.
//
// ⚠️ Un programado que falla NO se reintenta solo: queda «fallido» con el motivo
// y a la persona le llega un aviso. Sobre todo si el servidor no confirmó
// (`incierto`): puede haber salido, y mandarlo otra vez lo duplicaría.

import { tamanoDeBase64 } from "../_shared/base64.ts";
import { type CorreoParaEnviar, enviarCorreo, revisarCorreo } from "./enviar.ts";

/** Hasta cuándo se puede programar. Gmail deja 49 años; acá, uno: más allá es
 *  casi seguro un año mal tipeado. */
export const HORIZONTE_MS = 366 * 24 * 60 * 60 * 1000;
/** Cuánto en el pasado se acepta: quien elige «hoy a las 8:00» a las 8:00:30 no
 *  se equivocó, el reloj siguió andando. Sale en la próxima corrida. */
export const TOLERANCIA_PASADO_MS = 5 * 60 * 1000;

export type HoraRevisada = { ok: true; cuando: Date } | { ok: false; error: string };

export function revisarHora(crudo: unknown, ahora = new Date()): HoraRevisada {
  if (typeof crudo !== "string" || !crudo) return { ok: false, error: "falta la hora de envío" };
  const cuando = new Date(crudo);
  if (Number.isNaN(cuando.getTime())) return { ok: false, error: "la hora de envío no es válida" };
  const dif = cuando.getTime() - ahora.getTime();
  if (dif < -TOLERANCIA_PASADO_MS) return { ok: false, error: "esa hora ya pasó" };
  if (dif > HORIZONTE_MS) return { ok: false, error: "se puede programar hasta un año adelante" };
  return { ok: true, cuando };
}

/** Lo que va a la fila: lo que muestra la lista y el correo entero aparte. */
export function filaDelProgramado(userId: string, cuando: Date, c: CorreoParaEnviar) {
  const resumen = (c.text ?? c.html?.replace(/<[^>]+>/g, " ") ?? "")
    .replace(/\s+/g, " ").trim().slice(0, 200);
  return {
    user_id: userId,
    enviar_en: cuando.toISOString(),
    para: c.to,
    cc: c.cc,
    cco: c.bcc,
    asunto: c.subject,
    resumen,
    // Solo los ARCHIVOS: las imágenes pegadas (con contentId) son parte del
    // cuerpo, no algo que la lista tenga que mostrar con un clip.
    adjuntos_meta: c.adjuntos.filter((a) => !a.contentId).map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      sizeBytes: tamanoDeBase64(a.contentBase64),
    })),
    correo: {
      text: c.text,
      html: c.html,
      in_reply_to: c.inReplyTo,
      references: c.references,
      attachments: c.adjuntos,
      menciones: c.menciones,
    },
  };
}

// deno-lint-ignore no-explicit-any
type Admin = any;

export async function programarCorreo(
  admin: Admin,
  userId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; cuerpo: Record<string, unknown> }> {
  const hora = revisarHora(body.enviar_en);
  if (!hora.ok) return { status: 400, cuerpo: { error: hora.error } };
  const revision = revisarCorreo(body);
  if (!revision.ok) return { status: revision.status, cuerpo: revision.cuerpo };

  // Sin casilla conectada no hay con qué mandarlo después: mejor decirlo ahora.
  const { data: cred } = await admin.from("mail_credentials")
    .select("id").eq("user_id", userId).is("revoked_at", null).maybeSingle();
  if (!cred) return { status: 409, cuerpo: { error: "no_credential" } };

  const { data, error } = await admin.from("mail_programados")
    .insert(filaDelProgramado(userId, hora.cuando, revision.correo))
    .select("id, enviar_en")
    .single();
  if (error) return { status: 500, cuerpo: { error: `no se pudo programar: ${error.message}` } };
  return { status: 200, cuerpo: { ok: true, id: data.id, enviar_en: data.enviar_en } };
}

interface Tomado {
  id: string;
  user_id: string;
  para: string[];
  cc: string[];
  cco: string[];
  asunto: string;
  correo: Record<string, unknown>;
}

/** Lo que el cron le pasa a `revisarCorreo`: la fila vuelta a armar como el
 *  pedido de la pantalla. Se revisa OTRA VEZ a propósito: la fila pudo
 *  escribirse con una versión vieja de la edge. */
export function pedidoDeLaFila(f: Tomado): Record<string, unknown> {
  return {
    ...f.correo,
    to: f.para,
    cc: f.cc,
    bcc: f.cco,
    subject: f.asunto,
  };
}

/** De a pocos por corrida: cada uno abre SMTP e IMAP y puede pesar 20 MB, y la
 *  función tiene un techo de tiempo. Lo que no entre sale al minuto siguiente. */
const POR_CORRIDA = 5;

export async function mandarLosVencidos(admin: Admin): Promise<Record<string, unknown>> {
  const { data, error } = await admin.rpc("mail_programados_tomar", { p_limite: POR_CORRIDA });
  if (error) return { ok: false, error: error.message };
  const tomados = (data ?? []) as Tomado[];
  let enviados = 0;
  const fallidos: string[] = [];

  for (const f of tomados) {
    const revision = revisarCorreo(pedidoDeLaFila(f));
    const r = revision.ok
      ? await enviarCorreo(admin, f.user_id, revision.correo)
      : { ok: false as const, error: String(revision.cuerpo.error ?? "el correo no pasó la revisión"), incierto: false };

    if (r.ok) {
      enviados++;
      // Salió: se vacía lo pesado (la copia queda en Enviados).
      await admin.from("mail_programados")
        .update({ estado: "enviado", cerrado_en: new Date().toISOString(), correo: {}, ultimo_error: null })
        .eq("id", f.id);
      continue;
    }

    fallidos.push(f.id);
    const motivo = r.error === "no_credential" ? "tu correo no está conectado a Maven" : r.error;
    await admin.from("mail_programados")
      .update({ estado: "fallido", cerrado_en: new Date().toISOString(), ultimo_error: motivo.slice(0, 500) })
      .eq("id", f.id);
    // El aviso: nadie está mirando cuando un programado falla.
    const { error: errAviso } = await admin.from("notifications").insert({
      user_id: f.user_id,
      type: "correo_programado_fallido",
      title: r.incierto
        ? "Tu correo programado puede no haber salido"
        : "No se pudo enviar tu correo programado",
      message: `«${f.asunto || "(sin asunto)"}»: ${motivo}`.slice(0, 500),
      module_origin: "Correo",
      required_permission_module: "Correo",
      priority: "high",
      deep_link_url: "/correo?carpeta=programados",
    });
    if (errAviso) console.error("[mail-fetch] aviso de programado fallido:", errAviso.message);
  }

  return { ok: true, tomados: tomados.length, enviados, fallidos };
}
