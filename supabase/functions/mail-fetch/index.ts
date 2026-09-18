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
import { decodeBodyToBytes, extraerAdjunto, parseMessage } from "../_shared/mime.ts";
import { parsearBodyStructure, parteDelAdjunto } from "../_shared/bodystructure.ts";
import { sanitizeEmailHtml } from "../_shared/html-sanitize.ts";
import { tamanoDeBase64 } from "../_shared/base64.ts";
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
      action, folder, limit, seq, mark_read, with_bodies, uid, attachment_index,
      to, cc, bcc, subject, text, html, in_reply_to, references, attachments, query,
    } = body as {
      action?: string;
      folder?: string;
      limit?: number;
      /** Texto a buscar (acción imap_search). */
      query?: string;
      /** UID estable del mensaje (para descargar un adjunto). */
      uid?: number;
      /** Posición del adjunto en el mensaje, igual orden que `attachments`. */
      attachment_index?: number;
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
      /** Adjuntos a enviar: nombre, tipo y contenido en base64.
       *  `contentId` presente = es una imagen PEGADA en el cuerpo, no un
       *  archivo adjunto: viaja con Content-ID y el HTML la referencia con
       *  `src="cid:…"`. */
      attachments?: Array<{
        filename: string; contentType: string; contentBase64: string; contentId?: string;
      }>;
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
    // === BULK === (Jhon, 09/09/2026: la barra de selección del correo, como
    // en Gmail, tiene que HACER algo). Una sola sesión IMAP para todo el lote.
    //   op: seen | unseen | delete | archive | spam · uids: number[] (máx. 200)
    // Carpetas de Zoho: Papelera, Archive, "Correo no deseado". Eliminar mueve
    // a Papelera; dentro de la Papelera borra de verdad. La caché
    // (mail_messages / mail_folders) se ajusta al momento y el sincronizador
    // la termina de cuadrar en su próximo barrido.
    if (action === "bulk") {
      const { op, uids, dest: destPedido } = body as
        { op?: string; uids?: unknown; dest?: unknown };
      const ops = new Set(["seen", "unseen", "delete", "archive", "spam", "move"]);
      if (!op || !ops.has(op)) return json(req, { error: "op inválida" }, 400);
      const lista = (Array.isArray(uids) ? uids : [])
        .map((u) => Number(u)).filter((u) => Number.isInteger(u) && u > 0).slice(0, 200);
      if (!lista.length) return json(req, { error: "uids es requerido" }, 400);
      const box = (folder ?? "INBOX").slice(0, 200);

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
      if (!password) return json(req, { error: "no se pudo descifrar la credencial — hay que re-provisionarla" }, 500);

      const DESTINO: Record<string, string> = { archive: "Archive", spam: "Correo no deseado", delete: "Papelera" };
      let client: ImapClient | null = null;
      try {
        client = await ImapClient.connect(cred.imap_host as string, cred.imap_port as number);
        const auth = await client.login(cred.email_address as string, password);
        if (!auth.ok) return json(req, { error: `IMAP rechazó la credencial: ${auth.error}` }, 502);
        // ── El destino de "Mover a" ────────────────────────────────────
        // ⚠️ NO se acepta el nombre tal cual: termina dentro de un comando
        // IMAP. Se compara contra las carpetas REALES de la cuenta y solo se
        // usa la que coincide exacto. Así, además de cerrar la inyección, un
        // nombre con un typo falla acá con un mensaje claro en vez de que
        // IMAP conteste algo críptico — o peor, que mueva a una carpeta que
        // se crea sola.
        let destino = "";
        if (op === "move") {
          const pedido = typeof destPedido === "string" ? destPedido.trim() : "";
          if (!pedido) return json(req, { error: "falta la carpeta de destino" }, 400);
          const carpetas = await client.listFolders();
          if (!carpetas.ok) {
            return json(req, { error: `IMAP no pudo listar las carpetas: ${carpetas.error}` }, 502);
          }
          destino = carpetas.folders.find((f) => f === pedido) ?? "";
          if (!destino) return json(req, { error: `no existe la carpeta "${pedido}"` }, 400);
        }

        const sel = await client.selectFolder(box);
        if (!sel.ok) return json(req, { error: `IMAP SELECT ${box}: ${sel.error}` }, 502);

        let ok = false;
        let movidos = false;
        if (op === "seen" || op === "unseen") {
          ok = await client.storeFlagsUids(lista, op === "seen" ? "+FLAGS" : "-FLAGS", "\\Seen");
        } else if (op === "delete" && box === "Papelera") {
          ok = await client.deleteUids(lista);
          movidos = true;
        } else {
          const dest = op === "move" ? destino : DESTINO[op];
          if (dest === box) return json(req, { error: `ya están en ${box}` }, 409);
          ok = await client.moveUids(lista, dest);
          movidos = true;
        }
        if (!ok) return json(req, { error: `IMAP no pudo aplicar "${op}" en ${box}` }, 502);

        // Caché al momento (la RLS del usuario no deja borrar filas: va con admin).
        if (movidos) {
          await admin.from("mail_messages").delete()
            .eq("user_id", user.id).eq("folder", box).in("uid", lista);
        } else {
          await admin.from("mail_messages").update({ unread: op === "unseen" })
            .eq("user_id", user.id).eq("folder", box).in("uid", lista);
        }
        const { count } = await admin.from("mail_messages")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id).eq("folder", box).eq("unread", true);
        await admin.from("mail_folders").update({ unread: count ?? 0 })
          .eq("user_id", user.id).eq("folder", box);

        return json(req, { ok: true, op, folder: box, afectados: lista.length });
      } catch (e) {
        return json(req, { error: (e as Error).message ?? "error de IMAP" }, 502);
      } finally {
        if (client) {
          await client.logout();
          client.close();
        }
      }
    }

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

    // === BÚSQUEDA EN EL BUZÓN ===
    // IMAP SEARCH del lado del servidor: encuentra en TODO el histórico de la
    // carpeta, no solo en los ~50 que tiene la caché de Postgres. El texto se
    // escapa antes de tocar el socket — mismo cuidado que las direcciones en
    // SMTP: un CRLF sin limpiar inyecta comandos IMAP.
    if (action === "imap_search") {
      const q = (query ?? "").trim();
      if (!q) return json(req, { error: "falta el texto de búsqueda" }, 400);

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
      // Escapado para el quoted-string de IMAP: fuera CR/LF (inyección de
      // comandos) y escapar " y \. CHARSET UTF-8 solo si hay acentos/emojis.
      const esc = q.replace(/[\r\n]/g, " ").replace(/(["\\])/g, "\\$1").slice(0, 200);
      const noAscii = /[^\x00-\x7F]/.test(q);
      const criterio = `${noAscii ? "CHARSET UTF-8 " : ""}TEXT "${esc}"`;

      let client: ImapClient | null = null;
      try {
        client = await ImapClient.connect(cred.imap_host as string, cred.imap_port as number);
        const auth = await client.login(cred.email_address as string, password);
        if (!auth.ok) return json(req, { error: `IMAP rechazó la credencial: ${auth.error}` }, 502);

        const selr = await client.selectFolder(box);
        if (!selr.ok) return json(req, { error: `IMAP SELECT ${box}: ${selr.error}` }, 502);

        const sr = await client.searchUids(criterio);
        if (!sr.ok) return json(req, { error: `IMAP SEARCH: ${sr.error}` }, 502);

        // Los más recientes primero, tope 50 (una búsqueda amplia trae cientos
        // de UIDs; traer todos los cuerpos colgaría la función).
        const uids = sr.uids.slice(-50);
        const fr = await client.fetchSummariesByUids(uids);
        if (!fr.ok) return json(req, { error: `IMAP FETCH: ${fr.error}` }, 502);

        await admin.from("mail_credentials")
          .update({ last_used_at: new Date().toISOString(), last_error: null })
          .eq("id", cred.id);

        return json(req, {
          ok: true,
          folder: box,
          total: sr.uids.length,
          messages: fr.messages,
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

    // === DESCARGA DE UN ADJUNTO ===
    // El binario NO vive en la caché de Postgres (ahí solo está su metadata):
    // se re-baja del proveedor por IMAP, bajo pedido y por UID (estable). Lo
    // dispara el usuario al hacer click en el adjunto de SU correo.
    if (action === "download_attachment") {
      if (typeof uid !== "number") return json(req, { error: "uid es requerido" }, 400);
      const idx = typeof attachment_index === "number" ? attachment_index : -1;
      if (idx < 0) return json(req, { error: "attachment_index es requerido" }, 400);

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
        client = await ImapClient.connect(cred.imap_host as string, cred.imap_port as number);
        const auth = await client.login(cred.email_address as string, password);
        if (!auth.ok) return json(req, { error: `IMAP rechazó la credencial: ${auth.error}` }, 502);

        const selr = await client.selectFolder(box);
        if (!selr.ok) return json(req, { error: `IMAP SELECT ${box}: ${selr.error}` }, 502);

        // La metadata guardada dice QUÉ archivo espera la persona. Sirve para
        // no depender del orden al cruzar con el BODYSTRUCTURE (ver abajo).
        const { data: fila } = await admin
          .from("mail_messages")
          .select("attachments")
          .eq("user_id", user.id)
          .eq("folder", box)
          .eq("uid", uid)
          .limit(1)
          .maybeSingle();
        const meta = (fila?.attachments as
          | { filename?: string; sizeBytes?: number }[]
          | null)?.[idx];

        let adj: { filename: string; contentType: string; bytes: Uint8Array } | null = null;

        // === CAMINO BUENO: pedirle al servidor SOLO esa parte ===
        // Antes se bajaba el correo entero y se cortaba a 20 MB. Un correo de
        // RRHH con 24 hojas de vida (~17 MB de archivos, ~23 MB ya en base64)
        // se pasaba del tope y NINGUNO de los 24 se podía bajar, ni el de
        // 37 KB (reporte de Andrea, 16/09/2026). Pidiendo la parte suelta, lo
        // que se descarga es el archivo y nada más.
        const bs = await client.fetchBodyStructure(uid);
        if (bs.ok) {
          const parte = parteDelAdjunto(parsearBodyStructure(bs.texto), idx, {
            nombre: meta?.filename ?? null,
            bytes: meta?.sizeBytes ?? null,
          });
          if (parte) {
            const trozo = await client.fetchBodyPart(uid, parte.seccion);
            if (trozo.ok && !trozo.truncated) {
              // El CRLF final pertenece al delimitador MIME, no al archivo.
              const cuerpo = trozo.raw.replace(/\r?\n$/, "");
              adj = {
                filename: parte.nombre ?? meta?.filename ?? "adjunto",
                contentType: `${parte.tipo.toLowerCase()}/${parte.subtipo.toLowerCase()}`,
                bytes: decodeBodyToBytes(cuerpo, parte.codificacion),
              };
            } else if (trozo.ok && trozo.truncated) {
              return json(req, {
                error: "ese archivo pesa más de 20 MB y no se puede descargar desde acá",
              }, 413);
            }
          }
        }

        // === RESPALDO: el mensaje entero, como antes ===
        // Para lo que el BODYSTRUCTURE no cubra (servidores raros, estructuras
        // que el lector no entienda). Sigue teniendo el tope viejo, pero ahora
        // es la excepción y no la regla.
        if (!adj) {
          const raw = await client.fetchRawMessageByUid(uid);
          if (!raw.ok) return json(req, { error: `IMAP FETCH: ${raw.error}` }, 502);
          // Si el mensaje se cortó en el tope, el adjunto saldría corrupto:
          // mejor fallar claro que entregar un archivo a medias. ⚠️ El que no
          // entra es el CORREO, no el archivo — decirlo al revés fue lo que
          // hizo creer que un CV de 37 KB era "demasiado grande".
          if (raw.truncated) {
            return json(req, {
              error: "este correo es demasiado grande para abrirlo desde acá",
            }, 413);
          }

          adj = extraerAdjunto(raw.raw, idx);
          if (!adj) return json(req, { error: "ese adjunto no está en el mensaje" }, 404);
        }

        // Techo de respuesta: el JSON con el base64 pesa ~1,37× el archivo, y
        // pasarse revienta el límite de la edge con un error opaco. Mejor
        // cortar claro (los adjuntos gigantes son casos raros).
        if (adj.bytes.length > 20 * 1024 * 1024) {
          return json(req, {
            error: "ese archivo pesa más de 20 MB y no se puede descargar desde acá",
          }, 413);
        }

        await admin.from("mail_credentials")
          .update({ last_used_at: new Date().toISOString(), last_error: null })
          .eq("id", cred.id);

        // Uint8Array → base64 por bloques: `btoa(String.fromCharCode(...todo))`
        // revienta la pila con archivos grandes (spread de cientos de miles).
        let bin = "";
        for (let i = 0; i < adj.bytes.length; i += 0x8000) {
          bin += String.fromCharCode(...adj.bytes.subarray(i, i + 0x8000));
        }
        return json(req, {
          ok: true,
          filename: adj.filename,
          contentType: adj.contentType,
          contentBase64: btoa(bin),
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

    // === GUARDAR / BORRAR BORRADOR EN EL SERVIDOR ===
    // El borrador se sube a la carpeta Borrador (IMAP APPEND, flag \Draft) para
    // verlo desde cualquier dispositivo. El autoguardado local (localStorage)
    // sigue existiendo para no perder lo escrito al instante; esto es la copia
    // persistente y compartida.
    if (action === "save_draft" || action === "delete_draft") {
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

      const box = (folder ?? "Borrador").slice(0, 200);
      let client: ImapClient | null = null;
      try {
        client = await ImapClient.connect(cred.imap_host as string, cred.imap_port as number);
        const auth = await client.login(cred.email_address as string, password);
        if (!auth.ok) return json(req, { error: `IMAP rechazó la credencial: ${auth.error}` }, 502);

        // La carpeta debe estar seleccionada para poder borrar por UID.
        const selr = await client.selectFolder(box);
        if (!selr.ok) return json(req, { error: `IMAP SELECT ${box}: ${selr.error}` }, 502);

        if (action === "delete_draft") {
          if (typeof uid !== "number") return json(req, { error: "uid es requerido" }, 400);
          const ok = await client.deleteByUid(uid);
          return json(req, { ok });
        }

        // save_draft: armar el MIME con el remitente del usuario y subirlo.
        const { data: perfil } = await admin
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();

        const rfc822 = buildMessage({
          from: cred.email_address as string,
          fromName: (perfil?.full_name as string) ?? undefined,
          to: to ?? [],
          cc,
          subject: subject ?? "(sin asunto)",
          text,
          html,
          inReplyTo: in_reply_to,
          references,
        });

        const ap = await client.appendMessage(box, "\\Draft \\Seen", rfc822);
        if (!ap.ok) return json(req, { error: `no se pudo guardar el borrador: ${ap.error}` }, 502);

        // Recién ahora (subido el nuevo) se borra el anterior, si lo había: así
        // un fallo del APPEND nunca deja sin borrador.
        if (typeof uid === "number") await client.deleteByUid(uid);

        await admin.from("mail_credentials")
          .update({ last_used_at: new Date().toISOString(), last_error: null })
          .eq("id", cred.id);

        return json(req, { ok: true, uid: ap.uid ?? null, folder: box });
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
        // ⚠️ El `contentId` termina en una cabecera `Content-ID: <…>`. Se
        // acota acá —y no solo se sanea al armar— para que un valor con
        // CRLF ni siquiera llegue a `buildMessage`.
        if (a.contentId !== undefined &&
            (typeof a.contentId !== "string" || !/^[\w.+-]+@[\w.-]+$/.test(a.contentId))) {
          return json(req, { error: "un adjunto trae un contentId inválido" }, 400);
        }
      }
      // El base64 pesa ~4/3 del archivo; se acota el ARCHIVO a 20 MB (igual que
      // la descarga). De más, revienta la memoria de la edge (256 MB) o el
      // SIZE que anuncia Zoho (31 MB en el cable ≈ 23 MB de archivo).
      const bytesAdjuntos = adjuntos.reduce(
        (n, a) => n + Math.floor((a.contentBase64.replace(/\s/g, "").length * 3) / 4),
        0,
      );
      if (bytesAdjuntos > 20 * 1024 * 1024) {
        return json(req, { error: "los adjuntos superan el límite de 20 MB" }, 413);
      }

      const { data: cred, error: credErr } = await admin
        .from("mail_credentials")
        // imap_host/port van acá además de los de SMTP: después de enviar hay
        // que abrir IMAP para dejar la copia en Enviados.
        .select("id, email_address, secret_cipher, secret_nonce, key_version, smtp_host, smtp_port, imap_host, imap_port")
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
          // ⚠️ DOS FRACASOS DISTINTOS, Y CONFUNDIRLOS DUPLICA CORREOS.
          // `incierto` = el mensaje entero ya viajó y se cortó esperando la
          // confirmación. Puede haberse enviado. Decir "no se pudo enviar"
          // hace que la persona reintente y salga dos veces: pasó el 17/09
          // con 13 hojas de vida a tres destinatarias.
          if (sent.incierto) {
            return json(req, {
              error: "se envió pero el servidor tardó en confirmar: revisá Enviados ANTES de reintentar, puede haber salido",
              code: sent.code,
              incierto: true,
            }, 504);
          }
          return json(req, { error: `no se pudo enviar: ${sent.message}`, code: sent.code }, 502);
        }

        await admin.from("mail_credentials")
          .update({ last_used_at: new Date().toISOString(), last_error: null })
          .eq("id", cred.id);

        // ── Copia en ENVIADOS ──────────────────────────────────────────
        // SMTP entrega al destinatario y nada más: guardar una copia en
        // Enviados es trabajo del CLIENTE, con un APPEND por IMAP. Sin esto,
        // el correo salía bien pero no quedaba rastro en la carpeta —
        // exactamente lo que reportó Jhon.
        //
        // ⚠️ NUNCA falla el envío por esto. El correo YA salió: devolver
        // error acá haría que la persona lo mandara de nuevo y el
        // destinatario lo recibiera dos veces. Si la copia no se pudo
        // guardar, se avisa aparte y el barrido del worker la levanta igual
        // en cuanto pase por la carpeta.
        let guardadoEnEnviados = false;
        let imapCopia: ImapClient | null = null;
        try {
          imapCopia = await ImapClient.connect(
            cred.imap_host as string,
            cred.imap_port as number,
          );
          const authImap = await imapCopia.login(fromAddress, password);
          if (authImap.ok) {
            const carpeta = await imapCopia.carpetaDeEnviados();
            if (carpeta) {
              const ap = await imapCopia.appendMessage(carpeta, "\\Seen", rfc822);
              guardadoEnEnviados = ap.ok;

              // Se siembra la caché para que aparezca YA en la pantalla. El
              // barrido completo pasa cada 30 min y sin esto la persona
              // manda un correo y sigue sin verlo en Enviados: concluye que
              // no se arregló nada.
              if (ap.ok && ap.uid != null && ap.uidvalidity != null) {
                const messageId = rfc822.match(/^Message-ID:\s*(.+)$/im)?.[1]?.trim() ?? null;
                const nombre = (perfil?.full_name as string) ?? "";
                // ⚠️ EL CUERPO TAMBIÉN. Sembrar solo el `snippet` deja la fila
                // con asunto y resumen pero sin `html` ni `text_body`: en la
                // lista el correo se ve bien y al abrirlo dice "(sin
                // contenido)", hasta que el barrido completo pasa por Enviados
                // y lo corrige. Enviados NO está en HOT_FOLDERS, así que esa
                // ventana es de hasta 30 minutos para CADA correo que se manda.
                //
                // Se guarda el html SANEADO, el mismo que guardaría el sync:
                // sembrar el crudo dejaría pasar imágenes remotas que el resto
                // del Correo bloquea y cuenta.
                const limpio = html ? sanitizeEmailHtml(html) : null;
                await admin.from("mail_messages").upsert({
                  user_id: user.id,
                  folder: carpeta,
                  uidvalidity: ap.uidvalidity,
                  uid: ap.uid,
                  from_addr: nombre ? `"${nombre}" <${fromAddress}>` : fromAddress,
                  to_addr: (to ?? []).join(", "),
                  cc_addr: (cc ?? []).join(", "),
                  subject: subject ?? "(sin asunto)",
                  date: new Date().toISOString(),
                  snippet: (text ?? html?.replace(/<[^>]+>/g, " ") ?? "")
                    .replace(/\s+/g, " ").trim().slice(0, 200),
                  html: limpio?.html ?? null,
                  text_body: text ?? null,
                  remote_images: limpio?.remoteImages ?? 0,
                  // La misma forma que escribe el sync ({filename, contentType,
                  // sizeBytes, contentId}), porque el visor y la descarga
                  // buscan la parte por NOMBRE y usan el tamaño de desempate.
                  // Sin esto, tu propio correo recién enviado se ve sin
                  // adjuntos durante media hora.
                  attachments: adjuntos.map((a) => ({
                    filename: a.filename,
                    contentType: a.contentType,
                    sizeBytes: tamanoDeBase64(a.contentBase64),
                    contentId: null,
                  })),
                  unread: false,
                  message_id: messageId,
                }, { onConflict: "user_id,folder,uidvalidity,uid" });
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

        // ── Menciones ────────────────────────────────────────────────────
        // A quien lo mencionaron con @ le llega, además del correo, un aviso
        // dentro de Maven. Va DESPUÉS del envío y envuelto en su propio
        // try/catch: el correo ya salió, y fallar acá no puede convertir un
        // envío exitoso en un error para quien escribió.
        let avisados = 0;
        try {
          const ids = Array.isArray(body.menciones)
            ? [...new Set((body.menciones as unknown[]).map(String))].filter((x) =>
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x),
              )
            : [];
          // Nunca avisarse a uno mismo: mencionarse es raro pero posible, y
          // recibir "te mencionaste" es ruido puro.
          const destinos = ids.filter((id) => id !== user.id);
          if (destinos.length) {
            // Se confirma contra el directorio en vez de confiar en el navegador:
            // un id inventado no puede generar una notificación.
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
                  message: subject,
                  module_origin: "Correo",
                  required_permission_module: "Correo",
                  priority: "normal",
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

        return json(req, {
          ok: true, from: fromAddress, to, cc: cc ?? [], subject,
          guardadoEnEnviados, avisados,
        });
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
