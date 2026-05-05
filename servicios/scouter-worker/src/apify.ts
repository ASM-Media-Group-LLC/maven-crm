// Wrapper minimal sobre apify-client. Mantiene la decisión de qué
// actor usar centralizada acá — si después cambian de actor (p.ej.
// porque el oficial dejó de devolver phone), solo se toca un archivo.
//
// IMPORTANT: cada call a runActor() tiene que estar gateado por
// budget.checkBudget(). Este módulo NO lo hace por sí mismo — lo dejamos
// al handler porque algunos jobs no requieren Apify (score_lead).

import { ApifyClient } from "apify-client";
import { recordSpend } from "./budget.ts";

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
if (!APIFY_TOKEN) {
  console.warn("scouter-worker: APIFY_API_TOKEN ausente — discovery jobs van a fallar.");
}

const client = APIFY_TOKEN ? new ApifyClient({ token: APIFY_TOKEN }) : null;

const PROFILE_ACTOR = process.env.APIFY_PROFILE_ACTOR ?? "apify/instagram-profile-scraper";
const HASHTAG_ACTOR = process.env.APIFY_HASHTAG_ACTOR ?? "apify/instagram-hashtag-scraper";
const MAX_ITEMS_PER_RUN = parseInt(process.env.APIFY_MAX_ITEMS_PER_RUN ?? "50", 10);

// Costo estimado por item — varía por actor, ajustar con datos reales.
// Apify oficial cobra ~$0.0023/item para Instagram Profile Scraper.
const COST_PER_ITEM_USD = 0.0023;

interface IgProfileItem {
  username?: string;
  url?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  followsCount?: number;
  verified?: boolean;
  profilePicUrl?: string;
  profilePicUrlHD?: string;
  externalUrl?: string;
  // Algunos actors dan más; los handlers normalizan lo que les sirve.
  [k: string]: unknown;
}

/** Corre el actor de profile scraping para una lista de usernames.
 *  Devuelve los items crudos del dataset. El handler decide qué hacer. */
export async function runProfileScrape(
  usernames: string[],
  tenantId: string,
): Promise<IgProfileItem[]> {
  if (!client) throw new Error("Apify client no inicializado (falta APIFY_API_TOKEN).");
  const limited = usernames.slice(0, MAX_ITEMS_PER_RUN);
  const run = await client.actor(PROFILE_ACTOR).call({
    usernames: limited,
    resultsLimit: limited.length,
    // Parámetros adicionales del actor — varían por versión, ajustar
    // según docs: https://apify.com/apify/instagram-profile-scraper
  });
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const itemsCount = items.length;
  const estSpend = itemsCount * COST_PER_ITEM_USD;
  await recordSpend(tenantId, estSpend, itemsCount);
  return items as IgProfileItem[];
}

/** Discovery por hashtag. Devuelve los autores de los posts top del
 *  hashtag — el handler los pasa después por runProfileScrape para
 *  enriquecer. */
export async function runHashtagDiscovery(
  hashtag: string,
  tenantId: string,
  maxItems = MAX_ITEMS_PER_RUN,
): Promise<Array<{ username: string; postUrl: string }>> {
  if (!client) throw new Error("Apify client no inicializado (falta APIFY_API_TOKEN).");
  const run = await client.actor(HASHTAG_ACTOR).call({
    hashtags: [hashtag],
    resultsLimit: maxItems,
  });
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  await recordSpend(tenantId, items.length * COST_PER_ITEM_USD, items.length);

  // Normalizar: el actor devuelve posts; agarramos el ownerUsername.
  const seen = new Set<string>();
  const out: Array<{ username: string; postUrl: string }> = [];
  for (const it of items as Array<Record<string, unknown>>) {
    const username = (it.ownerUsername ?? it.owner_username ?? it.username) as string | undefined;
    const postUrl = (it.url ?? it.shortcode ?? "") as string;
    if (!username || seen.has(username)) continue;
    seen.add(username);
    out.push({ username, postUrl });
  }
  return out;
}
