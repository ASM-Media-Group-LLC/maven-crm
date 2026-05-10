// Helper para disparar el job `enrich_handle` del scouter-worker.
// Se llama fire-and-forget cada vez que se ingresa un IG handle nuevo
// desde un formulario (LeadGen / NuevoContacto / etc).
//
// El worker descarga avatar + name + followers + bio de IG via
// ScrapeCreators y los escribe directo a `models.avatar_url`.
// Idempotente: si el model ya tiene avatar, el handler hace skip.
//
// USO:
//   import { enqueueAvatarFetch } from "@/lib/avatarFetch";
//   await enqueueAvatarFetch(handle); // no-throw, no-block
//
// El frontend NO espera al resultado — el avatar aparece en `models`
// en 30-60s y el realtime / refetch del catálogo lo trae.

import { supabase } from "@/integrations/supabase/client";

const HANDLE_REGEX = /^[a-z0-9._]{1,30}$/;

function normalizeHandle(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?(instagram|ig)\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[^a-z0-9._].*$/, "");
  return HANDLE_REGEX.test(cleaned) ? cleaned : null;
}

export async function enqueueAvatarFetch(handle: string): Promise<void> {
  const normalized = normalizeHandle(handle);
  if (!normalized) return; // no log — input inválido es 99% errata, no error

  // Resolvemos tenant_id del user actual. La tabla scouter_jobs tiene
  // DEFAULT current_tenant_id() pero por las dudas de RLS lo seteamos
  // explícito.
  const { data: tm } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .limit(1)
    .maybeSingle();
  const tenantId = (tm as { tenant_id?: string } | null)?.tenant_id;
  if (!tenantId) return;

  const { error } = await supabase.from("scouter_jobs").insert({
    kind: "enrich_handle",
    status: "queued",
    tenant_id: tenantId,
    payload: { handle: normalized, tenantId },
    priority: 7, // entre score_lead (5) y discover_seed (default).
  });
  if (error) {
    // Silent: avatar fetch es nice-to-have. Si falla el insert (RLS,
    // network, etc.) NO debe romper el flujo del usuario.
    console.warn("enqueueAvatarFetch failed:", error.message);
  }
}
