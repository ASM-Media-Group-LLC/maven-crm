import { supabase } from "@/integrations/supabase/client";
import { normalizeHandle } from "@/lib/handle-utils";
// El nombre de respaldo se muestra en el aviso de quien está cargando el contacto.
import { traducir } from "@/lib/i18n";

/**
 * Normalize an OnlyFans URL to just the handle for comparison.
 */
export function normalizeOnlyFansUrl(input: string): string {
  if (!input) return "";
  return normalizeHandle(input);
}

const ACTIVE_STATUSES = ["active", "onboarding", "pendiente", "pendiente_verificacion"];

/**
 * Check if a handle or OF URL already belongs to an existing creator.
 * Returns status info so callers can decide to block (active) or allow (inactive).
 */
export async function checkCreatorExists(
  handle: string,
  onlyfansUrl?: string
): Promise<{
  exists: boolean;
  isActive: boolean;
  creatorName?: string;
  creatorId?: string;
  creatorStatus?: string;
}> {
  const normalizedHandle = normalizeHandle(handle);
  const normalizedOf = onlyfansUrl ? normalizeOnlyFansUrl(onlyfansUrl) : "";

  // Check by instagram_handle
  if (normalizedHandle) {
    const { data } = await supabase
      .from("creators")
      .select("id, name, artistic_name, status")
      .or(`instagram_handle.ilike.${normalizedHandle},instagram_handle.ilike.@${normalizedHandle}`)
      .limit(1)
      .maybeSingle();
    if (data) {
      const status = (data as any).status || "";
      return {
        exists: true,
        isActive: ACTIVE_STATUSES.includes(status),
        creatorName: data.artistic_name || data.name || traducir("int.lead.creator"),
        creatorId: data.id,
        creatorStatus: status,
      };
    }
  }

  // Check by onlyfans_url
  if (normalizedOf) {
    const { data } = await supabase
      .from("creators")
      .select("id, name, artistic_name, onlyfans_url, status")
      .not("onlyfans_url", "is", null)
      .limit(100);

    if (data) {
      const match = data.find((c) => {
        const creatorOf = normalizeOnlyFansUrl(c.onlyfans_url || "");
        return creatorOf && creatorOf === normalizedOf;
      });
      if (match) {
        const status = (match as any).status || "";
        return {
          exists: true,
          isActive: ACTIVE_STATUSES.includes(status),
          creatorName: match.artistic_name || match.name || traducir("int.lead.creator"),
          creatorId: match.id,
          creatorStatus: status,
        };
      }
    }
  }

  return { exists: false, isActive: false };
}

/**
 * Check if a handle already has previous records in leads.
 * Returns the date of the most recent entry and the agent who uploaded it.
 */
export async function checkPreviousLead(
  handle: string,
  onlyfansUrl?: string
): Promise<{
  existed: boolean;
  lastEntryDate?: string;
  lastAgentId?: string;
  lastAgentName?: string;
}> {
  const normalizedHandle = normalizeHandle(handle);

  if (normalizedHandle) {
    const { data } = await supabase
      .from("leadgen_entries")
      .select("id, created_at, lg_user_id")
      .eq("model_handle", normalizedHandle)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      let agentName: string | undefined;
      const agentId = (data as any).lg_user_id;
      if (agentId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", agentId)
          .maybeSingle();
        agentName = profile?.full_name || undefined;
      }
      return {
        existed: true,
        lastEntryDate: data.created_at,
        lastAgentId: agentId || undefined,
        lastAgentName: agentName,
      };
    }
  }

  return { existed: false };
}

/**
 * Check if a handle already exists in scouter_leads (Scouter Assist).
 * Match es por instagram_handle case-insensitive — un mismo modelo se
 * considera "el mismo lead" independientemente de la compañía a la que
 * esté asignada en Scouter. Devuelve status y fecha para que el caller
 * pueda explicar el bloqueo al usuario.
 */
export async function checkScouterLead(
  handle: string,
): Promise<{
  exists: boolean;
  scouterId?: string;
  status?: string;
  companyId?: string;
  createdAt?: string;
}> {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) return { exists: false };

  // scouter_* tables no están en los tipos generados aún — cast a any
  // para evitar el type plumbing extra (mismo patrón que useScouterLeads).
  const sb = supabase as unknown as { from: (t: string) => any };
  const { data } = await sb
    .from("scouter_leads")
    .select("id, status, company_id, created_at")
    .ilike("instagram_handle", normalizedHandle)
    .limit(1)
    .maybeSingle();

  if (!data) return { exists: false };
  return {
    exists: true,
    scouterId: data.id,
    status: data.status,
    companyId: data.company_id,
    createdAt: data.created_at,
  };
}

/**
 * Check if a handle already exists in closers_contacts.
 * Returns enriched info: name, created_at, agent name.
 */
export async function checkExistingContact(
  handle: string
): Promise<{
  exists: boolean;
  contactId?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactCreatedAt?: string;
  contactAgentName?: string;
}> {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) return { exists: false };

  const { data } = await supabase
    // Vista enmascarada: phone/email vienen NULL para no-admin (dedup es por handle).
    .from("v_closers_contacts")
    .select("id, name, phone, email, created_at, created_by")
    .ilike("handle", normalizedHandle)
    .limit(1)
    .maybeSingle();

  if (data) {
    let agentName: string | undefined;
    if (data.created_by) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", data.created_by)
        .maybeSingle();
      agentName = profile?.full_name || undefined;
    }
    return {
      exists: true,
      contactId: data.id,
      contactName: data.name,
      contactPhone: (data as any).phone || undefined,
      contactEmail: (data as any).email || undefined,
      contactCreatedAt: data.created_at || undefined,
      contactAgentName: agentName,
    };
  }
  return { exists: false };
}

// ─── Lead Availability check (LLG agregar lead) ───────────────────────
// Vivía aquí (checkLeadAvailability) y devolvía el título y el mensaje del banner
// ya escritos en español. Se mudó a pages/leadgen/disponibilidadLead.ts, que
// devuelve el MOTIVO y arma la frase con el `t` de quien mira; esta copia había
// quedado sin uso y se borró (sep 2026).

/**
 * Check if an OnlyFans URL already exists in leads or contacts.
 * Returns the name of the matching record.
 */
export async function checkDuplicateOnlyFans(
  url: string
): Promise<{
  existsInLeads: boolean;
  existsInContacts: boolean;
  matchName?: string;
}> {
  const normalized = normalizeOnlyFansUrl(url);
  if (!normalized) return { existsInLeads: false, existsInContacts: false };

  const { data: leads } = await supabase
    .from("leadgen_entries")
    .select("id, onlyfans_url, model_handle" as any)
    .not("onlyfans_url", "is", null)
    .limit(200);

  const leadMatch = (leads as any[])?.find(
    (e) => normalizeOnlyFansUrl(e.onlyfans_url || "") === normalized
  );

  const { data: contacts } = await supabase
    .from("closers_contacts")
    .select("id, onlyfans_url, name" as any)
    .not("onlyfans_url", "is", null)
    .limit(200);

  const contactMatch = (contacts as any[])?.find(
    (e) => normalizeOnlyFansUrl(e.onlyfans_url || "") === normalized
  );

  return {
    existsInLeads: !!leadMatch,
    existsInContacts: !!contactMatch,
    matchName: contactMatch?.name || leadMatch?.model_handle || undefined,
  };
}
