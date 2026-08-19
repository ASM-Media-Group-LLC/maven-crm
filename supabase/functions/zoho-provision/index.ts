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
//   create  — crea una casilla suelta (para el piloto: maven@unlok.me)
//   disable — suspende una casilla
//
// Todo requiere rol admin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createMailbox,
  disableMailbox,
  listAccounts,
  zohoConfigured,
} from "../_shared/zoho.ts";

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
    const { action, email, first_name, last_name, account_id } = body as {
      action?: string;
      email?: string;
      first_name?: string;
      last_name?: string;
      account_id?: string;
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
        sample: (res.data ?? []).slice(0, 5).map((a) => a.primaryEmailAddress),
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

    return json({ error: `Acción desconocida: ${action}` }, 400);
  } catch (e) {
    console.error("[zoho-provision]", e);
    return json({ error: (e as Error).message ?? "unexpected error" }, 500);
  }
});
