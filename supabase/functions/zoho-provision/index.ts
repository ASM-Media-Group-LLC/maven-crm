// Provisión de casillas Zoho — función de verificación y backfill.
//
// POR QUÉ EXISTE APARTE de admin-user-actions: la salida de Google es un
// proyecto de meses y el alta de usuarios es camino crítico (si se rompe,
// nadie entra a Maven). Metemos la integración con Zoho acá primero, la
// probamos contra la cuenta real, y recién cuando esté verificada la
// colgamos de create_user. Nada de estrenar una API de terceros adentro
// del flujo que le da acceso a la empresa.
//
// Acciones:
//   status  — ¿están los secrets? ¿responde la API? (smoke test)
//   create  — crea una casilla suelta
//   disable — suspende una casilla
//   ensure_credential — resetea la contraseña de una casilla y la guarda
//       cifrada, para que Maven pueda conectarse por IMAP sin que la
//       persona haga nada. Es también la RECUPERACIÓN: si la clave de
//       cifrado se pierde, o la conexión de alguien se rompe, correr esto
//       la deja andando de nuevo. Idempotente: se puede repetir siempre.
//
// Todo requiere rol admin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createMailbox,
  disableMailbox,
  listAccounts,
  resetMailboxPassword,
  zohoConfigured,
} from "../_shared/zoho.ts";
import { cryptoConfigured, seal } from "../_shared/mail-crypto.ts";

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

// Sin caracteres ambiguos (I/O/0/l/1) porque estas contraseñas se pasan
// por chat — PERO con al menos un símbolo, una mayúscula, una minúscula y
// un dígito garantizados: la política de Zoho rechaza el password (400
// "Invalid Input", sin decir cuál campo) si no los tiene.
function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digit = "23456789";
  const symbol = "@#$%*+=?";
  const all = upper + lower + digit + symbol;

  const pick = (set: string, n: number) => {
    const buf = new Uint32Array(n);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => set[b % set.length]);
  };

  // Uno de cada clase + relleno, después barajado Fisher-Yates para no
  // dejar las clases obligatorias siempre en las mismas posiciones.
  const chars = [
    ...pick(upper, 1), ...pick(lower, 1), ...pick(digit, 1), ...pick(symbol, 1),
    ...pick(all, 12),
  ];
  const ord = new Uint32Array(chars.length);
  crypto.getRandomValues(ord);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = ord[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!callerRole) {
      return json({ error: "Forbidden: admin role required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { action, email, first_name, last_name, account_id, user_id } = body as {
      action?: string;
      email?: string;
      first_name?: string;
      last_name?: string;
      account_id?: string;
      /** Usuario de Maven al que pertenece la casilla (para ensure_credential). */
      user_id?: string;
    };

    if (!action) return json({ error: "action is required" }, 400);

    // === STATUS: smoke test de credenciales ===
    // Devuelve solo el conteo y los primeros mails: no volcamos el padrón
    // entero de la organización en una respuesta de diagnóstico.
    if (action === "status") {
      if (!zohoConfigured()) {
        return json({
          configured: false,
          missing: ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN", "ZOHO_ZOID"]
            .filter((k) => !Deno.env.get(k)),
        });
      }
      const res = await listAccounts();
      return json({
        configured: true,
        reachable: res.ok,
        error: res.error,
        status: res.status,
        account_count: res.data?.length ?? null,
        // zuid y accountId son identificadores, no secretos, y sin ellos
        // no se puede diagnosticar ni llamar al resto de las acciones.
        sample: (res.data ?? []).slice(0, 10).map((a) => ({
          email: a.primaryEmailAddress,
          zuid: a.zuid,
          accountId: a.accountId,
        })),
      });
    }

    // === CREATE ===
    if (action === "create") {
      if (!email || !first_name || !last_name) {
        return json({ error: "email, first_name y last_name son requeridos" }, 400);
      }
      const password = generatePassword();
      const res = await createMailbox({ email, firstName: first_name, lastName: last_name, password });

      if (res.skipped) return json({ error: "Zoho no configurado todavía" }, 409);
      if (!res.ok) return json({ error: res.error, status: res.status }, 502);

      // El password va en la respuesta porque el admin tiene que
      // entregárselo a la persona. No queda persistido en ningún lado.
      return json({ ok: true, account: res.data, password });
    }

    // === DISABLE ===
    if (action === "disable") {
      if (!account_id) return json({ error: "account_id es requerido" }, 400);
      const res = await disableMailbox(account_id);
      if (res.skipped) return json({ error: "Zoho no configurado todavía" }, 409);
      if (!res.ok) return json({ error: res.error, status: res.status }, 502);
      return json({ ok: true });
    }

    // === ENSURE_CREDENTIAL ===
    // Resetea la contraseña de la casilla y la guarda cifrada contra el
    // usuario de Maven indicado. La persona no participa ni se entera.
    if (action === "ensure_credential") {
      if (!email || !user_id) {
        return json({ error: "email y user_id son requeridos" }, 400);
      }
      if (!cryptoConfigured()) {
        return json({ error: "falta el secret MAIL_CRED_KEY" }, 409);
      }

      // Necesitamos el zuid, y solo se obtiene listando la organización.
      const accounts = await listAccounts();
      if (!accounts.ok) return json({ error: accounts.error, status: accounts.status }, 502);
      const acct = (accounts.data ?? []).find(
        (a) => (a.primaryEmailAddress ?? "").toLowerCase() === email.toLowerCase(),
      );
      if (!acct?.zuid) {
        return json({ error: `no existe casilla para ${email} en la organización` }, 404);
      }

      const password = generatePassword();
      const reset = await resetMailboxPassword(acct.zuid, password);
      if (!reset.ok) return json({ error: reset.error, status: reset.status }, 502);

      const sealed = await seal(password);
      if (!sealed) return json({ error: "no se pudo cifrar la credencial" }, 500);

      const { error: upErr } = await adminClient
        .from("mail_credentials")
        .upsert({
          user_id,
          email_address: email,
          secret_cipher: sealed.cipher,
          secret_nonce: sealed.nonce,
          key_version: sealed.keyVersion,
          last_error: null,
          revoked_at: null,
        }, { onConflict: "user_id,email_address" });

      if (upErr) {
        console.error("[zoho-provision] upsert de credencial falló:", upErr.message);
        return json({ error: "no se pudo guardar la credencial" }, 500);
      }

      // La contraseña NO se devuelve: nadie la necesita, es de máquina.
      return json({ ok: true, email_address: email, zuid: acct.zuid });
    }

    return json({ error: `Acción desconocida: ${action}` }, 400);
  } catch (e) {
    console.error("[zoho-provision]", e);
    return json({ error: (e as Error).message ?? "unexpected error" }, 500);
  }
});
