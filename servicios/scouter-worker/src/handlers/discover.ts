// Handlers de discovery: discover_seed (lista explícita de @handles) y
// discover_hashtag (autores que postean con un hashtag). Ambos terminan
// llamando a runProfileScrape para enriquecer y luego upsert a
// scouter_leads. Cada lead nuevo enqueua automáticamente un score_lead
// para que el LLM lo califique.

import { sb } from "../db.ts";
import { checkBudget } from "../budget.ts";
import { runHashtagDiscovery, runProfileScrape } from "../scrapecreators.ts";
import { persistIgPhoto } from "../storage.ts";
import type {
  DiscoverHashtagPayload,
  DiscoverSeedPayload,
  JobResult,
  ScouterJob,
} from "../types.ts";

interface ProfileItem {
  username?: string;
  url?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  verified?: boolean;
  profilePicUrlHD?: string;
  profilePicUrl?: string;
  externalUrl?: string;
}

const DEFAULT_MAX_LEADS = 30;

// Heurística rápida para detectar la plataforma del link in bio.
// Mismo patrón que kash usaba para pre-rank antes del scorer LLM.
function detectLinkInBio(externalUrl?: string | null): string | null {
  if (!externalUrl) return null;
  const u = externalUrl.toLowerCase();
  if (u.includes("linktr.ee")) return "Linktree";
  if (u.includes("beacons.")) return "Beacons";
  if (u.includes("stan.store") || u.includes("stanstore.")) return "Stan";
  if (u.includes("allmylinks")) return "AllMyLinks";
  if (u.includes("koji.to") || u.includes("withkoji")) return "Koji";
  if (u.includes("onlyfans.com")) return "Direct OF";
  return "Other";
}

// Heurística de país basada en señales visibles en el perfil de IG. Es
// pre-scoring: solo descartamos si el user puso target_countries en la
// compañía y la cuenta NO matchea. Si no hay señal clara, devolvemos
// null y el caller decide qué hacer (skipear o no).
//
// Detectamos:
//   · banderas emoji en bio/fullName
//   · keywords explícitas: "México", "MX", "CDMX", "Argentina", etc.
//   · sufijo del handle: "_mx", "_arg" (señal débil pero suma)
//
// Para perfiles que mezclan bandera con keyword + handle suffix, los
// señalamos con confianza alta. Para los que solo tienen 1 señal débil,
// confianza media. Los que no tienen nada → null.
const FLAG_TO_COUNTRY: Record<string, string> = {
  "🇲🇽": "México", "🇦🇷": "Argentina", "🇧🇷": "Brasil", "🇨🇱": "Chile",
  "🇨🇴": "Colombia", "🇵🇪": "Perú", "🇺🇾": "Uruguay", "🇵🇾": "Paraguay",
  "🇧🇴": "Bolivia", "🇪🇨": "Ecuador", "🇻🇪": "Venezuela", "🇨🇺": "Cuba",
  "🇨🇷": "Costa Rica", "🇵🇦": "Panamá", "🇬🇹": "Guatemala", "🇸🇻": "El Salvador",
  "🇭🇳": "Honduras", "🇳🇮": "Nicaragua", "🇩🇴": "República Dominicana",
  "🇵🇷": "Puerto Rico", "🇯🇲": "Jamaica",
  "🇪🇸": "España", "🇵🇹": "Portugal", "🇮🇹": "Italia", "🇫🇷": "Francia",
  "🇩🇪": "Alemania", "🇬🇧": "UK", "🇮🇪": "Irlanda", "🇳🇴": "Noruega",
  "🇸🇪": "Suecia", "🇨🇭": "Suiza", "🇳🇱": "Países Bajos", "🇵🇱": "Polonia",
  "🇷🇺": "Rusia", "🇺🇦": "Ucrania", "🇷🇴": "Rumania", "🇨🇿": "República Checa",
  "🇭🇺": "Hungría", "🇷🇸": "Serbia", "🇦🇲": "Armenia",
  "🇺🇸": "US/CA", "🇨🇦": "Canadá",
  "🇦🇺": "Australia", "🇳🇿": "Nueva Zelanda", "🇯🇵": "Japón",
  "🇨🇳": "China", "🇰🇷": "Corea del Sur", "🇹🇭": "Tailandia",
  "🇵🇭": "Filipinas", "🇮🇩": "Indonesia", "🇻🇳": "Vietnam",
  "🇸🇬": "Singapur", "🇮🇳": "India", "🇵🇰": "Pakistán",
  "🇮🇱": "Israel", "🇹🇷": "Turquía", "🇦🇪": "Emiratos Árabes Unidos",
  "🇲🇦": "Marruecos", "🇪🇬": "Egipto", "🇿🇦": "Sudáfrica", "🇳🇬": "Nigeria",
};

// Keywords de ciudades/palabras-clave → país canónico. Lista corta —
// solo los matches más confiables. Lowercase, sin acentos.
const KEYWORD_TO_COUNTRY: Record<string, string> = {
  // México
  "mexico": "México", "mexicana": "México", "mexicano": "México",
  "mexico city": "México", "cdmx": "México", "ciudad de mexico": "México",
  "guadalajara": "México", "monterrey": "México", "puebla": "México",
  "cancun": "México", "queretaro": "México", "tijuana": "México",
  // Argentina
  "argentina": "Argentina", "argentino": "Argentina", "argentina🇦🇷": "Argentina",
  "buenos aires": "Argentina", "bsas": "Argentina",
  "cordoba": "Argentina", "rosario": "Argentina", "mendoza": "Argentina",
  // Brasil
  "brasil": "Brasil", "brazil": "Brasil", "brasilera": "Brasil",
  "brasileira": "Brasil", "brasileiro": "Brasil", "sao paulo": "Brasil",
  "rio de janeiro": "Brasil", "salvador bahia": "Brasil",
  // Colombia
  "colombia": "Colombia", "colombiana": "Colombia", "bogota": "Colombia",
  "medellin": "Colombia", "cali colombia": "Colombia",
  // Chile
  "chile": "Chile", "chilena": "Chile", "santiago de chile": "Chile",
  // Venezuela
  "venezuela": "Venezuela", "venezolana": "Venezuela", "caracas": "Venezuela",
  // España
  "españa": "España", "espana": "España", "spain": "España",
  "madrid": "España", "barcelona": "España", "valencia es": "España",
  // Otros confiables
  "peru": "Perú", "peruana": "Perú", "lima peru": "Perú",
  "uruguay": "Uruguay", "uruguaya": "Uruguay", "montevideo": "Uruguay",
  "ecuador": "Ecuador", "ecuatoriana": "Ecuador", "quito": "Ecuador",
};

function inferCountry(item: ProfileItem): string | null {
  const haystack = [
    item.fullName ?? "",
    item.biography ?? "",
    item.externalUrl ?? "",
  ].join(" ");
  // 1) Banderas emoji — señal más fuerte. Si hay más de una, devolvemos
  //    la primera (caller decide si matchea con target_countries).
  for (const [flag, country] of Object.entries(FLAG_TO_COUNTRY)) {
    if (haystack.includes(flag)) return country;
  }
  // 2) Keywords. Lowercase sin acentos para evitar miss por capitalización.
  const norm = haystack
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  for (const [kw, country] of Object.entries(KEYWORD_TO_COUNTRY)) {
    if (norm.includes(kw)) return country;
  }
  // 3) Sufijo del handle (señal débil — solo para countries muy comunes)
  const handle = (item.username ?? "").toLowerCase();
  if (/_(mx|mex|mexico)\b/.test(handle)) return "México";
  if (/_(arg|argentina)\b/.test(handle)) return "Argentina";
  if (/_(br|brasil|brazil)\b/.test(handle)) return "Brasil";
  if (/_(col|colombia)\b/.test(handle)) return "Colombia";
  return null;
}

async function persistProfilesAsLeads(
  items: ProfileItem[],
  tenantId: string,
  companyId: string | null,
  // discoverySource ahora acepta string (mismo valor para todos los
  // leads — típico de hashtag discovery: "hashtag:fitness") o función
  // (per-lead, derivado del item — típico de seed discovery donde cada
  // lead viene de una cuenta semilla distinta y queremos guardarla).
  discoverySource: string | ((item: ProfileItem) => string),
  // Si la compañía tiene target_countries seteado, descartamos cualquier
  // lead que no podamos confirmar como de uno de esos países. La intención
  // del user: "solo paises que podamos confirmar" — si no detectamos
  // señal clara, skipea (conservador). Vacío/null = sin restricción.
  targetCountries: string[] | null,
): Promise<{
  inserted: number;
  updated: number;
  skippedInLeadgen: number;
  skippedByCountry: number;
  leadIds: string[];
}> {
  const leadIds: string[] = [];
  let inserted = 0;
  let updated = 0;
  let skippedInLeadgen = 0;
  let skippedByCountry = 0;
  const hasCountryFilter = !!(targetCountries && targetCountries.length > 0);

  // Pre-fetch batch: cross-system dedup contra Lead Gen.
  //   · existingInLeadgen: handles que ya viven en leadgen_entries
  //   · existingInScouter: handles que ya existen en scouter_leads para
  //     ESTA compañía (la condición para el upsert refresh path).
  // Regla: skipeamos un handle si está en leadgen Y todavía no existe en
  // scouter para esta compañía (sería un insert nuevo, que es lo que el
  // usuario quiere evitar). Si ya existe en scouter, dejamos correr el
  // upsert para que refresque followers/bio (no empeoramos el duplicado
  // pre-existente).
  const allHandles = items
    .map((i) => i.username?.trim().toLowerCase())
    .filter((h): h is string => !!h);

  const existingInLeadgen = new Set<string>();
  const existingInScouter = new Set<string>();
  const discardedHandles = new Set<string>();
  if (allHandles.length > 0) {
    const [lgRes, scRes, dhRes] = await Promise.all([
      sb.from("leadgen_entries").select("model_handle").in("model_handle", allHandles),
      companyId
        ? sb
            .from("scouter_leads")
            .select("instagram_handle")
            .eq("company_id", companyId)
            .in("instagram_handle", allHandles)
        : Promise.resolve({ data: [] as Array<{ instagram_handle: string }>, error: null }),
      // Blocklist global por tenant — handles que el user descartó
      // desde el popup. No queremos reagregarlos NUNCA.
      sb
        .from("scouter_discarded_handles")
        .select("handle")
        .eq("tenant_id", tenantId)
        .in("handle", allHandles),
    ]);
    if (lgRes.error) console.error("leadgen dedup query failed", lgRes.error);
    else {
      for (const row of (lgRes.data ?? []) as { model_handle: string | null }[]) {
        if (row.model_handle) existingInLeadgen.add(row.model_handle.toLowerCase());
      }
    }
    if (scRes.error) console.error("scouter dedup query failed", scRes.error);
    else {
      for (const row of (scRes.data ?? []) as { instagram_handle: string }[]) {
        existingInScouter.add(row.instagram_handle.toLowerCase());
      }
    }
    if (dhRes.error) console.error("discarded-handles dedup query failed", dhRes.error);
    else {
      for (const row of (dhRes.data ?? []) as { handle: string }[]) {
        discardedHandles.add(row.handle.toLowerCase());
      }
    }
  }

  for (const item of items) {
    const handle = item.username?.trim().toLowerCase();
    if (!handle) continue;

    // Cross-system dedup: si vive en Lead Gen y NO está ya en Scouter
    // para esta compañía, lo skipeamos para no crear un duplicado nuevo.
    if (existingInLeadgen.has(handle) && !existingInScouter.has(handle)) {
      skippedInLeadgen += 1;
      console.log(`[discover] skip @${handle} — ya existe en Lead Gen`);
      continue;
    }

    // Blocklist: el user lo descartó manualmente desde el popup. No
    // se vuelve a agregar a ninguna compañía dentro del mismo tenant.
    if (discardedHandles.has(handle)) {
      console.log(`[discover] skip @${handle} — está en blocklist de descartados`);
      continue;
    }

    // Filtro por país: si la compañía tiene target_countries, descartamos
    // leads que NO podamos confirmar como de uno de esos países.
    const inferredCountry = inferCountry(item);
    if (hasCountryFilter) {
      if (!inferredCountry) {
        skippedByCountry += 1;
        console.log(
          `[discover] skip @${handle} — sin señal de país confirmable (target=${targetCountries!.join(",")})`,
        );
        continue;
      }
      if (!targetCountries!.includes(inferredCountry)) {
        skippedByCountry += 1;
        console.log(
          `[discover] skip @${handle} — país inferido ${inferredCountry} fuera de target (${targetCountries!.join(",")})`,
        );
        continue;
      }
    }

    const linkPlatform = detectLinkInBio(item.externalUrl);
    // URL cruda de IG CDN — firmada, expira en ~24-48h. La persistimos
    // ya en nuestro storage para que photo_data_url no caduque.
    const rawPhoto = item.profilePicUrlHD ?? item.profilePicUrl ?? null;
    const photo = await persistIgPhoto(rawPhoto, handle);

    // Upsert por (company_id, instagram_handle) — UNIQUE constraint.
    // Si ya existía, refrescamos followers/bio/etc. pero NO pisamos
    // ai_score / status — esos los maneja score_lead.
    const upsertPayload: Record<string, unknown> = {
      company_id: companyId,
      instagram_handle: handle,
      instagram_url: item.url ?? `https://www.instagram.com/${handle}/`,
      name: item.fullName ?? null,
      bio: item.biography ?? null,
      followers: item.followersCount ?? null,
      verified: item.verified ?? false,
      photo_data_url: photo,
      link_in_bio_platform: linkPlatform,
      discovery_source:
        typeof discoverySource === "function" ? discoverySource(item) : discoverySource,
      tenant_id: tenantId,
    };
    // Si detectamos país por heurística, lo persistimos para que el
    // scorer no tenga que re-inferirlo y para que aparezca en la card
    // antes del scoring.
    if (inferredCountry) {
      upsertPayload.country = inferredCountry;
    }

    const { data, error } = await sb
      .from("scouter_leads")
      .upsert(upsertPayload, { onConflict: "company_id,instagram_handle" })
      .select("id, ai_score")
      .single();

    if (error) {
      console.error("upsert lead error", handle, error);
      continue;
    }
    const row = data as { id: string; ai_score: number | null };
    leadIds.push(row.id);
    if (row.ai_score == null) inserted += 1;
    else updated += 1;
  }

  return { inserted, updated, skippedInLeadgen, skippedByCountry, leadIds };
}

// Lee target_countries de la compañía. Devuelve null si no hay
// restricción (vacío o columna ausente).
async function fetchTargetCountries(companyId: string | null): Promise<string[] | null> {
  if (!companyId) return null;
  const { data, error } = await sb
    .from("scouter_companies")
    .select("search_config")
    .eq("id", companyId)
    .maybeSingle();
  if (error || !data) return null;
  const cfg = (data as { search_config?: { target_countries?: string[] } }).search_config ?? {};
  const arr = cfg.target_countries ?? [];
  return arr.length > 0 ? arr : null;
}

async function enqueueScoreJobs(leadIds: string[], tenantId: string): Promise<void> {
  if (leadIds.length === 0) return;
  const rows = leadIds.map((leadId) => ({
    kind: "score_lead",
    status: "queued",
    tenant_id: tenantId,
    payload: { leadId },
    priority: 5, // por encima del default — queremos scorear leads frescos
  }));
  const { error } = await sb.from("scouter_jobs").insert(rows);
  if (error) console.error("enqueueScoreJobs error", error);
}

export async function handleDiscoverSeed(
  job: ScouterJob,
  payload: DiscoverSeedPayload,
): Promise<JobResult> {
  const seeds = (payload.seeds ?? []).filter((s) => typeof s === "string" && s.trim());
  if (seeds.length === 0) {
    return { ok: false, message: "payload.seeds vacío." };
  }
  const max = Math.min(payload.maxLeads ?? DEFAULT_MAX_LEADS, seeds.length);

  const budget = await checkBudget(job.tenant_id);
  if (!budget.ok) return { ok: false, message: budget.reason ?? "budget agotado" };

  const items = (await runProfileScrape(seeds.slice(0, max), job.tenant_id)) as ProfileItem[];
  const targetCountries = await fetchTargetCountries(job.company_id);
  const { inserted, updated, skippedInLeadgen, skippedByCountry, leadIds } =
    await persistProfilesAsLeads(
      items,
      job.tenant_id,
      job.company_id,
      // Por-lead: usamos el handle de la cuenta semilla como fuente. Antes
      // era hardcoded "seed" para todos y se perdía la trazabilidad de
      // desde qué cuenta vino cada lead.
      (item) => `seed:@${item.username ?? "?"}`,
      targetCountries,
    );
  await enqueueScoreJobs(leadIds, job.tenant_id);

  const skipLeadgen = skippedInLeadgen > 0 ? `, ${skippedInLeadgen} skip (ya en Lead Gen)` : "";
  const skipCountry =
    skippedByCountry > 0
      ? `, ${skippedByCountry} skip (país fuera de ${targetCountries?.join("/") ?? "target"})`
      : "";
  return {
    ok: true,
    message: `discover_seed: ${inserted} nuevos, ${updated} actualizados${skipLeadgen}${skipCountry}.`,
    data: { inserted, updated, skippedInLeadgen, skippedByCountry, leadIds },
    apifyItemsProcessed: items.length,
  };
}

export async function handleDiscoverHashtag(
  job: ScouterJob,
  payload: DiscoverHashtagPayload,
): Promise<JobResult> {
  const hashtag = payload.hashtag?.trim().replace(/^#/, "");
  if (!hashtag) return { ok: false, message: "payload.hashtag requerido." };
  const max = payload.maxLeads ?? DEFAULT_MAX_LEADS;

  const budget = await checkBudget(job.tenant_id);
  if (!budget.ok) return { ok: false, message: budget.reason ?? "budget agotado" };

  // 1) Descubrir autores del hashtag.
  const authors = await runHashtagDiscovery(hashtag, job.tenant_id, max);
  if (authors.length === 0) {
    return { ok: true, message: `hashtag #${hashtag}: 0 autores`, data: { authors: 0 } };
  }

  // 2) Re-checar budget — el hashtag run consumió crédito ya.
  const budget2 = await checkBudget(job.tenant_id);
  if (!budget2.ok) {
    return {
      ok: true,
      message: `discover_hashtag #${hashtag}: ${authors.length} autores encontrados, profile scrape pospuesto (${budget2.reason}).`,
      data: { authorsFound: authors.length, leadsPersisted: 0 },
    };
  }

  // 3) Enriquecer perfiles + persistir.
  const usernames = authors.map((a) => a.username);
  const items = (await runProfileScrape(usernames, job.tenant_id)) as ProfileItem[];
  const targetCountries = await fetchTargetCountries(job.company_id);
  const { inserted, updated, skippedInLeadgen, skippedByCountry, leadIds } =
    await persistProfilesAsLeads(
      items,
      job.tenant_id,
      job.company_id,
      `hashtag:${hashtag}`,
      targetCountries,
    );
  await enqueueScoreJobs(leadIds, job.tenant_id);

  const skipLeadgen = skippedInLeadgen > 0 ? `, ${skippedInLeadgen} skip (ya en Lead Gen)` : "";
  const skipCountry =
    skippedByCountry > 0
      ? `, ${skippedByCountry} skip (país fuera de ${targetCountries?.join("/") ?? "target"})`
      : "";
  return {
    ok: true,
    message: `discover_hashtag #${hashtag}: ${inserted} nuevos, ${updated} actualizados${skipLeadgen}${skipCountry}.`,
    data: { authorsFound: authors.length, inserted, updated, skippedInLeadgen, skippedByCountry },
    apifyItemsProcessed: authors.length + items.length,
  };
}
