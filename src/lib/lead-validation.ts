import { supabase } from "@/integrations/supabase/client";
import { normalizeHandle } from "@/lib/handle-utils";

/**
 * Normalize an OnlyFans URL to just the handle for comparison.
 */
export function normalizeOnlyFansUrl(input: string): string {
  if (!input) return "";
  return normalizeHandle(input); // handle-utils already supports onlyfans.com
}

/**
 * Check if a handle or OF URL already belongs to an existing creator.
 */
export async function checkCreatorExists(
  handle: string,
  onlyfansUrl?: string
): Promise<{ exists: boolean; creatorName?: string; creatorId?: string }> {
  const normalizedHandle = normalizeHandle(handle);
  const normalizedOf = onlyfansUrl ? normalizeOnlyFansUrl(onlyfansUrl) : "";

  // Check by instagram_handle
  if (normalizedHandle) {
    const { data } = await supabase
      .from("creators")
      .select("id, name, artistic_name")
      .or(`instagram_handle.ilike.${normalizedHandle},instagram_handle.ilike.@${normalizedHandle}`)
      .limit(1)
      .maybeSingle();
    if (data) {
      return {
        exists: true,
        creatorName: data.artistic_name || data.name || "Creadora",
        creatorId: data.id,
      };
    }
  }

  // Check by onlyfans_url
  if (normalizedOf) {
    const { data } = await supabase
      .from("creators")
      .select("id, name, artistic_name, onlyfans_url")
      .not("onlyfans_url", "is", null)
      .limit(100);

    if (data) {
      const match = data.find((c) => {
        const creatorOf = normalizeOnlyFansUrl(c.onlyfans_url || "");
        return creatorOf && creatorOf === normalizedOf;
      });
      if (match) {
        return {
          exists: true,
          creatorName: match.artistic_name || match.name || "Creadora",
          creatorId: match.id,
        };
      }
    }
  }

  return { exists: false };
}

/**
 * Check if a handle already has previous records in leads or contacts.
 * Returns informational data — does NOT block creation.
 */
export async function checkPreviousLead(
  handle: string,
  onlyfansUrl?: string
): Promise<{ existed: boolean }> {
  const normalizedHandle = normalizeHandle(handle);

  if (normalizedHandle) {
    const { data } = await supabase
      .from("leadgen_entries")
      .select("id")
      .eq("model_handle", normalizedHandle)
      .limit(1)
      .maybeSingle();
    if (data) return { existed: true };

    // Also check closers_contacts
    const { data: contactData } = await supabase
      .from("closers_contacts")
      .select("id")
      .ilike("handle", normalizedHandle)
      .limit(1)
      .maybeSingle();
    if (contactData) return { existed: true };
  }

  return { existed: false };
}

/**
 * Check if an OnlyFans URL already exists in leads or contacts.
 */
export async function checkDuplicateOnlyFans(
  url: string
): Promise<{ existsInLeads: boolean; existsInContacts: boolean }> {
  const normalized = normalizeOnlyFansUrl(url);
  if (!normalized) return { existsInLeads: false, existsInContacts: false };

  // Check leads
  const { data: leads } = await supabase
    .from("leadgen_entries")
    .select("id, onlyfans_url" as any)
    .not("onlyfans_url", "is", null)
    .limit(200);

  const existsInLeads = !!(leads as any[])?.some(
    (e) => normalizeOnlyFansUrl(e.onlyfans_url || "") === normalized
  );

  // Check contacts
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
