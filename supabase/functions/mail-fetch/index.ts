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
//   folders — carpetas de la casilla del usuario

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { listFolders, refreshUserToken } from "../_shared/zoho-mail.ts";

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

    // Conexión activa del usuario. Sin esto no hay nada que leer.
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

    if (action === "folders") {
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

    return json({ error: `Acción desconocida: ${action}` }, 400);
  } catch (e) {
    console.error("[mail-fetch]", e);
    return json({ error: (e as Error).message ?? "unexpected error" }, 500);
  }
});
