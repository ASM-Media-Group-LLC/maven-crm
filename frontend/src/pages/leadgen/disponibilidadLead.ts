// ¿SE PUEDE AGREGAR ESTE LEAD? — el chequeo del alta de LeadGen (AddLeadModal).
//
// Chequea en orden: creators → closer_creators → leadgen_entries → scouter_leads.
// Reglas de re-ingreso:
//   · creators inactiva (terminated|leaving) ≥ 30 días → permitida
//   · closer_creators "No interesada" ≥ 60 días → permitida
//   · leadgen_entries de hace < 24 h → bloqueada; más vieja → permitida (reactivado)
//   · scouter_leads → permitida, avisando que la encontró Scouter Assist
//   · Cualquier otra coincidencia → bloqueada con explicación
//   · Sin coincidencias → nuevo lead (sin banner)
//
// Devuelve el MOTIVO y sus datos, no la frase: la frase la arma
// `textoDisponibilidad()` con el `t` del idioma de quien mira. Antes esto vivía
// en lib/lead-validation.ts (checkLeadAvailability) y devolvía el título y el
// mensaje ya escritos en español, así que en EN el banner salía en español.
// Esa copia quedó sin uso; se borra en un PR de lib/.
//
// Las consultas y las reglas son las mismas que allá, una por una.
import { supabase } from "@/integrations/supabase/client";
import { normalizeHandle } from "@/lib/handle-utils";
import type { TranslationKey } from "@/lib/i18n";

type Motivo =
  /** Creadora activa (o en onboarding, pendiente, pausada). */
  | { motivo: "creadoraActiva"; nombre: string | null; status: string }
  /** Ex creadora: `faltanDias` solo si todavía no pasaron los 30 días. */
  | { motivo: "exCreadora"; nombre: string | null; status: "terminated" | "leaving"; desde: string | null; faltanDias?: number }
  /** Está en creators con un status que no es ni activo ni de salida. */
  | { motivo: "otraCreadora"; nombre: string | null; status: string }
  /** En el embudo de Closers (Nuevo, Asignada, Confirmada, Completada). */
  | { motivo: "enCierre"; stage: string; closer: string | null }
  /** Closers la marcó "No interesada": `faltanDias` si no pasaron los 60 días. */
  | { motivo: "cierreFallido"; desde: string; faltanDias?: number }
  /** Ya está en LeadGen desde hace menos de 24 h. */
  | { motivo: "duplicadoReciente"; agente: string | null; horas: number; faltanHoras: number }
  /** Ya está en LeadGen desde hace más: entra como reactivado. */
  | { motivo: "yaEnLeadgen"; agente: string | null; desde: string | null }
  /** La encontró Scouter Assist. */
  | { motivo: "scouter"; desde: string | null; status: string | null };

export type DisponibilidadLead =
  | { kind: "new" }
  | ({ kind: "blocked" | "allowed_with_history" } & Motivo);

const CREATOR_ACTIVE_STATUSES = new Set([
  "active",
  "onboarding",
  "pendiente",
  "pendiente_verificacion",
  "paused",
]);
const CREATOR_INACTIVE_STATUSES = new Set(["terminated", "leaving"]);

// Valores de closer_creators.stage: DATOS, en español, no se traducen. Lo que
// cambia con el idioma es la etiqueta, la misma que usa Closers (sus claves en
// lib/i18n/closers.ts; no se importa el stageLabel de useCloserLeads para no
// arrastrar ese módulo de 1.200 líneas al alta de un lead).
const CLOSER_ACTIVE_STAGES = new Map<string, TranslationKey>([
  ["Nuevo", "closers.stage.new"],
  ["Asignada", "closers.stage.assigned"],
  ["Confirmada", "closers.stage.confirmed"],
  ["Completada", "closers.stage.completed"],
]);

const DAY_MS = 24 * 60 * 60 * 1000;

const diasDesde = (iso: string): number => Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);

async function nombreDe(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  return (profile as { full_name?: string | null } | null)?.full_name || null;
}

export async function checkLeadAvailability(handle: string): Promise<DisponibilidadLead> {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) return { kind: "new" };

  // 1. creators (prioridad alta)
  const { data: creator } = await supabase
    .from("creators")
    .select("id, name, artistic_name, status, updated_at")
    .or(`instagram_handle.ilike.${normalizedHandle},instagram_handle.ilike.@${normalizedHandle}`)
    .limit(1)
    .maybeSingle();

  if (creator) {
    const c = creator as { name?: string | null; artistic_name?: string | null; status?: string | null; updated_at?: string | null };
    const status = c.status || "";
    const nombre = c.artistic_name || c.name || null;
    if (CREATOR_ACTIVE_STATUSES.has(status)) {
      return { kind: "blocked", motivo: "creadoraActiva", nombre, status };
    }
    if (CREATOR_INACTIVE_STATUSES.has(status)) {
      const desde = c.updated_at || null;
      const diasInactiva = desde ? diasDesde(desde) : 0;
      const st = status as "terminated" | "leaving";
      if (diasInactiva >= 30) {
        return { kind: "allowed_with_history", motivo: "exCreadora", nombre, status: st, desde };
      }
      return { kind: "blocked", motivo: "exCreadora", nombre, status: st, desde, faltanDias: 30 - diasInactiva };
    }
    // Status raro (borrador, etc.): se bloquea por seguridad.
    return { kind: "blocked", motivo: "otraCreadora", nombre, status };
  }

  // 2. closer_creators (si no es creator todavía)
  const { data: closer } = await supabase
    .from("closer_creators")
    .select("id, instagram_handle, stage, assigned_to, updated_at")
    .ilike("instagram_handle", normalizedHandle)
    .limit(1)
    .maybeSingle();

  if (closer) {
    const cc = closer as { stage?: string | null; assigned_to?: string | null; updated_at?: string | null };
    const stage = cc.stage || "";
    if (CLOSER_ACTIVE_STAGES.has(stage)) {
      return { kind: "blocked", motivo: "enCierre", stage, closer: await nombreDe(cc.assigned_to) };
    }
    if (stage === "No interesada" && cc.updated_at) {
      const dias = diasDesde(cc.updated_at);
      if (dias >= 60) {
        return { kind: "allowed_with_history", motivo: "cierreFallido", desde: cc.updated_at };
      }
      return { kind: "blocked", motivo: "cierreFallido", desde: cc.updated_at, faltanDias: 60 - dias };
    }
  }

  // 3. leadgen_entries — regla 24 h: si ya está en LeadGen pero tiene más de
  // 24 horas, se puede re-agregar (nuevo intento de contacto). Con menos, no.
  const { data: lead } = await supabase
    .from("leadgen_entries")
    .select("id, created_at, lg_user_id")
    .eq("model_handle", normalizedHandle)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lead) {
    const l = lead as { created_at?: string | null; lg_user_id?: string | null };
    const desde = l.created_at || null;
    const agente = await nombreDe(l.lg_user_id);
    if (desde) {
      const horasDesde = (Date.now() - new Date(desde).getTime()) / (1000 * 60 * 60);
      if (horasDesde < 24) {
        return {
          kind: "blocked",
          motivo: "duplicadoReciente",
          agente,
          horas: Math.floor(horasDesde),
          faltanHoras: Math.ceil(24 - horasDesde),
        };
      }
    }
    return { kind: "allowed_with_history", motivo: "yaEnLeadgen", agente, desde };
  }

  // 4. scouter_leads — permitido, pero se avisa que la descubrió Scouter Assist
  // (para que el LLG sepa el origen).
  const { data: scouter } = await supabase
    .from("scouter_leads")
    .select("id, status, created_at")
    .ilike("instagram_handle", normalizedHandle)
    .limit(1)
    .maybeSingle();

  if (scouter) {
    return {
      kind: "allowed_with_history",
      motivo: "scouter",
      desde: scouter.created_at || null,
      status: scouter.status || null,
    };
  }

  // 5. Nuevo lead
  return { kind: "new" };
}

type Traductor = (key: TranslationKey, params?: Record<string, string | number>) => string;

const etiquetaStage = (t: Traductor, stage: string): string => {
  const key = CLOSER_ACTIVE_STAGES.get(stage);
  return key ? t(key) : stage;
};

/** "hoy", "ayer", "hace 3 días", "hace 2 meses" — en el idioma de `t`. */
export function haceCuanto(t: Traductor, iso: string): string {
  const dias = diasDesde(iso);
  if (dias < 1) return t("leadgen.availability.today");
  if (dias === 1) return t("leadgen.availability.yesterday");
  if (dias < 30) return t("leadgen.availability.daysAgo", { count: dias });
  const meses = Math.floor(dias / 30);
  return meses === 1 ? t("leadgen.availability.monthAgo") : t("leadgen.availability.monthsAgo", { count: meses });
}

/** El título y el mensaje del banner (y del aviso al guardar), con el `t` de
 *  useLanguage(): se arma al dibujar, en el idioma de quien mira. */
export function textoDisponibilidad(
  t: Traductor,
  d: Exclude<DisponibilidadLead, { kind: "new" }>,
): { title: string; message: string } {
  const bloqueado = d.kind === "blocked";
  const por = (agente: string | null) => (agente ? t("leadgen.availability.byAgent", { name: agente }) : "");

  switch (d.motivo) {
    case "creadoraActiva":
      return {
        title: t("leadgen.availability.activeCreatorTitle"),
        message: t("leadgen.availability.activeCreatorMsg", {
          name: d.nombre ?? t("leadgen.availability.thisModel"),
          status: d.status,
        }),
      };
    case "exCreadora": {
      const name = d.nombre ?? t("leadgen.availability.thisModel");
      const terminada = d.status === "terminated";
      const primera = d.desde
        ? t(terminada ? "leadgen.availability.terminatedSince" : "leadgen.availability.leavingSince", {
            name,
            ago: haceCuanto(t, d.desde),
          })
        : t(terminada ? "leadgen.availability.terminated" : "leadgen.availability.leaving", { name });
      if (!bloqueado || d.faltanDias == null) {
        return {
          title: t("leadgen.availability.formerCreatorTitle"),
          message: `${primera} ${t("leadgen.availability.canAddAgain")}`,
        };
      }
      return {
        title: t("leadgen.availability.formerCreatorWaitTitle"),
        message: `${primera} ${t(
          d.faltanDias === 1 ? "leadgen.availability.wait30.one" : "leadgen.availability.wait30.other",
          { count: d.faltanDias },
        )}`,
      };
    }
    case "otraCreadora":
      return {
        title: t("leadgen.availability.otherCreatorTitle"),
        message: t("leadgen.availability.otherCreatorMsg", {
          name: d.nombre ?? t("leadgen.availability.thisModel"),
          status: d.status,
        }),
      };
    case "enCierre":
      return {
        title: t("leadgen.availability.closingTitle"),
        message: t("leadgen.availability.closingMsg", {
          stage: etiquetaStage(t, d.stage),
          closer: d.closer ? ` · Closer: ${d.closer}` : "",
        }),
      };
    case "cierreFallido": {
      const primera = t("leadgen.availability.markedNotInterested", { ago: haceCuanto(t, d.desde) });
      if (!bloqueado || d.faltanDias == null) {
        return {
          title: t("leadgen.availability.failedCloseTitle"),
          message: `${primera} ${t("leadgen.availability.canAddAgain")}`,
        };
      }
      return {
        title: t("leadgen.availability.failedCloseWaitTitle"),
        message: `${primera} ${t(
          d.faltanDias === 1 ? "leadgen.availability.wait60.one" : "leadgen.availability.wait60.other",
          { count: d.faltanDias },
        )}`,
      };
    }
    case "duplicadoReciente":
      return {
        title: t("leadgen.availability.duplicateWaitTitle"),
        message: t("leadgen.availability.duplicateWaitMsg", {
          by: por(d.agente),
          hours: d.horas,
          left: d.faltanHoras,
        }),
      };
    case "yaEnLeadgen":
      return {
        title: t("leadgen.availability.existingTitle"),
        message: t("leadgen.availability.existingMsg", {
          by: por(d.agente),
          when: d.desde ? ` ${haceCuanto(t, d.desde)}` : "",
        }),
      };
    case "scouter":
      return {
        title: t("leadgen.availability.scouterTitle"),
        message: t("leadgen.availability.scouterMsg", {
          when: d.desde ? ` (${haceCuanto(t, d.desde)})` : "",
          status: d.status ? ` · status "${d.status}"` : "",
        }),
      };
  }
}
