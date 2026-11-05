import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// drive-aporte — subida PÚBLICA por link (Alvaro, 04/11). Alguien abre el link
// SIN cuenta y sube archivos a una carpeta del Drive. Para no exponer una
// escritura pública al bucket, esta edge valida el token del link y entrega una
// URL FIRMADA de subida (una sola, para ese archivo); el navegador sube directo
// a esa URL (sirve para videos grandes). Luego confirma y se registra el aporte.
// Los archivos viven en el bucket privado drive-aportes; un proceso aparte los
// migra al NAS (Alvaro aceptó la demora de unos días). verify_jwt = false.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "drive-aportes";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Clave segura para el storage: sin acentos ni caracteres raros (macOS mete un
// espacio invisible U+202F que rompe la clave entera).
function claveSegura(nombre: string): string {
  const base = (nombre || "archivo")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\- ]+/g, "").trim().slice(0, 120) || "archivo";
  return base.replace(/\s+/g, "_");
}

async function linkActivo(token: string) {
  const { data } = await admin.from("drive_upload_links")
    .select("token, item_id, tenant_id, activo").eq("token", token).maybeSingle();
  return data && data.activo ? data : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "método no permitido" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "cuerpo inválido" }, 400); }

  const action = String(body.action ?? "");
  const token = String(body.token ?? "");
  if (!token) return json({ error: "sin token" }, 400);

  try {
    // Info del link (para pintar la página de subida).
    if (action === "info") {
      const { data: l } = await admin.from("drive_upload_links")
        .select("activo, item_id, nombre").eq("token", token).maybeSingle();
      if (!l) return json({ existe: false });
      const { data: di } = await admin.from("drive_items").select("nombre").eq("id", l.item_id).maybeSingle();
      return json({ existe: true, activo: l.activo === true, carpeta: di?.nombre ?? null, etiqueta: l.nombre ?? null });
    }

    const link = await linkActivo(token);
    if (!link) return json({ error: "El link no es válido o ya fue cerrado." }, 403);

    // Pide una URL firmada para subir UN archivo.
    if (action === "iniciar") {
      const nombre = claveSegura(String(body.nombre_archivo ?? "archivo"));
      const path = `${token}/${crypto.randomUUID()}-${nombre}`;
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) return json({ error: error?.message ?? "no se pudo iniciar" }, 500);
      // signedUrl para subir con PROGRESO real (XHR) desde el navegador.
      return json({ path: data.path, uploadToken: data.token, signedUrl: data.signedUrl });
    }

    // Confirma que un archivo ya se subió: registra el aporte.
    if (action === "confirmar") {
      const path = String(body.path ?? "");
      if (!path.startsWith(token + "/")) return json({ error: "ruta inválida" }, 400);
      const { error } = await admin.from("drive_aportes").insert({
        token,
        item_id: link.item_id,
        tenant_id: link.tenant_id,
        nombre_archivo: String(body.nombre_archivo ?? "archivo").slice(0, 300),
        storage_path: path,
        size: typeof body.size === "number" ? body.size : null,
        quien: (String(body.quien ?? "").trim() || null)?.slice(0, 120) ?? null,
      });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "acción desconocida" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
