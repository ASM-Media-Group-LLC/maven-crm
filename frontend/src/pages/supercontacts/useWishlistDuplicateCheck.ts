import { supabase } from "@/integrations/supabase/client";
import { normalizeHandle } from "@/lib/handle-utils";

export interface DuplicateResult {
  handle: string;
  found: boolean;
  source?: "wishlist" | "creator" | "contact";
  sourceLabel?: string;
  name?: string;
  createdAt?: string;
  createdByName?: string;
  instagramUrl?: string;
}

/**
 * Check a single handle against super_contacts, creators, and closers_contacts.
 */
export async function checkWishlistDuplicate(rawHandle: string): Promise<DuplicateResult> {
  const handle = normalizeHandle(rawHandle);
  if (!handle) return { handle: rawHandle, found: false };

  // 1. Check super_contacts (wishlist)
  const { data: sc } = await supabase
    .from("super_contacts")
    .select("id, instagram_handle, full_name, created_at, created_by")
    .ilike("instagram_handle", handle)
    .limit(1)
    .maybeSingle();

  if (sc) {
    const agentName = await getAgentName(sc.created_by);
    return {
      handle,
      found: true,
      source: "wishlist",
      sourceLabel: "Wishlist",
      name: sc.full_name || sc.instagram_handle,
      createdAt: sc.created_at,
      createdByName: agentName,
      instagramUrl: `https://instagram.com/${handle}`,
    };
  }

  // 2. Check creators
  const { data: cr } = await supabase
    .from("creators")
    .select("id, name, artistic_name, instagram_handle, created_at, status")
    .or(`instagram_handle.ilike.${handle},instagram_handle.ilike.@${handle}`)
    .limit(1)
    .maybeSingle();

  if (cr) {
    return {
      handle,
      found: true,
      source: "creator",
      sourceLabel: `Creadora (${(cr as any).status || "activa"})`,
      name: cr.artistic_name || cr.name || handle,
      createdAt: cr.created_at,
      instagramUrl: `https://instagram.com/${handle}`,
    };
  }

  // 3. Check closers_contacts
  const { data: cc } = await supabase
    .from("closers_contacts")
    .select("id, name, handle, created_at, created_by")
    .ilike("handle", handle)
    .limit(1)
    .maybeSingle();

  if (cc) {
    const agentName = await getAgentName(cc.created_by);
    return {
      handle,
      found: true,
      source: "contact",
      sourceLabel: "Contacto CRM",
      name: cc.name || handle,
      createdAt: cc.created_at,
      createdByName: agentName,
      instagramUrl: `https://instagram.com/${handle}`,
    };
  }

  return { handle, found: false };
}

/**
 * Check multiple handles in batch. Returns array of results.
 */
export async function checkWishlistDuplicatesBatch(handles: string[]): Promise<DuplicateResult[]> {
  const results: DuplicateResult[] = [];
  // Process in parallel batches of 10
  const batchSize = 10;
  for (let i = 0; i < handles.length; i += batchSize) {
    const batch = handles.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(checkWishlistDuplicate));
    results.push(...batchResults);
  }
  return results;
}

async function getAgentName(userId: string | null): Promise<string | undefined> {
  if (!userId) return undefined;
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name || undefined;
}
