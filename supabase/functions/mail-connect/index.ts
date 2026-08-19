// Conectar la casilla de correo de cada usuario a Maven (OAuth con Zoho).
//
// FLUJO:
//   1. El frontend llama `start` → devolvemos la URL de Zoho + un state firmado.
//   2. El usuario autoriza en Zoho → Zoho redirige al frontend con ?code&state.
//   3. El frontend llama `callback` CON SU JWT → canjeamos el code, resolvemos
//      el accountId y guardamos la conexión.
//
// POR QUÉ EL CALLBACK LO HACE EL FRONTEND Y NO ZOHO DIRECTO: si la URL de
// redirección apuntara acá, la request llegaría sin sesión de Maven y no
// sabríamos de quién es el correo que estamos conectando. Con el frontend
// en el medio, el canje viaja autenticado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildAuthUrl,
  exchangeCode,
  getMyAccounts,
  oauthConfigured,
} from "../_shared/zoho-mail.ts";

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

function redirectUri(): string {
  return Deno.env.get("ZOHO_OAUTH_REDIRECT_URI") ??
    "https://maven.asmtech.ai/correo/conectar";
}

// ---- state firmado ----
// El ataque que esto previene: alguien te pasa un link de callback con SU
// code, y si lo aceptáramos quedaría SU casilla colgada de TU cuenta de
// Maven. Firmamos el user_id y en el callback exigimos que coincida con
// quien llama. Sin tabla de por medio: el HMAC es autosuficiente.
async function hmacKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("ZOHO_OAUTH_CLIENT_SECRET") ?? "";
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signState(userId: string): Promise<string> {
  const payload = `${userId}.${Date.now()}`;
  const sig = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    new TextEncoder().encode(payload),
  );
  return `${b64url(new TextEncoder().encode(payload))}.${b64url(new Uint8Array(sig))}`;
}

const STATE_TTL_MS = 15 * 60 * 1000;

async function verifyState(state: string, userId: string): Promise<string | null> {
  const parts = state.split(".");
  if (parts.length !== 2) return "state con formato inválido";
  let payload: string;
  try {
    payload = atob(parts[0].replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return "state ilegible";
  }
  const sig = Uint8Array.from(
    atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(),
    sig,
    new TextEncoder().encode(payload),
  );
  if (!valid) return "firma del state inválida";

  const [stateUser, ts] = payload.split(".");
  if (stateUser !== userId) return "el state pertenece a otro usuario";
  if (Date.now() - Number(ts) > STATE_TTL_MS) return "el state expiró, volvé a empezar";
  return null;
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

    // service_role: es el único que puede escribir/leer refresh_token.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { action, code, state } = body as {
      action?: string; code?: string; state?: string;
    };
    if (!action) return json({ error: "action is required" }, 400);

    if (!oauthConfigured()) {
      return json({
        error: "OAuth de Zoho no configurado",
        missing: ["ZOHO_OAUTH_CLIENT_ID", "ZOHO_OAUTH_CLIENT_SECRET"]
          .filter((k) => !Deno.env.get(k)),
      }, 409);
    }

    // === START: le damos al frontend a dónde mandar al usuario ===
    if (action === "start") {
      const st = await signState(user.id);
      const url = buildAuthUrl(st, redirectUri());
      if (!url) return json({ error: "no se pudo construir la URL de autorización" }, 500);
      return json({ auth_url: url, state: st, redirect_uri: redirectUri() });
    }

    // === CALLBACK: canje + guardado ===
    if (action === "callback") {
      if (!code || !state) return json({ error: "code y state son requeridos" }, 400);

      const stateErr = await verifyState(state, user.id);
      if (stateErr) return json({ error: stateErr }, 400);

      const tokens = await exchangeCode(code, redirectUri());
      if (!tokens.ok || !tokens.data) {
        return json({ error: tokens.error, status: tokens.status }, 502);
      }

      // Resolvemos el accountId ahora y lo guardamos: todas las llamadas
      // de mensajes lo necesitan, y pedirlo en cada request sería un viaje
      // extra a Zoho por cada carga de bandeja.
      const accounts = await getMyAccounts(tokens.data.accessToken);
      if (!accounts.ok) {
        return json({ error: `no se pudo leer la casilla: ${accounts.error}` }, 502);
      }
      const acct = (accounts.data ?? [])[0];
      if (!acct?.accountId || !acct?.primaryEmailAddress) {
        return json({ error: "Zoho no devolvió ninguna casilla para este usuario" }, 502);
      }

      const { error: upsertErr } = await admin
        .from("mail_connections")
        .upsert({
          user_id: user.id,
          provider: "zoho",
          email_address: acct.primaryEmailAddress,
          zoho_account_id: acct.accountId,
          refresh_token: tokens.data.refreshToken,
          scopes: null,
          connected_at: new Date().toISOString(),
          revoked_at: null,
          last_error: null,
        }, { onConflict: "user_id,provider,email_address" });

      if (upsertErr) {
        console.error("[mail-connect] upsert falló:", upsertErr.message);
        return json({ error: "no se pudo guardar la conexión" }, 500);
      }

      // Nunca devolvemos el token, solo qué casilla quedó conectada.
      return json({ ok: true, email_address: acct.primaryEmailAddress });
    }

    // === DISCONNECT ===
    // Marcamos revocada en vez de borrar la fila: queda el rastro de que
    // esa persona alguna vez conectó y cuándo la desconectó.
    if (action === "disconnect") {
      const { error } = await admin
        .from("mail_connections")
        .update({ revoked_at: new Date().toISOString(), refresh_token: "" })
        .eq("user_id", user.id)
        .is("revoked_at", null);
      if (error) return json({ error: "no se pudo desconectar" }, 500);
      return json({ ok: true });
    }

    return json({ error: `Acción desconocida: ${action}` }, 400);
  } catch (e) {
    console.error("[mail-connect]", e);
    return json({ error: (e as Error).message ?? "unexpected error" }, 500);
  }
});
