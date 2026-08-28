// Gestión de API keys de Maven — SOLO admins.
// Acciones: list | create | revoke. El secreto completo se devuelve UNA sola vez
// al crear; después solo queda el hash. verify_jwt=false: validamos el JWT y el
// rol admin acá adentro (mismo gate que el frontend: user_roles.role='admin').
import { corsFor } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SCOPE_CATALOG, isValidScope } from "../_shared/api-scopes.ts";

const corsHeaders = (req: Request) =>
  corsFor(req, {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  });

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });

// mvk_live_<48 hex> = 24 bytes de aleatoriedad (~192 bits). El prefijo público
// para identificar la key en la lista guarda mvk_live_ + los primeros 6 hex.
function generateKey(): { full: string; prefix: string } {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  return { full: `mvk_live_${hex}`, prefix: `mvk_live_${hex.slice(0, 6)}` };
}

async function sha256hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function statusOf(row: { revoked_at: string | null; expires_at: string | null }): string {
  if (row.revoked_at) return "revoked";
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return "expired";
  return "active";
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
    const { data: { user }, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !user?.id) {
      return json(req, { error: "Unauthorized", reason: "invalid_token" }, 401);
    }
    const callerId = user.id;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Gate estricto: SOLO admins (igual que useUserRole().isAdmin en el front).
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .maybeSingle();
    if (roleRow?.role !== "admin") {
      return json(req, { error: "Forbidden: solo administradores pueden gestionar API keys" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;

    // === LIST ===
    if (action === "list") {
      const { data, error } = await admin
        .from("api_keys")
        .select("id, name, key_prefix, scopes, created_at, created_by_email, last_used_at, request_count, expires_at, revoked_at")
        .order("created_at", { ascending: false });
      if (error) return json(req, { error: error.message }, 500);
      const keys = (data ?? []).map((k) => ({ ...k, status: statusOf(k) }));
      return json(req, { keys, scope_catalog: SCOPE_CATALOG });
    }

    // === CREATE ===
    if (action === "create") {
      const name = String(body?.name ?? "").trim();
      const scopes: string[] = Array.isArray(body?.scopes) ? body.scopes : [];
      const expiresAt = body?.expires_at ? new Date(body.expires_at) : null;

      if (!name) return json(req, { error: "El nombre de la key es requerido" }, 400);
      if (scopes.length === 0) return json(req, { error: "Elegí al menos un permiso (scope)" }, 400);
      const bad = scopes.filter((s) => !isValidScope(s));
      if (bad.length) return json(req, { error: `Scope(s) inválido(s): ${bad.join(", ")}` }, 400);
      if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        return json(req, { error: "Fecha de expiración inválida" }, 400);
      }

      const { full, prefix } = generateKey();
      const key_hash = await sha256hex(full);

      const { data: inserted, error } = await admin
        .from("api_keys")
        .insert({
          name,
          key_prefix: prefix,
          key_hash,
          scopes,
          created_by: callerId,
          created_by_email: user.email ?? null,
          expires_at: expiresAt ? expiresAt.toISOString() : null,
        })
        .select("id, name, key_prefix, scopes, created_at, expires_at")
        .single();
      if (error) return json(req, { error: error.message }, 500);

      // El secreto completo viaja UNA sola vez. No se vuelve a poder recuperar.
      return json(req, { ...inserted, key: full, status: "active" }, 201);
    }

    // === REVOKE ===
    if (action === "revoke") {
      const id = String(body?.id ?? "").trim();
      if (!id) return json(req, { error: "id de la key es requerido" }, 400);
      const { data, error } = await admin
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString(), revoked_by: callerId })
        .eq("id", id)
        .is("revoked_at", null)
        .select("id");
      if (error) return json(req, { error: error.message }, 500);
      if (!data?.length) return json(req, { error: "La key no existe o ya estaba revocada" }, 404);
      return json(req, { success: true, id });
    }

    return json(req, { error: `Acción desconocida: ${action ?? "(vacía)"}` }, 400);
  } catch (e) {
    return json(req, { error: String((e as Error)?.message ?? e) }, 500);
  }
});
