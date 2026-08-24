import { corsFor } from "../_shared/cors.ts";
// Lectura del correo del usuario (Zoho detrás).
//
// Cada request resuelve la conexión del usuario que llama, pide un access
// token fresco con su refresh token, y consulta la API de Zoho. El token
// NUNCA sale de la edge function.
//
// El refresh token vive en `mail_connections`, fuera del GRANT de
// `authenticated` — solo service_role lo lee, que es lo que hacemos acá.
//
// Acciones:
//   folders      — carpetas vía API REST (necesita conexión OAuth)
//   imap_messages — lista de mensajes de una carpeta, vía IMAP
//   imap_message  — un mensaje completo: MIME parseado y HTML saneado
//   send          — envía un correo por SMTP con la misma credencial
//   imap_folders — carpetas vía IMAP con la credencial cifrada. Este es el
//       camino DEFINITIVO: no requiere que la persona autorice nada, así que
//       nunca ve la pantalla de Zoho. El de arriba queda como plan B.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { listFolders, refreshUserToken } from "../_shared/zoho-mail.ts";
import { ImapClient } from "../_shared/imap.ts";
import { parseMessage } from "../_shared/mime.ts";
import { sanitizeEmailHtml } from "../_shared/html-sanitize.ts";
import { buildMessage, esDireccionSmtp, SmtpClient } from "../_shared/smtp.ts";
import { unseal } from "../_shared/mail-crypto.ts";
import { ocultarAvisosDelProveedor } from "../_shared/mail-notices.ts";

const corsHeaders = (req: Request) => corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" });

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(req, { error: "Unauthorized", reason: "missing_auth_header" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);
    if (userError || !user?.id) {
      return json(req, { error: "Unauthorized", reason: "invalid_token" }, 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const {
      action, folder, limit, seq, mark_read, with_bodies,
      to, cc, bcc, subject, text, html, in_reply_to, references, attachments,
    } = body as {
      action?: string;
      folder?: string;
      limit?: number;
      /** Cuantos cuerpos (los mas nuevos) devolver JUNTO con la lista, en
       *  la MISMA sesion IMAP. Zoho raciona las CONEXIONES concurrentes de
       *  una cuenta (una rafaga de 6 se cuelga >45s y termina en 504); un
       *  FETCH mas dentro de la sesion ya abierta cuesta milisegundos. */
      with_bodies?: number;
      /** Número de secuencia del mensaje dentro de la carpeta. */
      seq?: number;
      /** Marcar como leído al abrirlo. Lo decide la interfaz. */
      mark_read?: boolean;
      // --- envío ---
      to?: string[];
      cc?: string[];
      subject?: string;
      text?: string;
      html?: string;
      bcc?: string[];
      /** Message-ID al que se responde, para que el hilo no se corte. */
      in_reply_to?: string;
      references?: string;
      /** Adjuntos a enviar: nombre, tipo y contenido en base64. */
      attachments?: Array<{ filename: string; contentType: string; contentBase64: string }>;
    };
    if (!action) return json(req, { error: "action is required" }, 400);

    // OJO: la búsqueda de la conexión OAuth va DENTRO de `folders`, no
    // antes del dispatch: `imap_folders` no necesita conexión OAuth, y
    // tenerla afuera lo bloqueaba pidiendo algo que no usa.
    if (action === "folders") {
      const { data: conn, error: connErr } = await admin
        .from("mail_connections")
        .select("id, email_address, zoho_account_id, refresh_token")
        .eq("user_id", user.id)
        .is("revoked_at", null)
        .maybeSingle();

      if (connErr) {
        console.error("[mail-fetch] lectura de conexión falló:", connErr.message);
        return json(req, { error: "no se pudo leer tu conexión de correo" }, 500);
      }
      if (!conn) return json(req, { error: "no_connection" }, 409);
      if (!conn.zoho_account_id) {
        return json(req, { error: "la conexión no tiene casilla asociada — reconectá" }, 409);
      }

      const tok = await refreshUserToken(conn.refresh_token as string);
      if (!tok.ok || !tok.data) {
        // Dejamos rastro para que el panel muestre la conexión en rojo en
        // vez de fallar en silencio cada vez que alguien abra el correo.
        await admin
          .from("mail_connections")
          .update({ last_error: tok.error ?? "refresh falló" })
          .eq("id", conn.id);
        return json(req, { error: `no se pudo renovar el acceso: ${tok.error}` }, 502);
      }

      const res = await listFolders(tok.data, conn.zoho_account_id as string);
      if (!res.ok) {
        await admin
          .from("mail_connections")
          .update({ last_error: res.error ?? "folders falló" })
          .eq("id", conn.id);
        return json(req, { error: res.error, status: res.status }, 502);
      }

      // Éxito: limpiamos el último error y marcamos uso.
      await admin
        .from("mail_connections")
        .update({ last_used_at: new Date().toISOString(), last_error: null })
        .eq("id", conn.id);

      return json(req, {
        ok: true,
        email_address: conn.email_address,
        folders: (res.data ?? []).map((f) => ({
          id: f.folderId,
          name: f.folderName,
          type: f.folderType,
          unread: f.unreadCount ?? 0,
          total: f.messageCount ?? 0,
        })),
      });
    }

    // === IMAP_FOLDERS ===
    // Camino sin clics: descifra la credencial que Maven administra y se
    // conecta por IMAP. La persona no autoriza nada ni ve nada de Zoho.
    if (action === "imap_folders") {
      const { data: cred, error: credErr } = await admin
        .from("mail_credentials")
        .select("id, email_address, secret_cipher, secret_nonce, key_version, imap_host, imap_port")
        .eq("user_id", user.id)
        .is("revoked_at", null)
        .maybeSingle();

      if (credErr) {
        console.error("[mail-fetch] lectura de credencial falló:", credErr.message);
        return json(req, { error: "no se pudo leer tu credencial de correo" }, 500);
      }
      if (!cred) return json(req, { error: "no_credential" }, 409);

      const password = await unseal({
        cipher: cred.secret_cipher as string,
        nonce: cred.secret_nonce as string,
        keyVersion: cred.key_version as number,
      });
      if (!password) {
        // Clave de cifrado equivocada o ausente. NO es recuperable acá:
        // hay que re-provisionar la credencial (ensure_credential).
        await admin.from("mail_credentials")
          .update({ last_error: "no se pudo descifrar la credencial" })
          .eq("id", cred.id);
        return json(req, {
          error: "no se pudo descifrar la credencial — hay que re-provisionarla",
        }, 500);
      }

      let client: ImapClient | null = null;
      try {
        client = await ImapClient.connect(
          cred.imap_host as string,
          cred.imap_port as number,
        );
        const auth = await client.login(cred.email_address as string, password);
        if (!auth.ok) {
          await admin.from("mail_credentials")
            .update({ last_error: `IMAP login: ${auth.error ?? "rechazado"}` })
            .eq("id", cred.id);
          return json(req, { error: `IMAP rechazó la credencial: ${auth.error}` }, 502);
        }

        const list = await client.listFolders();
        if (!list.ok) return json(req, { error: `IMAP LIST: ${list.error}` }, 502);

        const inbox = await client.selectFolder("INBOX");

        await admin.from("mail_credentials")
          .update({ last_used_at: new Date().toISOString(), last_error: null })
          .eq("id", cred.id);

        return json(req, {
          ok: true,
          via: "imap",
          email_address: cred.email_address,
          folders: list.folders,
          inbox: inbox.ok ? { total: inbox.exists, recientes: inbox.recent } : null,
        });
      } catch (e) {
        const msg = (e as Error).message ?? "error de IMAP";
        await admin.from("mail_credentials")
          .update({ last_error: msg }).eq("id", cred.id);
        return json(req, { error: msg }, 502);
      } finally {
        // Siempre cerrar: un socket abierto en una edge function que muere
        // deja la conexión colgada del lado del servidor de correo.
        if (client) {
          await client.logout();
          client.close();
        }
      }
    }

    // === IMAP_MESSAGES ===
    // Lista los últimos mensajes de una carpeta. Mismo camino sin clics.
    if (action === "imap_messages") {
      const { data: cred, error: credErr } = await admin
        .from("mail_credentials")
        .select("id, email_address, secret_cipher, secret_nonce, key_version, imap_host, imap_port")
        .eq("user_id", user.id)
        .is("revoked_at", null)
        .maybeSingle();

      if (credErr) {
        console.error("[mail-fetch] lectura de credencial falló:", credErr.message);
        return json(req, { error: "no se pudo leer tu credencial de correo" }, 500);
      }
      if (!cred) return json(req, { error: "no_credential" }, 409);

      const password = await unseal({
        cipher: cred.secret_cipher as string,
        nonce: cred.secret_nonce as string,
        keyVersion: cred.key_version as number,
      });
      if (!password) {
        await admin.from("mail_credentials")
          .update({ last_error: "no se pudo descifrar la credencial" })
          .eq("id", cred.id);
        return json(req, {
          error: "no se pudo descifrar la credencial — hay que re-provisionarla",
        }, 500);
      }

      // Techo duro: sin esto, una bandeja de 20.000 correos intentaría
      // traerse todo y la edge function se muere por timeout.
      const take = Math.min(Math.max(limit ?? 25, 1), 100);
      const box = (folder ?? "INBOX").slice(0, 200);

      let client: ImapClient | null = null;
      try {
        client = await ImapClient.connect(
          cred.imap_host as string,
          cred.imap_port as number,
        );
        const auth = await client.login(cred.email_address as string, password);
        if (!auth.ok) {
          await admin.from("mail_credentials")
            .update({ last_error: `IMAP login: ${auth.error ?? "rechazado"}` })
            .eq("id", cred.id);
          return json(req, { error: `IMAP rechazó la credencial: ${auth.error}` }, 502);
        }

        const sel = await client.selectFolder(box);
        if (!sel.ok) return json(req, { error: `IMAP SELECT ${box}: ${sel.error}` }, 502);

        // Carpeta vacía: no hay rango que pedir, y FETCH 0:0 es un error.
        if (sel.exists === 0) {
          return json(req, {
            ok: true, via: "imap", folder: box, total: 0, messages: [],
          });
        }

        const from = Math.max(1, sel.exists - take + 1);
        const list = await client.fetchSummaries(from, sel.exists);
        if (!list.ok) return json(req, { error: `IMAP FETCH: ${list.error}` }, 502);

        await admin.from("mail_credentials")
          .update({ last_used_at: new Date().toISOString(), last_error: null })
          .eq("id", cred.id);

        const visibles = ocultarAvisosDelProveedor(list.messages);

        // Cuerpos de los mas nuevos, en ESTA sesion. Tope 3: cada cuerpo
        // agrega ~0.5s a la respuesta de la lista.
        const nBodies = Math.min(Math.max(Number(with_bodies) || 0, 0), 3);
        const bodies: unknown[] = [];
        if (nBodies > 0) {
          const top = [...visibles].sort((a, b) => b.seq - a.seq).slice(0, nBodies);
          for (const m of top) {
            const raw = await client.fetchRawMessage(m.seq);
            // Mejor una lista sin cuerpo precargado que un error total.
            if (!raw.ok) continue;
            const parsed = parseMessage(raw.raw);
            const clean = parsed.html ? sanitizeEmailHtml(parsed.html) : null;
            bodies.push({
              ok: true,
              via: "imap",
              folder: box,
              seq: m.seq,
              from: parsed.headers["from"] ?? "",
              to: parsed.headers["to"] ?? "",
              cc: parsed.headers["cc"] ?? "",
              subject: parsed.headers["subject"] ?? "(sin asunto)",
              date: parsed.headers["date"] ?? "",
              html: clean?.html ?? null,
              text: parsed.text,
              remote_images: clean?.remoteImages ?? 0,
              dropped: clean?.dropped ?? [],
              attachments: parsed.attachments,
              truncated: raw.truncated,
            });
          }
        }

        return json(req, {
          ok: true,
          via: "imap",
          folder: box,
          total: sel.exists,
          messages: visibles,
          bodies,
          // Cuántos se ocultaron, para poder auditar el filtro si alguien
          // reporta que "le falta un correo".
          hidden: list.messages.length - visibles.length,
        });
      } catch (e) {
        const msg = (e as Error).message ?? "error de IMAP";
        await admin.from("mail_credentials")
          .update({ last_error: msg }).eq("id", cred.id);
        return json(req, { error: msg }, 502);
      } finally {
        if (client) {
          await client.logout();
          client.close();
        }
      }
    }

    // === IMAP_MESSAGE ===
    // Un mensaje completo: se trae en crudo, se parsea el árbol MIME y se
    // sanea el HTML antes de devolverlo.
    // === MARK_SEEN ===
    // Solo pone la bandera \Seen, sin bajar el cuerpo. Existe para que el
    // frontend pueda PRE-CARGAR mensajes (al pasar el mouse, los más
    // nuevos al entrar) sin marcarlos leídos: "leído" es una decisión de
    // quien lo abre, no un efecto de que lo hayamos descargado.
    if (action === "mark_seen") {
      const porUid = typeof (body as { uid?: number }).uid === "number" &&
        (body as { uid: number }).uid > 0;
      if (!porUid && (!seq || seq < 1)) {
        return json(req, { error: "seq o uid es requerido" }, 400);
      }

      const { data: cred, error: credErr } = await admin
        .from("mail_credentials")
        .select("id, email_address, secret_cipher, secret_nonce, key_version, imap_host, imap_port")
        .eq("user_id", user.id)
        .is("revoked_at", null)
        .maybeSingle();
      if (credErr) return json(req, { error: "no se pudo leer tu credencial de correo" }, 500);
      if (!cred) return json(req, { error: "no_credential" }, 409);

      const password = await unseal({
        cipher: cred.secret_cipher as string,
        nonce: cred.secret_nonce as string,
        keyVersion: cred.key_version as number,
      });
      if (!password) {
        return json(req, { error: "no se pudo descifrar la credencial — hay que re-provisionarla" }, 500);
      }

      const box = (folder ?? "INBOX").slice(0, 200);
      let client: ImapClient | null = null;
      try {
        client = await ImapClient.connect(cred.imap_host as string, cred.imap_port as number);
        const auth = await client.login(cred.email_address as string, password);
        if (!auth.ok) return json(req, { error: `IMAP rechazó la credencial: ${auth.error}` }, 502);
        const sel = await client.selectFolder(box);
        if (!sel.ok) return json(req, { error: `IMAP SELECT ${box}: ${sel.error}` }, 502);
        if (porUid) {
          // Por UID (lo que usa la caché): estable, no requiere validar
          // contra `exists` — un UID inexistente es un no-op inofensivo.
          await client.markSeenUid((body as { uid: number }).uid);
          return json(req, { ok: true, folder: box, uid: (body as { uid: number }).uid });
        }
        if ((seq as number) > sel.exists) return json(req, { error: "ese mensaje no existe en la carpeta" }, 404);
        await client.markSeen(seq as number);
        return json(req, { ok: true, folder: box, seq });
      } catch (e) {
        return json(req, { error: (e as Error).message ?? "error de IMAP" }, 502);
      } finally {
        if (client) {
          await client.logout();
          client.close();
        }
      }
    }

    if (action === "imap_message") {
      if (!seq || seq < 1) return json(req, { error: "seq es requerido" }, 400);

      const { data: cred, error: credErr } = await admin
        .from("mail_credentials")
        .select("id, email_address, secret_cipher, secret_nonce, key_version, imap_host, imap_port")
        .eq("user_id", user.id)
        .is("revoked_at", null)
        .maybeSingle();

      if (credErr) return json(req, { error: "no se pudo leer tu credencial de correo" }, 500);
      if (!cred) return json(req, { error: "no_credential" }, 409);

      const password = await unseal({
        cipher: cred.secret_cipher as string,
        nonce: cred.secret_nonce as string,
        keyVersion: cred.key_version as number,
      });
      if (!password) {
        return json(req, {
          error: "no se pudo descifrar la credencial — hay que re-provisionarla",
        }, 500);
      }

      const box = (folder ?? "INBOX").slice(0, 200);
      let client: ImapClient | null = null;
      try {
        client = await ImapClient.connect(
          cred.imap_host as string,
          cred.imap_port as number,
        );
        const auth = await client.login(cred.email_address as string, password);
        if (!auth.ok) return json(req, { error: `IMAP rechazó la credencial: ${auth.error}` }, 502);

        const sel = await client.selectFolder(box);
        if (!sel.ok) return json(req, { error: `IMAP SELECT ${box}: ${sel.error}` }, 502);
        if (seq > sel.exists) return json(req, { error: "ese mensaje no existe en la carpeta" }, 404);

        const raw = await client.fetchRawMessage(seq);
        if (!raw.ok) return json(req, { error: `IMAP FETCH: ${raw.error}` }, 502);

        const parsed = parseMessage(raw.raw);

        // El HTML del correo lo escribió un tercero: se sanea SIEMPRE, y el
        // frontend además lo pinta dentro de un iframe sin permisos.
        const clean = parsed.html ? sanitizeEmailHtml(parsed.html) : null;

        if (mark_read) await client.markSeen(seq);

        await admin.from("mail_credentials")
          .update({ last_used_at: new Date().toISOString(), last_error: null })
          .eq("id", cred.id);

        return json(req, {
          ok: true,
          via: "imap",
          folder: box,
          seq,
          from: parsed.headers["from"] ?? "",
          to: parsed.headers["to"] ?? "",
          cc: parsed.headers["cc"] ?? "",
          subject: parsed.headers["subject"] ?? "(sin asunto)",
          date: parsed.headers["date"] ?? "",
          html: clean?.html ?? null,
          text: parsed.text,
          // El frontend bloquea las remotas hasta que el usuario decida:
          // cargarlas le confirma al remitente que abrió el correo.
          remote_images: clean?.remoteImages ?? 0,
          dropped: clean?.dropped ?? [],
          attachments: parsed.attachments,
          truncated: raw.truncated,
        });
      } catch (e) {
        const msg = (e as Error).message ?? "error de IMAP";
        await admin.from("mail_credentials").update({ last_error: msg }).eq("id", cred.id);
        return json(req, { error: msg }, 502);
      } finally {
        if (client) {
          await client.logout();
          client.close();
        }
      }
    }

    // === SEND ===
    if (action === "send") {
      if (!to?.length) return json(req, { error: "hace falta al menos un destinatario" }, 400);
      if (!subject && !text && !html) {
        return json(req, { error: "el correo está vacío" }, 400);
      }

      // Validación en el SERVIDOR de cada dirección. La del composer es
      // ayuda de UI: quien llame a esta función con el JWT y un cuerpo
      // armado a mano se la saltea. Sin esto, un \r\n en un destinatario
      // inyecta comandos en la sesión SMTP (ver esDireccionSmtp).
      const sospechosas = [...to, ...(cc ?? []), ...(bcc ?? [])]
        .filter((d) => !esDireccionSmtp(d));
      if (sospechosas.length) {
        return json(req, {
          error: "hay direcciones inválidas",
          direcciones: sospechosas.map((d) => String(d).replace(/[\r\n]/g, "\\n").slice(0, 60)),
        }, 400);
      }

      // Adjuntos: forma correcta y tamaño total acotado. El saneo del nombre y
      // del tipo (contra inyección de encabezados) lo hace buildMessage.
      const adjuntos = Array.isArray(attachments) ? attachments : [];
      for (const a of adjuntos) {
        if (
          !a || typeof a.filename !== "string" ||
          typeof a.contentType !== "string" || typeof a.contentBase64 !== "string"
        ) {
          return json(req, { error: "un adjunto viene con formato inválido" }, 400);
        }
      }
      // El base64 pesa ~4/3 del archivo; se acota el ARCHIVO a 15 MB (igual que
      // la descarga). De más, revienta la memoria/límite de la edge.
      const bytesAdjuntos = adjuntos.reduce(
        (n, a) => n + Math.floor((a.contentBase64.replace(/\s/g, "").length * 3) / 4),
        0,
      );
      if (bytesAdjuntos > 15 * 1024 * 1024) {
        return json(req, { error: "los adjuntos superan el límite de 15 MB" }, 413);
      }

      const { data: cred, error: credErr } = await admin
        .from("mail_credentials")
        .select("id, email_address, secret_cipher, secret_nonce, key_version, smtp_host, smtp_port")
        .eq("user_id", user.id)
        .is("revoked_at", null)
        .maybeSingle();

      if (credErr) return json(req, { error: "no se pudo leer tu credencial de correo" }, 500);
      if (!cred) return json(req, { error: "no_credential" }, 409);

      const password = await unseal({
        cipher: cred.secret_cipher as string,
        nonce: cred.secret_nonce as string,
        keyVersion: cred.key_version as number,
      });
      if (!password) {
        return json(req, {
          error: "no se pudo descifrar la credencial — hay que re-provisionarla",
        }, 500);
      }

      // El remitente SIEMPRE es la casilla del usuario, nunca lo que venga
      // en el cuerpo del request: si no, cualquiera podría mandar correo
      // haciéndose pasar por otra persona de la empresa.
      const fromAddress = cred.email_address as string;

      // Nombre para mostrar: el del perfil de Maven.
      const { data: perfil } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

      const rfc822 = buildMessage({
        from: fromAddress,
        fromName: (perfil?.full_name as string) ?? undefined,
        to,
        cc,
        subject: subject ?? "(sin asunto)",
        text,
        html,
        inReplyTo: in_reply_to,
        references,
        attachments: adjuntos,
      });

      let smtp: SmtpClient | null = null;
      try {
        smtp = await SmtpClient.connect(
          cred.smtp_host as string,
          cred.smtp_port as number,
        );
        const auth = await smtp.login(fromAddress, password);
        if (!auth.ok) {
          await admin.from("mail_credentials")
            .update({ last_error: `SMTP login: ${auth.message}` })
            .eq("id", cred.id);
          return json(req, { error: `SMTP rechazó la credencial: ${auth.message}` }, 502);
        }

        // Cco va SOLO como destinatario SMTP (RCPT TO): buildMessage no
        // escribe ningún header Bcc, que es exactamente lo que lo hace
        // "oculto" — los demás destinatarios nunca lo ven.
        const all = [...to, ...(cc ?? []), ...(bcc ?? [])];
        const sent = await smtp.sendMessage(fromAddress, all, rfc822);
        if (!sent.ok) {
          return json(req, { error: `no se pudo enviar: ${sent.message}`, code: sent.code }, 502);
        }

        await admin.from("mail_credentials")
          .update({ last_used_at: new Date().toISOString(), last_error: null })
          .eq("id", cred.id);

        return json(req, { ok: true, from: fromAddress, to, cc: cc ?? [], subject });
      } catch (e) {
        const msg = (e as Error).message ?? "error de SMTP";
        await admin.from("mail_credentials").update({ last_error: msg }).eq("id", cred.id);
        return json(req, { error: msg }, 502);
      } finally {
        if (smtp) {
          await smtp.quit();
          smtp.close();
        }
      }
    }

    return json(req, { error: `Acción desconocida: ${action}` }, 400);
  } catch (e) {
    console.error("[mail-fetch]", e);
    return json(req, { error: (e as Error).message ?? "unexpected error" }, 500);
  }
});
