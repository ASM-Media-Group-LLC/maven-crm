// Mandar un correo: lo que hace el botón «Enviar» y lo que hace el cron con los
// correos PROGRAMADOS (programados.ts) cuando les llega la hora.
//
// Vivía adentro de index.ts. Salió acá cuando apareció el segundo camino
// (Keila, 08/10: «programar envío» como Gmail): un correo programado tiene que
// salir EXACTAMENTE igual que uno mandado a mano —la misma revisión, la copia
// en Enviados, las menciones, y el mismo cuidado con el «250 OK» que no llega—,
// y dos copias de este código terminarían distintas.

import { ImapClient } from "../_shared/imap.ts";
import { buildMessage, esDireccionSmtp, SmtpClient } from "../_shared/smtp.ts";
import { unseal } from "../_shared/mail-crypto.ts";
import { sanitizeEmailHtml } from "../_shared/html-sanitize.ts";
import { type AdjuntoEntrante, revisarAdjuntos } from "./adjuntos.ts";
import { filaSembrada } from "./sembrar.ts";

export interface CorreoParaEnviar {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string | null;
  html: string | null;
  inReplyTo: string | null;
  references: string | null;
  adjuntos: AdjuntoEntrante[];
  /** A quién se mencionó con @ (ids de usuario). */
  menciones: string[];
}

export type RevisionDelCorreo =
  | { ok: true; correo: CorreoParaEnviar }
  | { ok: false; status: number; cuerpo: Record<string, unknown> };

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);
const textoONull = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Revisa lo que llegó de la pantalla ANTES de mandarlo (o de guardarlo para
 *  mandarlo después: un programado que no pasa esto fallaría a la hora de
 *  salir, cuando ya nadie está mirando). */
export function revisarCorreo(b: Record<string, unknown>): RevisionDelCorreo {
  const to = lista(b.to);
  const cc = lista(b.cc);
  const bcc = lista(b.bcc);
  if (!to.length) return { ok: false, status: 400, cuerpo: { error: "hace falta al menos un destinatario" } };
  const subject = textoONull(b.subject);
  const text = textoONull(b.text);
  const html = textoONull(b.html);
  if (!subject && !text && !html) return { ok: false, status: 400, cuerpo: { error: "el correo está vacío" } };

  // Validación en el SERVIDOR de cada dirección. La del composer es ayuda de
  // UI: quien llame a esta función con el JWT y un cuerpo armado a mano se la
  // saltea. Sin esto, un \r\n en un destinatario inyecta comandos en la sesión
  // SMTP (ver esDireccionSmtp).
  const sospechosas = [...to, ...cc, ...bcc].filter((d) => !esDireccionSmtp(d));
  if (sospechosas.length) {
    return {
      ok: false,
      status: 400,
      cuerpo: {
        error: "hay direcciones inválidas",
        direcciones: sospechosas.map((d) => String(d).replace(/[\r\n]/g, "\\n").slice(0, 60)),
      },
    };
  }

  // Adjuntos: forma correcta y tamaño total acotado (ver adjuntos.ts). El saneo
  // del nombre y del tipo (contra inyección de encabezados) lo hace buildMessage.
  const revision = revisarAdjuntos(b.attachments);
  if (!revision.ok) return { ok: false, status: revision.status, cuerpo: { error: revision.error } };

  return {
    ok: true,
    correo: {
      to,
      cc,
      bcc,
      subject: subject ?? "(sin asunto)",
      text,
      html,
      inReplyTo: textoONull(b.in_reply_to),
      references: textoONull(b.references),
      adjuntos: revision.adjuntos,
      menciones: [...new Set(lista(b.menciones))].filter((x) => ES_UUID.test(x)),
    },
  };
}

export type ResultadoDelEnvio =
  | { ok: true; from: string; guardadoEnEnviados: boolean; avisados: number }
  | {
    ok: false;
    status: number;
    error: string;
    code?: number;
    /** El mensaje entero ya viajó y se cortó esperando la confirmación: PUEDE
     *  haber salido. Nunca se reintenta solo. */
    incierto?: boolean;
  };

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Manda el correo desde la casilla de `userId`. El remitente SIEMPRE es esa
 *  casilla: nunca lo que venga en el pedido (si no, cualquiera podría mandar
 *  correo haciéndose pasar por otra persona de la empresa). */
export async function enviarCorreo(admin: Admin, userId: string, c: CorreoParaEnviar): Promise<ResultadoDelEnvio> {
  const { data: cred, error: credErr } = await admin
    .from("mail_credentials")
    // imap_host/port van acá además de los de SMTP: después de enviar hay que
    // abrir IMAP para dejar la copia en Enviados.
    .select("id, email_address, secret_cipher, secret_nonce, key_version, smtp_host, smtp_port, imap_host, imap_port")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();

  if (credErr) return { ok: false, status: 500, error: "no se pudo leer tu credencial de correo" };
  if (!cred) return { ok: false, status: 409, error: "no_credential" };

  const password = await unseal({
    cipher: cred.secret_cipher as string,
    nonce: cred.secret_nonce as string,
    keyVersion: cred.key_version as number,
  });
  if (!password) {
    return { ok: false, status: 500, error: "no se pudo descifrar la credencial — hay que re-provisionarla" };
  }

  const fromAddress = cred.email_address as string;

  // Nombre para mostrar: el del perfil de Maven.
  const { data: perfil } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  const rfc822 = buildMessage({
    from: fromAddress,
    fromName: (perfil?.full_name as string) ?? undefined,
    to: c.to,
    cc: c.cc,
    subject: c.subject,
    text: c.text ?? undefined,
    html: c.html ?? undefined,
    inReplyTo: c.inReplyTo ?? undefined,
    references: c.references ?? undefined,
    attachments: c.adjuntos,
  });

  let smtp: SmtpClient | null = null;
  try {
    smtp = await SmtpClient.connect(cred.smtp_host as string, cred.smtp_port as number);
    const auth = await smtp.login(fromAddress, password);
    if (!auth.ok) {
      await admin.from("mail_credentials")
        .update({ last_error: `SMTP login: ${auth.message}` })
        .eq("id", cred.id);
      return { ok: false, status: 502, error: `SMTP rechazó la credencial: ${auth.message}` };
    }

    // Cco va SOLO como destinatario SMTP (RCPT TO): buildMessage no escribe
    // ningún header Bcc, que es exactamente lo que lo hace "oculto" — los demás
    // destinatarios nunca lo ven.
    const all = [...c.to, ...c.cc, ...c.bcc];
    const sent = await smtp.sendMessage(fromAddress, all, rfc822);
    if (!sent.ok) {
      // ⚠️ DOS FRACASOS DISTINTOS, Y CONFUNDIRLOS DUPLICA CORREOS.
      // `incierto` = el mensaje entero ya viajó y se cortó esperando la
      // confirmación. Puede haberse enviado. Decir "no se pudo enviar" hace que
      // la persona reintente y salga dos veces: pasó el 17/09 con 13 hojas de
      // vida a tres destinatarias.
      if (sent.incierto) {
        return {
          ok: false,
          status: 504,
          error: "se envió pero el servidor tardó en confirmar: revisa Enviados ANTES de reintentar, puede haber salido",
          code: sent.code,
          incierto: true,
        };
      }
      return { ok: false, status: 502, error: `no se pudo enviar: ${sent.message}`, code: sent.code };
    }

    await admin.from("mail_credentials")
      .update({ last_used_at: new Date().toISOString(), last_error: null })
      .eq("id", cred.id);

    // ── Copia en ENVIADOS ────────────────────────────────────────────────
    // SMTP entrega al destinatario y nada más: guardar una copia en Enviados
    // es trabajo del CLIENTE, con un APPEND por IMAP. Sin esto, el correo salía
    // bien pero no quedaba rastro en la carpeta — exactamente lo que reportó
    // Jhon.
    //
    // ⚠️ NUNCA falla el envío por esto. El correo YA salió: devolver error acá
    // haría que la persona lo mandara de nuevo y el destinatario lo recibiera
    // dos veces. Si la copia no se pudo guardar, se avisa aparte y el barrido
    // del worker la levanta igual en cuanto pase por la carpeta.
    let guardadoEnEnviados = false;
    let imapCopia: ImapClient | null = null;
    try {
      imapCopia = await ImapClient.connect(cred.imap_host as string, cred.imap_port as number);
      const authImap = await imapCopia.login(fromAddress, password);
      if (authImap.ok) {
        const carpeta = await imapCopia.carpetaDeEnviados();
        if (carpeta) {
          const ap = await imapCopia.appendMessage(carpeta, "\\Seen", rfc822);
          guardadoEnEnviados = ap.ok;

          // Se siembra la caché para que aparezca YA en la pantalla (ver
          // sembrar.ts): Enviados se barre cada 30 min.
          if (ap.ok && ap.uid != null && ap.uidvalidity != null) {
            const limpio = c.html ? sanitizeEmailHtml(c.html) : null;
            await admin.from("mail_messages").upsert(filaSembrada({
              userId,
              folder: carpeta,
              uidvalidity: ap.uidvalidity,
              uid: ap.uid,
              fromAddress,
              nombre: (perfil?.full_name as string) ?? "",
              to: c.to,
              cc: c.cc,
              subject: c.subject,
              text: c.text,
              html: c.html,
              limpio: limpio ? { html: limpio.html, remoteImages: limpio.remoteImages } : null,
              adjuntos: c.adjuntos,
              rfc822,
              inReplyTo: c.inReplyTo,
              references: c.references,
            }), { onConflict: "user_id,folder,uidvalidity,uid" });
          }
        }
      }
    } catch (e) {
      console.error("[mail-fetch] no se pudo guardar la copia en Enviados", e);
    } finally {
      if (imapCopia) {
        await imapCopia.logout();
        imapCopia.close();
      }
    }

    // ── Menciones ──────────────────────────────────────────────────────────
    // A quien lo mencionaron con @ le llega, además del correo, un aviso dentro
    // de Maven. Va DESPUÉS del envío y envuelto en su propio try/catch: el
    // correo ya salió, y fallar acá no puede convertir un envío exitoso en un
    // error para quien escribió.
    let avisados = 0;
    try {
      // Nunca avisarse a uno mismo: mencionarse es raro pero posible, y recibir
      // "te mencionaste" es ruido puro.
      const destinos = c.menciones.filter((id) => id !== userId);
      if (destinos.length) {
        // Se confirma contra el directorio en vez de confiar en el navegador: un
        // id inventado no puede generar una notificación.
        const { data: reales } = await admin
          .from("v_directorio_correo")
          .select("user_id")
          .in("user_id", destinos);
        const validos = ((reales ?? []) as { user_id: string }[]).map((r) => r.user_id);
        if (validos.length) {
          const quien = (perfil?.full_name as string) || fromAddress;
          const { error: errNotif } = await admin.from("notifications").insert(
            validos.map((uid) => ({
              user_id: uid,
              type: "correo_mencion",
              title: `${quien} te mencionó en un correo`,
              message: c.subject,
              module_origin: "Correo",
              required_permission_module: "Correo",
              // validate_notification_fields solo acepta high/medium/low: con
              // "normal" la base rechazaba el aviso y nunca llegó uno. high =
              // como una mención del Messenger (también va al teléfono).
              priority: "high",
              deep_link_url: "/correo",
            })),
          );
          if (errNotif) console.error("[mail-fetch] menciones:", errNotif.message);
          else avisados = validos.length;
        }
      }
    } catch (e) {
      console.error("[mail-fetch] menciones:", (e as Error).message);
    }

    return { ok: true, from: fromAddress, guardadoEnEnviados, avisados };
  } catch (e) {
    const msg = (e as Error).message ?? "error de SMTP";
    await admin.from("mail_credentials").update({ last_error: msg }).eq("id", cred.id);
    return { ok: false, status: 502, error: msg };
  } finally {
    if (smtp) {
      await smtp.quit();
      smtp.close();
    }
  }
}
