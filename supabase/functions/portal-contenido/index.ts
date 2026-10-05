// portal-contenido — la creadora y su carpeta de contenido en el Drive de su
// agencia (portal de creadoras, fase 2). QUIÉN y QUÉ: ver logica.ts. «Borrar»,
// para ella, saca de su vista y nada más (creadora_ocultos). La base:
// migrations/20261006120000_portal_contenido.sql.
//
// verify_jwt = false (config.toml): la sesión se valida aquí con getUser, como
// portal-creadoras, para contestar 401 con un código que la app lea.
//
// Los archivos van y vienen del NAS por la misma puerta que el Drive, con el
// mismo permiso firmado (_shared/drive-firma.ts). Variables: DRIVE_NAS_URL y
// DRIVE_SECRETO, las del Drive.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsFor } from "../_shared/cors.ts";
import { ahoraMas, firmar, verificar } from "../_shared/drive-firma.ts";
import { type Item, manejar, type Puertos, VENCE_BORRAR } from "./logica.ts";

const corsHeaders = (req: Request) =>
  corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" });

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

const COLUMNAS = "id, tenant_id, parent_id, unidad_id, owner_id, tipo, nombre, mime, size, estado, storage_key, created_at, updated_at, trashed_at";

function puertosReales(nas: string, secreto: string): Puertos {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const permiso = async (datos: Record<string, unknown>, segundos: number) =>
    `${nas}/o?t=${await firmar(secreto, { ...datos, e: typeof datos.e === "number" ? datos.e : ahoraMas(segundos) } as never)}`;

  return {
    persona: async (token) => {
      const { data: { user } } = await admin.auth.getUser(token);
      if (!user) return null;
      return { id: user.id, esCreadora: (user.app_metadata as { tipo?: string } | undefined)?.tipo === "creadora" };
    },
    fichaDe: async (userId, creatorId) => {
      const { data, error } = await admin.from("creadora_cuentas")
        .select("creator_id, tenant_id").eq("user_id", userId).eq("creator_id", creatorId).maybeSingle();
      if (error) throw new Error(`no se pudo leer la cuenta: ${error.message}`);
      if (!data) return null;
      const { data: c } = await admin.from("creators").select("name, artistic_name").eq("id", creatorId).maybeSingle();
      const f = c as { name: string; artistic_name: string | null } | null;
      return { creator_id: creatorId, tenant_id: (data as { tenant_id: string }).tenant_id, nombre: f?.artistic_name || f?.name || "" };
    },
    carpetaDe: async (ficha) => {
      const leerla = async () => {
        const { data } = await admin.from("creadora_carpetas").select("item_id").eq("creator_id", ficha.creator_id).maybeSingle();
        return (data as { item_id: string } | null)?.item_id ?? null;
      };
      const ya = await leerla();
      if (ya) return ya;
      // La primera vez: una carpeta sin dueño, marcada como unidad de la agencia
      // y como la de esta creadora (los triggers de la base lo revisan).
      const id = crypto.randomUUID();
      const nombre = `Contenido · ${ficha.nombre || "creadora"}`.slice(0, 255);
      const { error: e1 } = await admin.from("drive_items").insert({
        id, tenant_id: ficha.tenant_id, owner_id: null, parent_id: null, tipo: "carpeta", nombre,
      });
      if (e1) throw new Error(`no se pudo crear la carpeta: ${e1.message}`);
      const { error: e2 } = await admin.from("drive_unidades").insert({ item_id: id, tenant_id: ficha.tenant_id, tipo: "empresa" });
      const { error: e3 } = e2 ? { error: e2 } : await admin.from("creadora_carpetas").insert({ creator_id: ficha.creator_id, item_id: id });
      if (e2 || e3) {
        // Dos pedidos a la vez (dos pestañas): gana la primera. Se deshace la mía.
        await admin.from("drive_items").delete().eq("id", id);
        const otra = await leerla();
        if (otra) return otra;
        throw new Error(`no se pudo marcar la carpeta: ${(e2 ?? e3)!.message}`);
      }
      return id;
    },
    item: async (id) => {
      const { data, error } = await admin.from("drive_items").select(COLUMNAS).eq("id", id).maybeSingle();
      if (error) throw new Error(`no se pudo leer: ${error.message}`);
      return data as Item | null;
    },
    itemsPorId: async (ids) => {
      const { data, error } = await admin.from("drive_items").select(COLUMNAS).in("id", ids);
      if (error) throw new Error(`no se pudieron leer: ${error.message}`);
      return (data ?? []) as Item[];
    },
    hijos: async (carpetaId) => {
      const { data, error } = await admin.from("drive_items").select(COLUMNAS)
        .eq("parent_id", carpetaId).is("trashed_at", null).order("nombre").limit(5000);
      if (error) throw new Error(`no se pudo listar: ${error.message}`);
      return (data ?? []) as Item[];
    },
    ocultos: async (creatorId) => {
      const { data, error } = await admin.from("creadora_ocultos").select("item_id").eq("creator_id", creatorId);
      if (error) throw new Error(`no se pudo leer lo oculto: ${error.message}`);
      return new Set(((data ?? []) as { item_id: string }[]).map((x) => x.item_id));
    },
    ocultar: async (itemId, creatorId) => {
      const { error } = await admin.from("creadora_ocultos")
        .upsert({ item_id: itemId, creator_id: creatorId }, { onConflict: "item_id", ignoreDuplicates: true });
      if (error) throw new Error(`no se pudo ocultar: ${error.message}`);
    },
    insertar: async (fila) => {
      const { error } = await admin.from("drive_items").insert(fila);
      return { error: error?.message ?? null };
    },
    renombrar: async (id, nombre) => {
      const { error } = await admin.from("drive_items").update({ nombre }).eq("id", id);
      return { error: error?.message ?? null };
    },
    borrarFila: async (id) => {
      const { error } = await admin.from("drive_items").delete().eq("id", id);
      if (error) throw new Error(`no se pudo borrar: ${error.message}`);
    },
    confirmar: async (id, size, sha256) => {
      const { error } = await admin.from("drive_items").update({ estado: "listo", size, sha256 }).eq("id", id);
      if (error) throw new Error(`no se pudo confirmar: ${error.message}`);
    },
    espacio: async (tenantId) => {
      const { data, error } = await admin.rpc("drive_espacio_de_la_agencia", { p_agencia: tenantId });
      if (error) throw new Error(`no se pudo leer el espacio: ${error.message}`);
      const f = (Array.isArray(data) ? data[0] : data) as { usado: number; cupo: number | null } | undefined;
      return { usado: Number(f?.usado ?? 0), cupo: f?.cupo == null ? null : Number(f.cupo) };
    },
    saludNas: async () => {
      const s = await fetch(`${nas}/salud`, { signal: AbortSignal.timeout(8000) })
        .then((x) => x.json()).catch(() => null) as { raices?: { ok: boolean; libre?: number; total?: number }[] } | null;
      return s?.raices ?? null;
    },
    permiso,
    verificarRecibo: (recibo) => verificar(secreto, recibo) as Promise<Record<string, unknown> | null>,
    borrarEnNas: async (k) => {
      const res = await fetch(await permiso({ op: "borrar", k }, VENCE_BORRAR), { method: "DELETE" });
      return res.ok || res.status === 404;
    },
    uuid: () => crypto.randomUUID(),
    ahora: () => Date.now(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "solo_post" }, 405);

  try {
    const nas = (Deno.env.get("DRIVE_NAS_URL") ?? "").replace(/\/+$/, "");
    const secreto = Deno.env.get("DRIVE_SECRETO") ?? "";
    if (!nas || secreto.length < 32) return json(req, { error: "drive_sin_nas" }, 503);
    // Identidad: el token de la persona, nunca un id que venga en el cuerpo.
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const body = await req.json().catch(() => ({}));
    const res = await manejar(token, (body ?? {}) as Record<string, unknown>, puertosReales(nas, secreto));
    return json(req, res.body, res.status);
  } catch (e) {
    console.error("[portal-contenido]", e);
    return json(req, { error: "error_inesperado" }, 500);
  }
});
