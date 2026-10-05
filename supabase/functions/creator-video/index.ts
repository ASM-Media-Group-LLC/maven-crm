// creator-video — video de onboarding de la creadora, guardado en Cloudflare R2.
//
// Hasta 3 videos por creadora. El tope lo hace cumplir un TRIGGER en la base,
// no solo esta función.
//
// Cuatro acciones; las de lectura devuelven URLs FIRMADAS que vencen:
//   upload_url — presigned PUT para que el NAVEGADOR suba directo a R2
//   confirm    — registra el video después del PUT
//   view_url   — presigned GET para reproducirlo
//   delete     — borra la fila y el objeto
//
// QUIÉN PUEDE QUÉ: ver logica.ts (puedeVerVideosDe / puedeEditarVideoDe). Las
// preguntas se hacen con el JWT de la persona (la RLS decide); las escrituras,
// con service_role y solo después de esas preguntas. Desde 20261005150000 nadie
// escribe la tabla por la API: solo esta edge.
//
// ⚠️ POR QUÉ EL NAVEGADOR SUBE DIRECTO Y NO PASA POR AQUÍ: una edge function
// tiene 256 MB de memoria y un video de onboarding pesa cientos de MB. Si el
// archivo pasara por aquí, reventaría con los que importan y funcionaría solo
// con los cortos. La edge solo FIRMA; los bytes nunca la tocan.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
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

function r2(): { cliente: AwsClient; base: string } {
  const cuenta = Deno.env.get("R2_ACCOUNT_ID");
  // Se aceptan LOS DOS nombres a propósito. El egress de LiveKit ya usaba
  // R2_ACCESS_KEY/R2_SECRET en Dokploy, y pedir aquí los nombres del estándar
  // S3 obligaba a tener el mismo valor con dos nombres distintos según dónde
  // se cargue. Eso ya causó un "faltan los secrets de R2" que costó un
  // redespliegue y un rato de búsqueda: la falla no dice qué nombre esperaba.
  const key = Deno.env.get("R2_ACCESS_KEY_ID") ?? Deno.env.get("R2_ACCESS_KEY");
  const secret = Deno.env.get("R2_SECRET_ACCESS_KEY") ?? Deno.env.get("R2_SECRET");
  const bucket = Deno.env.get("R2_BUCKET_ONBOARDING") ?? "maven-onboarding";
  if (!cuenta || !key || !secret) {
    // El mensaje dice QUÉ falta: "faltan los secrets" a secas mandó a revisar
    // los cuatro cuando el problema era el nombre de uno.
    const faltan = [
      !cuenta && "R2_ACCOUNT_ID",
      !key && "R2_ACCESS_KEY_ID (o R2_ACCESS_KEY)",
      !secret && "R2_SECRET_ACCESS_KEY (o R2_SECRET)",
    ].filter(Boolean).join(", ");
    throw new Error(`faltan estos secrets de R2 en Supabase: ${faltan}`);
  }
  return {
    // region "auto" es lo que R2 espera; con otra, la firma no valida.
    cliente: new AwsClient({ accessKeyId: key, secretAccessKey: secret, service: "s3", region: "auto" }),
    base: `https://${cuenta}.r2.cloudflarestorage.com/${bucket}`,
  };
}

/** Firma una URL que vale por `segundos`. `X-Amz-Expires` va en la query:
 *  así el navegador puede usarla sin cabeceras de autorización. */
async function firmar(metodo: "PUT" | "GET", llave: string, segundos: number): Promise<string> {
  const { cliente, base } = r2();
  const url = new URL(`${base}/${llave}`);
  url.searchParams.set("X-Amz-Expires", String(segundos));
  const firmada = await cliente.sign(new Request(url, { method: metodo }), {
    aws: { signQuery: true },
  });
  return firmada.url;
}

function puertosReales(): Puertos {
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    persona: async (token) => {
      const { data: { user } } = await admin.auth.getUser(token);
      return user ? { id: user.id } : null;
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
        tieneModuloCreadores: async () => {
          const { data, error } = await db.rpc("has_permission", {
            _user_id: userId,
            _module: "Creadores",
            _submodule: null,
          });
          if (error) throw new Error(`no se pudo leer el permiso: ${error.message}`);
          return data === true;
        },
        puedeEditarCreadora: async (creatorId) => {
          const { data, error } = await db.rpc("creator_video_puede_editar", { p_creator_id: creatorId });
          if (error) throw new Error(`no se pudo comprobar la edición: ${error.message}`);
          return data === true;
        },
        video: async (videoId) => {
          const { data, error } = await db
            .from("creator_onboarding_videos")
            .select("id, creator_id, storage_key")
            .eq("id", videoId)
            .maybeSingle();
          if (error) throw new Error(`no se pudo leer el video: ${error.message}`);
          return data as { id: string; creator_id: string; storage_key: string } | null;
        },
      };
    },
    contarVideos: async (creatorId) => {
      const { count, error } = await admin
        .from("creator_onboarding_videos")
        .select("id", { count: "exact", head: true })
        .eq("creator_id", creatorId);
      if (error) throw new Error(`no se pudieron contar los videos: ${error.message}`);
      return count ?? 0;
    },
    insertarVideo: async (fila) => {
      const { error } = await admin.from("creator_onboarding_videos").insert(fila);
      return { error: error?.message ?? null };
    },
    borrarFilaVideo: async (videoId) => {
      const { error } = await admin.from("creator_onboarding_videos").delete().eq("id", videoId);
      if (error) throw new Error(`no se pudo borrar el video: ${error.message}`);
    },
    firmar,
    borrarObjeto: async (llave) => {
      const { cliente, base } = r2();
      await cliente.fetch(`${base}/${llave}`, { method: "DELETE" });
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  try {
    // Identidad: el token del usuario, nunca un id que venga en el cuerpo.
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const body = await req.json().catch(() => ({}));
    const res = await manejar(token, (body ?? {}) as Record<string, unknown>, puertosReales());
    return json(req, res.body, res.status);
  } catch (e) {
    console.error("[creator-video]", e);
    return json(req, { error: (e as Error).message ?? "error inesperado" }, 500);
  }
});
