import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type CreatorWithBusiness = Tables<"creators"> & {
  creator_business: { assigned_agency: string | null; manager_type: string | null; kash_type: string | null; start_date: string | null } | null;
};

const STATUS_LIST = ["active", "onboarding", "paused", "leaving", "terminated", "pendiente", "pendiente_verificacion"] as const;
export type CreatorStatus = (typeof STATUS_LIST)[number];

export interface StatusCounts {
  active: number;
  onboarding: number;
  paused: number;
  leaving: number;
  terminated: number;
  pendiente: number;
  pendiente_verificacion: number;
  total: number;
}

async function fetchCreators(): Promise<CreatorWithBusiness[]> {
  const { data, error } = await supabase
    .from("creators")
    .select("*, creator_business(assigned_agency, manager_type, kash_type, start_date)");
  if (error) throw error;
  return (data ?? []) as CreatorWithBusiness[];
}

function computeStatusCounts(creators: CreatorWithBusiness[]): StatusCounts {
  const counts: StatusCounts = { active: 0, onboarding: 0, paused: 0, leaving: 0, terminated: 0, pendiente: 0, pendiente_verificacion: 0, total: creators.length };
  for (const c of creators) {
    const s = c.status as CreatorStatus;
    if (s in counts) counts[s]++;
  }
  return counts;
}

function uniqueValues(creators: CreatorWithBusiness[], key: keyof Tables<"creators">): string[] {
  const set = new Set<string>();
  for (const c of creators) {
    const val = c[key];
    if (val && typeof val === "string") set.add(val);
  }
  return Array.from(set).sort();
}

const AGENCY_ORDER = [
  "Atomic Agency", "Elite Models", "Kash Agency",
  "Unlok Platform", "Trafix", "Otra",
];

function uniqueAgencies(creators: CreatorWithBusiness[]): string[] {
  const set = new Set<string>();
  for (const c of creators) {
    const agency = c.creator_business?.assigned_agency;
    if (agency) set.add(agency);
  }
  const known = AGENCY_ORDER.filter((a) => set.has(a));
  const others = Array.from(set).filter((a) => !AGENCY_ORDER.includes(a)).sort();
  return [...known, ...others];
}

function uniqueManagers(creators: CreatorWithBusiness[]): string[] {
  const set = new Set<string>();
  for (const c of creators) {
    const mt = c.creator_business?.manager_type;
    if (mt) set.add(mt);
  }
  return Array.from(set).sort();
}

export interface CreadorFilters {
  search: string;
  agency: string;
  status: string;
  category: string;
  country: string;
  city: string;
  manager: string;
}

function applyFilters(creators: CreatorWithBusiness[], filters: CreadorFilters): CreatorWithBusiness[] {
  let result = creators;

  if (filters.agency) {
    result = result.filter((c) => c.creator_business?.assigned_agency === filters.agency);
  }
  if (filters.status) {
    result = result.filter((c) => c.status === filters.status);
  }
  if (filters.category) {
    result = result.filter((c) => c.category === filters.category);
  }
  if (filters.country) {
    result = result.filter((c) => c.country === filters.country);
  }
  if (filters.city) {
    result = result.filter((c) => c.city === filters.city);
  }
  if (filters.manager) {
    result = result.filter((c) => c.creator_business?.manager_type === filters.manager);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.artistic_name && c.artistic_name.toLowerCase().includes(q)) ||
        (c.instagram_handle && c.instagram_handle.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
    );
  }

  return result;
}

export function useCreadores(filters: CreadorFilters, page = 1, pageSize = 25) {
  const query = useQuery({
    queryKey: ["creators"],
    queryFn: fetchCreators,
  });

  const allCreators = query.data ?? [];
  const filtered = applyFilters(allCreators, filters);
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return {
    creators: paginated,
    allCreators,
    totalCount,
    totalPages,
    isLoading: query.isLoading,
    statusCounts: computeStatusCounts(filtered),
    agencies: uniqueAgencies(allCreators),
    categories: uniqueValues(allCreators, "category"),
    countries: uniqueValues(allCreators, "country"),
    cities: uniqueValues(allCreators, "city"),
    managers: uniqueManagers(allCreators),
  };
}

export function useAddCreador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: TablesInsert<"creators">) => {
      const { error } = await supabase.from("creators").insert(data);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["creators"] }),
  });
}

interface AddCreadorWithBusinessInput {
  creator: TablesInsert<"creators">;
  business: Omit<TablesInsert<"creator_business">, "creator_id">;
}

interface DocumentInput {
  file_name: string;
  file_url: string;
  file_type: string;
  description?: string;
}

interface AddCreadorFullInput extends AddCreadorWithBusinessInput {
  documents?: DocumentInput[];
}

export function useUpdateCreador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TablesInsert<"creators">> }) => {
      const { error } = await supabase.from("creators").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["creators"] }),
  });
}

export type CreatorFull = Tables<"creators"> & {
  creator_business: Tables<"creator_business"> | null;
};

export function useCreadorById(id: string) {
  return useQuery({
    queryKey: ["creator", id],
    queryFn: async (): Promise<CreatorFull | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("creators")
        .select("*, creator_business(*)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as CreatorFull | null;
    },
    enabled: !!id,
  });
}

export function useAddCreadorWithBusiness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ creator, business, documents }: AddCreadorFullInput): Promise<string> => {
      const { data: { user } } = await supabase.auth.getUser();
      const creatorPayload = { ...creator, created_by: creator.created_by || user?.id || null };
      const { data, error } = await supabase.from("creators").insert(creatorPayload).select("id").single();
      if (error) throw error;
      const creatorId = data.id;
      const { error: bizError } = await supabase
        .from("creator_business")
        .insert({ ...business, creator_id: creatorId });
      if (bizError) throw bizError;

      if (documents && documents.length > 0) {
        const docs = documents.map((d) => ({
          creator_id: creatorId,
          file_name: d.file_name,
          file_url: d.file_url,
          file_type: d.file_type,
          description: d.description || null,
        }));
        const { error: docError } = await supabase.from("creator_documents").insert(docs);
        if (docError) throw docError;
      }
      return creatorId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["creators"] }),
  });
}
