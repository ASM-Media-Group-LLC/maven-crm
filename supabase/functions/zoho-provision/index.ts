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
  zohoConfigured,
} from "../_shared/zoho.ts";
import { cryptoConfigured } from "../_shared/mail-crypto.ts";
import { generateMailboxPassword, provisionMailbox } from "../_shared/mail-provision.ts";

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
      const password = generateMailboxPassword();
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

      // Delega en el módulo compartido: es EXACTAMENTE lo mismo que corre
      // el alta de usuario. Tener dos implementaciones de esto es pedir que
      // se separen, y la reparación manual es justo lo que se usa el día
      // que algo ya salió mal — no puede estar desactualizada.
      const nombre = (first_name ?? "Usuario") as string;
      const apellido = (last_name ?? "Maven") as string;
      const res = await provisionMailbox({
        adminClient,
        userId: user_id,
        email,
        firstName: nombre,
        lastName: apellido,
      });
      if (!res.ok) return json({ error: res.error }, 502);

      // La contraseña NO se devuelve: nadie la necesita, es de máquina.
      return json({ ok: true, email_address: res.email_address, outcome: res.outcome });
    }

    return json({ error: `Acción desconocida: ${action}` }, 400);
  } catch (e) {
    console.error("[zoho-provision]", e);
    return json({ error: (e as Error).message ?? "unexpected error" }, 500);
  }
});
