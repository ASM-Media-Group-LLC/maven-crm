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
 * Returns the date of the most recent entry for 24h rule.
 */
export async function checkPreviousLead(
  handle: string,
  onlyfansUrl?: string
): Promise<{ existed: boolean; lastEntryDate?: string }> {
  const normalizedHandle = normalizeHandle(handle);

  if (normalizedHandle) {
    const { data } = await supabase
      .from("leadgen_entries")
      .select("id, created_at")
      .eq("model_handle", normalizedHandle)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return { existed: true, lastEntryDate: data.created_at };
  }

  return { existed: false };
}

/**
 * Check if a handle already exists in closers_contacts.
 * Informational only — does NOT block.
 */
export async function checkExistingContact(
  handle: string
): Promise<{ exists: boolean; contactName?: string }> {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) return { exists: false };

  const { data } = await supabase
    .from("closers_contacts")
    .select("id, name")
    .ilike("handle", normalizedHandle)
    .limit(1)
    .maybeSingle();

  if (data) return { exists: true, contactName: data.name };
  return { exists: false };
}

/**
 * Check if an OnlyFans URL already exists in leads or contacts.
 */
export async function checkDuplicateOnlyFans(
  url: string
): Promise<{ existsInLeads: boolean; existsInContacts: boolean }> {
  const normalized = normalizeOnlyFansUrl(url);
  if (!normalized) return { existsInLeads: false, existsInContacts: false };

  const { data: leads } = await supabase
    .from("leadgen_entries")
    .select("id, onlyfans_url" as any)
    .not("onlyfans_url", "is", null)
    .limit(200);

  const existsInLeads = !!(leads as any[])?.some(
    (e) => normalizeOnlyFansUrl(e.onlyfans_url || "") === normalized
  );

  const { data: contacts } = await supabase
    .from("closers_contacts")
    .select("id, onlyfans_url" as any)
    .not("onlyfans_url", "is", null)
    .limit(200);

  const existsInContacts = !!(contacts as any[])?.some(
    (e) => normalizeOnlyFansUrl(e.onlyfans_url || "") === normalized
  );

  return { existsInLeads, existsInContacts };
}
