// portal-creadoras — la agencia le da (y le quita) a una creadora el acceso a su
// espacio en Maven. QUIÉN y QUÉ: ver logica.ts. La tabla y las funciones de la
// base: migraciones/20261006100000_portal_creadoras_cuentas.sql.
//
// verify_jwt = false (config.toml): la sesión se valida aquí con getUser, igual
// que admin-user-actions, para poder contestar 401 con un código que la app lea.
//
// Los correos salen por Resend, como forgot-password y admin-user-actions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsFor } from "../_shared/cors.ts";
import { type ComoPersona, manejar, type Puertos } from "./logica.ts";

const corsHeaders = (req: Request) =>
  corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" });

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

// Bloqueo de una cuenta a la que no le queda ninguna ficha: 100 años. No se borra:
// si la vuelven a invitar, se desbloquea y conserva su contraseña.
const BLOQUEO = "876000h";

function contrasenaAlAzar(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/[^A-Za-z0-9]/g, "").slice(0, 32) + "Aa1";
}

function puertosReales(): Puertos & { salida: string } {
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const appUrl = (Deno.env.get("APP_URL") || "https://app.maven-ai.me").replace(/\/+$/, "");
  const salida = Deno.env.get("NOTIFICATION_FROM_EMAIL") || "noreply@mail.maven-ai.me";

  return {
    appUrl,
    salida,
    persona: async (token) => {
      const { data: { user } } = await admin.auth.getUser(token);
      if (!user) return null;
      return { id: user.id, esCreadora: (user.app_metadata as { tipo?: string } | undefined)?.tipo === "creadora" };
    },
    comoPersona: (token, userId): ComoPersona => {
      // El cliente de la persona: anon key + su JWT. Todo lo que lee pasa por su RLS.
      const db = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      return {
        veCreadora: async (creatorId) => {
          const { data, error } = await db.from("creators").select("id").eq("id", creatorId).maybeSingle();
          if (error) throw new Error(`no se pudo leer la creadora: ${error.message}`);
          return !!data;
        },
        puedeInvitar: async () => {
          const { data, error } = await db.rpc("can_use_module_function", {
            _user_id: userId,
            _module: "Creadores",
            _submodule: "Invitar al portal",
            _fallback_group: "supervisor_or_above",
          });
          if (error) throw new Error(`no se pudo leer el permiso: ${error.message}`);
          return data === true;
        },
      };
    },
    agenciaDe: async (userId) => {
      const { data, error } = await admin.from("tenant_members").select("tenant_id").eq("user_id", userId).maybeSingle();
      if (error) throw new Error(`no se pudo leer la agencia: ${error.message}`);
      return (data as { tenant_id: string } | null)?.tenant_id ?? null;
    },
    ficha: async (creatorId) => {
      const { data, error } = await admin
        .from("creators")
        .select("tenant_id, name, artistic_name, email")
        .eq("id", creatorId)
        .maybeSingle();
      if (error) throw new Error(`no se pudo leer la ficha: ${error.message}`);
      if (!data) return null;
      const f = data as { tenant_id: string; name: string; artistic_name: string | null; email: string | null };
      return { tenant_id: f.tenant_id, nombre: f.artistic_name || f.name, correo: f.email };
    },
    nombreAgencia: async (tenantId) => {
      const { data } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();
      return (data as { name: string } | null)?.name ?? "Tu agencia";
    },
    cuentaDeFicha: async (creatorId) => {
      const { data, error } = await admin
        .from("creadora_cuentas")
        .select("user_id, correo, correo_visible")
        .eq("creator_id", creatorId)
        .maybeSingle();
      if (error) throw new Error(`no se pudo leer la cuenta: ${error.message}`);
      return data as { user_id: string; correo: string; correo_visible: string } | null;
    },
    fichasDeCuenta: async (userId) => {
      const { count, error } = await admin
        .from("creadora_cuentas")
        .select("creator_id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (error) throw new Error(`no se pudieron contar las fichas: ${error.message}`);
      return count ?? 0;
    },
    cuentaPorCorreo: async (correo) => {
      const { data, error } = await admin.rpc("portal_cuenta_por_correo", { p_correo: correo });
      if (error) throw new Error(`no se pudo buscar el correo: ${error.message}`);
      const fila = (data as { user_id: string; tipo: string; es_de_agencia: boolean }[] | null)?.[0];
      return fila ?? null;
    },
    crearCuenta: async (correo, nombre) => {
      const { data, error } = await admin.auth.admin.createUser({
        email: correo,
        password: contrasenaAlAzar(),
        email_confirm: true,
        user_metadata: { full_name: nombre },
        // La marca que la base reconoce (20261005140100): sin rol de la agencia.
        app_metadata: { tipo: "creadora" },
      });
      if (error || !data.user) return { error: error?.message ?? "sin usuario" };
      return { id: data.user.id };
    },
    borrarCuenta: async (userId) => {
      await admin.auth.admin.deleteUser(userId);
    },
    bloqueada: async (userId) => {
      const { data } = await admin.auth.admin.getUserById(userId);
      const hasta = (data.user as { banned_until?: string | null } | null)?.banned_until;
      return !!hasta && new Date(hasta).getTime() > Date.now();
    },
    bloquear: async (userId) => {
      await admin.auth.admin.updateUserById(userId, { ban_duration: BLOQUEO });
    },
    desbloquear: async (userId) => {
      await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
    },
    atar: async (fila) => {
      const { error } = await admin.from("creadora_cuentas").insert(fila);
      return { error: error?.message ?? null };
    },
    desatar: async (creatorId) => {
      const { error } = await admin.from("creadora_cuentas").delete().eq("creator_id", creatorId);
      if (error) throw new Error(`no se pudo quitar el acceso: ${error.message}`);
    },
    cambiarCorreo: async (userId, creatorId, correo) => {
      const { error } = await admin.auth.admin.updateUserById(userId, { email: correo, email_confirm: true });
      if (error) return { error: error.message };
      const { error: e2 } = await admin.from("creadora_cuentas").update({ correo }).eq("creator_id", creatorId);
      return { error: e2?.message ?? null };
    },
    enlaceContrasena: async (correo) => {
      const { data, error } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: correo,
        options: { redirectTo: `${appUrl}/reset-password` },
      });
      if (error) {
        console.error("[portal-creadoras] generateLink:", error.message);
        return null;
      }
      return data?.properties?.action_link ?? null;
    },
    enviarCorreo: async ({ para, remitente, asunto, html }) => {
      const llave = Deno.env.get("RESEND_API_KEY");
      if (!llave) return { enviado: false, error: "sin_resend" };
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${llave}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: remitente, to: [para], subject: asunto, html }),
        });
        if (!res.ok) return { enviado: false, error: `resend ${res.status}` };
        return { enviado: true, error: null };
      } catch (e) {
        return { enviado: false, error: (e as Error).message };
      }
    },
    anotar: async (creatorId, userId, accion, antes, despues) => {
      const { error } = await admin.from("creator_history").insert({
        creator_id: creatorId,
        user_id: userId,
        action: accion,
        old_value: antes,
        new_value: despues,
      });
      if (error) console.error("[portal-creadoras] historial:", error.message);
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "solo_post" }, 405);

  try {
    // Identidad: el token de la persona, nunca un id que venga en el cuerpo.
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const body = await req.json().catch(() => ({}));
    const res = await manejar(token, (body ?? {}) as Record<string, unknown>, puertosReales());
    return json(req, res.body, res.status);
  } catch (e) {
    console.error("[portal-creadoras]", e);
    return json(req, { error: "error_inesperado" }, 500);
  }
});
