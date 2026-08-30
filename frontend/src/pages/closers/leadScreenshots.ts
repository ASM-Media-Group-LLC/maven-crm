// Subida de capturas a un lead del pipeline (closer_lead_files + bucket
// closer-evidence). Extraído de LeadScreenshots.tsx para reusarlo desde el
// formulario de "registrar contacto" (SeguimientoCell) sin duplicar la lógica
// de validación / upload / disparo del análisis de visión.
//
// ⚠️ Las capturas se atan al LEAD (creator_id), no al contacto puntual: así el
// bot de WhatsApp las ve por su camino ya existente (whatsapp-agent lee
// closer_lead_files por creator_id y expone vision_text), sin tocar el bot.
import { supabase } from "@/integrations/supabase/client";

export const SCREENSHOT_BUCKET = "closer-evidence";
export const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024; // = file_size_limit del bucket
export const SCREENSHOT_MIMES = ["image/png", "image/jpeg", "image/webp"];
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// closer_lead_files todavía no está en los tipos generados de Supabase (types.ts
// desactualizado; regenerarlo es tarea aparte). Mismo cast aislado que LeadScreenshots.
const TABLA = "closer_lead_files" as never;

/** Rechaza lo que el bucket rechazaría, pero antes de gastar la subida. */
export const validarScreenshot = (f: File): string | null => {
  if (!SCREENSHOT_MIMES.includes(f.type)) return `${f.name}: solo PNG, JPG o WEBP`;
  if (f.size > SCREENSHOT_MAX_BYTES) return `${f.name}: pesa más de 5 MB`;
  return null;
};

/** Solo imágenes soportadas (para filtrar drops/pastes con basura). */
export const soloImagenes = (files: Iterable<File>): File[] =>
  Array.from(files).filter((f) => SCREENSHOT_MIMES.includes(f.type));

/**
 * Sube capturas al lead `leadId` (closer_lead_files) y dispara el análisis de
 * visión de cada una. Fire-and-forget en el análisis: si falla, el cron de
 * closers-analyze-screenshot la levanta igual. Lanza si un archivo no valida o
 * si la subida/insert falla (limpia el objeto huérfano en ese caso).
 */
export async function uploadLeadScreenshots(leadId: string, files: File[]): Promise<number> {
  if (!leadId) throw new Error("Falta el lead para adjuntar la captura.");
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Sesión expirada, vuelve a entrar");

  for (const f of files) {
    const problema = validarScreenshot(f);
    if (problema) throw new Error(problema);

    const path = `${leadId}/${crypto.randomUUID()}.${EXT[f.type]}`;
    const { error: upErr } = await supabase.storage
      .from(SCREENSHOT_BUCKET)
      .upload(path, f, { contentType: f.type, upsert: false });
    if (upErr) throw upErr;

    const { data: insertada, error: insErr } = await supabase
      .from(TABLA)
      .insert({
        creator_id: leadId,
        storage_path: path,
        file_name: f.name || `captura.${EXT[f.type]}`,
        mime_type: f.type,
        size_bytes: f.size,
        uploaded_by: uid,
      } as never)
      .select("id")
      .single<{ id: string }>();
    if (insErr) {
      // Si la fila no entró, el objeto queda huérfano en el bucket: lo sacamos.
      await supabase.storage.from(SCREENSHOT_BUCKET).remove([path]);
      throw insErr;
    }

    // Dispara el análisis ya, sin esperar al cron: la captura queda legible para
    // el bot en segundos. Fire-and-forget — si falla, el barrido periódico la toma.
    if (insertada?.id) {
      void supabase.functions
        .invoke("closers-analyze-screenshot", { body: { file_id: insertada.id } })
        .catch(() => {});
    }
  }
  return files.length;
}
