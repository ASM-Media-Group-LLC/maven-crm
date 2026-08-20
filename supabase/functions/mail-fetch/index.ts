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
//   imap_folders — carpetas vía IMAP con la credencial cifrada. Este es el
//       camino DEFINITIVO: no requiere que la persona autorice nada, así que
//       nunca ve la pantalla de Zoho. El de arriba queda como plan B.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { listFolders, refreshUserToken } from "../_shared/zoho-mail.ts";
import { ImapClient } from "../_shared/imap.ts";
import { unseal } from "../_shared/mail-crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized", reason: "missing_auth_header" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);
    if (userError || !user?.id) {
      return json({ error: "Unauthorized", reason: "invalid_token" }, 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { action } = body as { action?: string };
    if (!action) return json({ error: "action is required" }, 400);

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
        return json({ error: "no se pudo leer tu conexión de correo" }, 500);
      }
      if (!conn) return json({ error: "no_connection" }, 409);
      if (!conn.zoho_account_id) {
        return json({ error: "la conexión no tiene casilla asociada — reconectá" }, 409);
      }

      const tok = await refreshUserToken(conn.refresh_token as string);
      if (!tok.ok || !tok.data) {
        // Dejamos rastro para que el panel muestre la conexión en rojo en
        // vez de fallar en silencio cada vez que alguien abra el correo.
        await admin
          .from("mail_connections")
          .update({ last_error: tok.error ?? "refresh falló" })
          .eq("id", conn.id);
        return json({ error: `no se pudo renovar el acceso: ${tok.error}` }, 502);
      }

      const res = await listFolders(tok.data, conn.zoho_account_id as string);
      if (!res.ok) {
        await admin
          .from("mail_connections")
          .update({ last_error: res.error ?? "folders falló" })
          .eq("id", conn.id);
        return json({ error: res.error, status: res.status }, 502);
      }

      // Éxito: limpiamos el último error y marcamos uso.
      await admin
        .from("mail_connections")
        .update({ last_used_at: new Date().toISOString(), last_error: null })
        .eq("id", conn.id);

      return json({
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
        return json({ error: "no se pudo leer tu credencial de correo" }, 500);
      }
      if (!cred) return json({ error: "no_credential" }, 409);

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
        return json({
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
          return json({ error: `IMAP rechazó la credencial: ${auth.error}` }, 502);
        }

        const list = await client.listFolders();
        if (!list.ok) return json({ error: `IMAP LIST: ${list.error}` }, 502);

        const inbox = await client.selectFolder("INBOX");

        await admin.from("mail_credentials")
          .update({ last_used_at: new Date().toISOString(), last_error: null })
          .eq("id", cred.id);

        return json({
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
        return json({ error: msg }, 502);
      } finally {
        // Siempre cerrar: un socket abierto en una edge function que muere
        // deja la conexión colgada del lado del servidor de correo.
        if (client) {
          await client.logout();
          client.close();
        }
      }
    }

    return json({ error: `Acción desconocida: ${action}` }, 400);
  } catch (e) {
    console.error("[mail-fetch]", e);
    return json({ error: (e as Error).message ?? "unexpected error" }, 500);
  }
});
