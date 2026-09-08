// creator-video — video de onboarding de la creadora, guardado en Cloudflare R2.
//
// Hasta 3 videos por creadora. El tope lo hace cumplir un TRIGGER en la base,
// no solo esta función: la tabla es escribible por RLS y una regla que vive en
// un único camino de escritura no es una regla.
//
// Cuatro acciones, las de lectura devuelven URLs FIRMADAS que vencen:
//   upload_url — presigned PUT para que el NAVEGADOR suba directo a R2
//   view_url   — presigned GET para reproducirlo
//   delete     — borra el objeto y limpia la fila
//
// ⚠️ POR QUÉ EL NAVEGADOR SUBE DIRECTO Y NO PASA POR ACÁ: una edge function
// tiene 256 MB de memoria y un video de onboarding pesa cientos de MB. Si el
// archivo pasara por acá, reventaría con los que importan y funcionaría solo
// con los cortos — el mismo tipo de falla dependiente del tamaño que nos costó
// medio día con el SMTP. La edge solo FIRMA; los bytes nunca la tocan.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
import { corsFor } from "../_shared/cors.ts";

const corsHeaders = (req: Request) =>
  corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" });

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/** Solo video, y solo lo que un <video> sabe reproducir. Un .exe con nombre
 *  de video no se sube: la lista es blanca, no negra. */
const TIPOS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** Tope duro. Un onboarding largo a 1080p ronda 1 GB; 2 GB deja aire sin
 *  volverlo un depósito de archivos. */
const TOPE_BYTES = 2 * 1024 * 1024 * 1024;

function r2(): { cliente: AwsClient; base: string } {
  const cuenta = Deno.env.get("R2_ACCOUNT_ID");
  const key = Deno.env.get("R2_ACCESS_KEY_ID");
  const secret = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_BUCKET_ONBOARDING") ?? "maven-onboarding";
  if (!cuenta || !key || !secret) throw new Error("faltan los secrets de R2");
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Identidad: el token del usuario, nunca un id que venga en el cuerpo.
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json(req, { error: "no autenticado" }, 401);

    const body = await req.json().catch(() => ({}));
    const { action, creator_id } = body as { action?: string; creator_id?: string };
    if (!creator_id) return json(req, { error: "falta creator_id" }, 400);

    const { data: creadora } = await admin
      .from("creators")
      .select("id")
      .eq("id", creator_id)
      .maybeSingle();
    if (!creadora) return json(req, { error: "esa creadora no existe" }, 404);

    /** Los videos de esta creadora, del más viejo al más nuevo. */
    const listar = async () => {
      const { data } = await admin
        .from("creator_onboarding_videos")
        .select("id, storage_key, titulo, size_bytes, created_at, uploaded_by")
        .eq("creator_id", creator_id)
        .order("created_at", { ascending: true });
      return data ?? [];
    };

    // ── Subir ───────────────────────────────────────────────────────────
    if (action === "upload_url") {
      const { content_type, size_bytes } = body as { content_type?: string; size_bytes?: number };
      const ext = TIPOS[content_type ?? ""];
      if (!ext) {
        return json(req, { error: "formato no admitido: sube un MP4, MOV o WEBM" }, 400);
      }
      if (typeof size_bytes !== "number" || size_bytes <= 0) {
        return json(req, { error: "falta el tamaño del archivo" }, 400);
      }
      if (size_bytes > TOPE_BYTES) {
        return json(req, { error: "el video supera el límite de 2 GB" }, 413);
      }

      // Se corta ACÁ si ya hay 3, antes de firmar: dejar subir 800 MB para
      // rechazarlo al confirmar sería cruel.
      if ((await listar()).length >= 3) {
        return json(req, { error: "Esta creadora ya tiene 3 videos. Borra uno antes de subir otro." }, 409);
      }

      // Llave nueva SIEMPRE: si se reusara una, el navegador y el CDN
      // seguirían mostrando el anterior desde su caché.
      const llave = `${creator_id}/${crypto.randomUUID()}.${ext}`;
      return json(req, { url: await firmar("PUT", llave, 3600), key: llave });
    }

    // ── Confirmar (después de que el PUT terminó) ───────────────────────
    if (action === "confirm") {
      const { key, size_bytes, titulo } = body as { key?: string; size_bytes?: number; titulo?: string };
      // La llave TIENE que ser de esta creadora: si no, alguien podría
      // colgarle a una creadora el video de otra.
      if (!key || !key.startsWith(`${creator_id}/`)) {
        return json(req, { error: "esa llave no es de esta creadora" }, 400);
      }
      const { error } = await admin.from("creator_onboarding_videos").insert({
        creator_id,
        storage_key: key,
        titulo: titulo?.trim() || null,
        size_bytes: size_bytes ?? null,
        uploaded_by: user.id,
      });
      if (error) {
        // El trigger del tope llega hasta acá con su propio mensaje: se pasa
        // tal cual, que es más útil que un "error al guardar".
        return json(req, { error: error.message }, 409);
      }
      return json(req, { ok: true });
    }

    // ── Ver ─────────────────────────────────────────────────────────────
    if (action === "view_url") {
      const { video_id } = body as { video_id?: string };
      const fila = (await listar()).find((v) => v.id === video_id);
      if (!fila) return json(req, { error: "ese video no existe" }, 404);
      // 2 h: alcanza para mirarlo entero sin que el link sirva para compartir.
      return json(req, { url: await firmar("GET", fila.storage_key as string, 7200) });
    }

    // ── Borrar ──────────────────────────────────────────────────────────
    if (action === "delete") {
      const { video_id } = body as { video_id?: string };
      const fila = (await listar()).find((v) => v.id === video_id);
      if (!fila) return json(req, { error: "ese video no existe" }, 404);

      // Primero la fila y después el objeto: al revés, si falla el borrado en
      // R2 la ficha queda apuntando a un video que ya no se puede reproducir.
      await admin.from("creator_onboarding_videos").delete().eq("id", video_id);
      try {
        const { cliente, base } = r2();
        await cliente.fetch(`${base}/${fila.storage_key}`, { method: "DELETE" });
      } catch { /* queda huérfano en R2; la ficha ya está limpia */ }
      return json(req, { ok: true });
    }

    return json(req, { error: `acción desconocida: ${action}` }, 400);
  } catch (e) {
    console.error("[creator-video]", e);
    return json(req, { error: (e as Error).message ?? "error inesperado" }, 500);
  }
});
