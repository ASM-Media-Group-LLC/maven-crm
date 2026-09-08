// creator-video — video de onboarding de la creadora, guardado en Cloudflare R2.
//
// Tres acciones, todas devuelven URLs FIRMADAS que vencen:
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
      .select("id, onboarding_video_key")
      .eq("id", creator_id)
      .maybeSingle();
    if (!creadora) return json(req, { error: "esa creadora no existe" }, 404);

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

      // Llave nueva SIEMPRE, aunque ya hubiera video: si se reusara la misma,
      // el navegador y el CDN seguirían mostrando el anterior desde su caché.
      const llave = `${creator_id}/${crypto.randomUUID()}.${ext}`;
      return json(req, { url: await firmar("PUT", llave, 3600), key: llave });
    }

    // ── Confirmar (después de que el PUT terminó) ───────────────────────
    if (action === "confirm") {
      const { key, size_bytes } = body as { key?: string; size_bytes?: number };
      // La llave TIENE que ser de esta creadora: si no, alguien podría
      // apuntar la fila de una creadora al video de otra.
      if (!key || !key.startsWith(`${creator_id}/`)) {
        return json(req, { error: "esa llave no es de esta creadora" }, 400);
      }
      const anterior = creadora.onboarding_video_key as string | null;
      await admin.from("creators").update({
        onboarding_video_key: key,
        onboarding_video_at: new Date().toISOString(),
        onboarding_video_bytes: size_bytes ?? null,
        onboarding_video_by: user.id,
      }).eq("id", creator_id);

      // El video viejo se borra DESPUÉS de que la fila apunta al nuevo: al
      // revés, un fallo entre medio deja a la creadora sin video.
      if (anterior && anterior !== key) {
        try {
          const { cliente, base } = r2();
          await cliente.fetch(`${base}/${anterior}`, { method: "DELETE" });
        } catch { /* queda huérfano; es preferible a perder el nuevo */ }
      }
      return json(req, { ok: true });
    }

    // ── Ver ─────────────────────────────────────────────────────────────
    if (action === "view_url") {
      const llave = creadora.onboarding_video_key as string | null;
      if (!llave) return json(req, { error: "esta creadora todavía no tiene video" }, 404);
      // 2 h: alcanza para mirarlo entero sin que el link sirva para compartir.
      return json(req, { url: await firmar("GET", llave, 7200) });
    }

    // ── Borrar ──────────────────────────────────────────────────────────
    if (action === "delete") {
      const llave = creadora.onboarding_video_key as string | null;
      await admin.from("creators").update({
        onboarding_video_key: null,
        onboarding_video_at: null,
        onboarding_video_bytes: null,
        onboarding_video_by: null,
      }).eq("id", creator_id);
      if (llave) {
        try {
          const { cliente, base } = r2();
          await cliente.fetch(`${base}/${llave}`, { method: "DELETE" });
        } catch { /* la fila ya quedó limpia */ }
      }
      return json(req, { ok: true });
    }

    return json(req, { error: `acción desconocida: ${action}` }, 400);
  } catch (e) {
    console.error("[creator-video]", e);
    return json(req, { error: (e as Error).message ?? "error inesperado" }, 500);
  }
});
