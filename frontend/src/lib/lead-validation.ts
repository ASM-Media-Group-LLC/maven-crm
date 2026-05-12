import { supabase } from "@/integrations/supabase/client";
import { normalizeHandle } from "@/lib/handle-utils";

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
        creatorName: data.artistic_name || data.name || "Creadora",
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
          creatorName: match.artistic_name || match.name || "Creadora",
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
    .from("closers_contacts")
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

/**
 * Check if an OnlyFans URL already exists in leads or contacts.
 * Returns the name of the matching record.
 */
// ─── Lead Availability check (LLG agregar lead) ───────────────────────
//
// Chequea en orden: creators → closer_creators → leadgen_entries.
// Devuelve un único resultado con razón legible para mostrar al LLG.
// Reglas de re-ingreso:
//   · creators inactiva (terminated|leaving) ≥ 30 días → permitida
//   · closer_creators "No interesada" ≥ 60 días → permitida
//   · Cualquier otra coincidencia → bloqueada con explicación
//   · Sin coincidencias → nuevo lead (sin banner)
//
// Diseñada para usarse desde un debounced query en AddLeadModal — el
// banner se actualiza a medida que el LLG escribe el handle.

export type LeadAvailabilityStatus =
  | { kind: "new" }
  | { kind: "blocked"; title: string; message: string }
  | { kind: "allowed_with_history"; title: string; message: string };

const CREATOR_ACTIVE_STATUSES = new Set([
  "active",
  "onboarding",
  "pendiente",
  "pendiente_verificacion",
  "paused",
]);
const CREATOR_INACTIVE_STATUSES = new Set(["terminated", "leaving"]);

const CLOSER_ACTIVE_STAGES = new Set(["Nuevo", "Asignada", "Confirmada", "Completada"]);

const DAY_MS = 24 * 60 * 60 * 1000;

const fmtDateAgo = (date: Date): string => {
  const days = Math.floor((Date.now() - date.getTime()) / DAY_MS);
  if (days < 1) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
};

export async function checkLeadAvailability(handle: string): Promise<LeadAvailabilityStatus> {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) return { kind: "new" };

  // 1. creators table (prioridad alta)
  const { data: creator } = await supabase
    .from("creators")
    .select("id, name, artistic_name, status, updated_at")
    .or(`instagram_handle.ilike.${normalizedHandle},instagram_handle.ilike.@${normalizedHandle}`)
    .limit(1)
    .maybeSingle();

  if (creator) {
    const status = (creator as any).status || "";
    const name = (creator as any).artistic_name || (creator as any).name || "Esta modelo";
    if (CREATOR_ACTIVE_STATUSES.has(status)) {
      return {
        kind: "blocked",
        title: "Es modelo activa de la agencia",
        message: `${name} ya es creadora con status "${status}". No se puede agregar como lead.`,
      };
    }
    if (CREATOR_INACTIVE_STATUSES.has(status)) {
      const updated = (creator as any).updated_at ? new Date((creator as any).updated_at) : null;
      const daysInactive = updated ? Math.floor((Date.now() - updated.getTime()) / DAY_MS) : 0;
      const statusLabel = status === "terminated" ? "terminada" : "en retiro";
      if (daysInactive >= 30) {
        return {
          kind: "allowed_with_history",
          title: "Fue creadora de la agencia",
          message: `${name} está ${statusLabel} ${fmtDateAgo(updated!)}. Podés volver a agregarla como lead.`,
        };
      }
      const daysLeft = 30 - daysInactive;
      return {
        kind: "blocked",
        title: "Fue creadora — esperá",
        message: `${name} está ${statusLabel} ${fmtDateAgo(updated!)}. Hay que esperar 30 días desde el cambio de estado — faltan ${daysLeft} días.`,
      };
    }
    // Status raro (borrador, etc) — bloqueamos por seguridad
    return {
      kind: "blocked",
      title: "Ya existe en creadoras",
      message: `${name} ya tiene un registro en creadoras con status "${status}".`,
    };
  }

  // 2. closer_creators (si no es creator todavía)
  const { data: closer } = await supabase
    .from("closer_creators")
    .select("id, instagram_handle, stage, assigned_to, updated_at")
    .ilike("instagram_handle", normalizedHandle)
    .limit(1)
    .maybeSingle();

  if (closer) {
    const stage = (closer as any).stage || "";
    const updated = (closer as any).updated_at ? new Date((closer as any).updated_at) : null;

    if (CLOSER_ACTIVE_STAGES.has(stage)) {
      let closerLabel = "";
      const assignedTo = (closer as any).assigned_to;
      if (assignedTo) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", assignedTo)
          .maybeSingle();
        const name = (profile as any)?.full_name;
        if (name) closerLabel = ` · Closer: ${name}`;
      }
      return {
        kind: "blocked",
        title: "Está en proceso de cierre",
        message: `Esta modelo está en stage "${stage}" en Closers${closerLabel}. No se puede agregar como lead.`,
      };
    }

    if (stage === "No interesada" && updated) {
      const daysSince = Math.floor((Date.now() - updated.getTime()) / DAY_MS);
      if (daysSince >= 60) {
        return {
          kind: "allowed_with_history",
          title: "Cierre previo fallido",
          message: `Esta modelo fue marcada "No interesada" ${fmtDateAgo(updated)}. Podés volver a agregarla como lead.`,
        };
      }
      const daysLeft = 60 - daysSince;
      return {
        kind: "blocked",
        title: "Cierre fallido — esperá",
        message: `Esta modelo fue marcada "No interesada" ${fmtDateAgo(updated)}. Hay que esperar 60 días desde entonces — faltan ${daysLeft} días.`,
      };
    }
  }

  // 3. leadgen_entries — regla 24h: si el lead ya está en leadgen pero
  // tiene más de 24 horas, permitimos re-agregarlo (puede ser un nuevo
  // intento de contacto). Si tiene menos de 24h, bloqueamos.
  const { data: lead } = await supabase
    .from("leadgen_entries")
    .select("id, created_at, lg_user_id")
    .eq("model_handle", normalizedHandle)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lead) {
    const created = (lead as any).created_at ? new Date((lead as any).created_at) : null;
    let agentLabel = "";
    const agentId = (lead as any).lg_user_id;
    if (agentId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", agentId)
        .maybeSingle();
      const name = (profile as any)?.full_name;
      if (name) agentLabel = ` por ${name}`;
    }
    if (created) {
      const hoursSince = (Date.now() - created.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        const hoursLeft = Math.ceil(24 - hoursSince);
        return {
          kind: "blocked",
          title: "Lead duplicado — esperá",
          message: `Este lead fue agregado${agentLabel} hace ${Math.floor(hoursSince)}h. Podrás resubirlo en ~${hoursLeft}h (regla 24h).`,
        };
      }
    }
    return {
      kind: "allowed_with_history",
      title: "Lead ya existente en LeadGen",
      message: `Este lead ya fue agregado${agentLabel}${created ? ` ${fmtDateAgo(created)}` : ""}. Se va a crear como entrada repetida (reactivado).`,
    };
  }

  // 4. scouter_leads — permitido pero avisamos que el lead fue
  // descubierto por Scouter Assist (para que el LLG sepa el origen).
  const sb = supabase as unknown as { from: (t: string) => any };
  const { data: scouter } = await sb
    .from("scouter_leads")
    .select("id, status, created_at")
    .ilike("instagram_handle", normalizedHandle)
    .limit(1)
    .maybeSingle();

  if (scouter) {
    const created = scouter.created_at ? new Date(scouter.created_at) : null;
    return {
      kind: "allowed_with_history",
      title: "Encontrada por Scouter Assist",
      message: `Esta modelo fue descubierta por Scouter Assist${created ? ` (${fmtDateAgo(created)})` : ""}${scouter.status ? ` · status "${scouter.status}"` : ""}. Podés agregarla como lead.`,
    };
  }

  // 5. Nuevo lead — todo clean
  return { kind: "new" };
}

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
