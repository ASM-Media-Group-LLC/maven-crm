import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useAgenciaDeCreadoras } from "@/hooks/useAgenciaDeCreadoras";
import { type LineaDeAgencia, opcionesDelFiltro } from "@/lib/creadoras/agencia";

export type CreatorWithBusiness = Tables<"creators"> & {
  creator_business: {
    assigned_agency: string | null;
    manager_type: string | null;
    kash_type: string | null;
    start_date: string | null;
    company_id: string | null;
    company: { id: string; name: string } | null;
  } | null;
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
  // JOIN explícito con scouter_companies vía company_id FK. assigned_agency
  // (texto) se mantiene en el select por compat — los reads que aún no
  // migraron lo siguen leyendo. Una vez todos en company.name, droppeamos.
  const { data, error } = await supabase
    // PII: leemos la vista enmascarada (phone/email/whatsapp_number reales solo para admin).
    // El embed creator_business resuelve igual (PostgREST detecta la relación vía la base).
    .from("v_creators" as never)
    .select(
      "*, creator_business(assigned_agency, manager_type, kash_type, start_date, company_id, company:scouter_companies(id, name))",
    );
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

// Las opciones del filtro «Agencia»: las de mi agencia en su orden (Kash Plus,
// Kash Massive, Atomick) y después lo que haya en fichas viejas. Una sola regla
// para todas las pantallas: lib/creadoras/agencia.ts.
function uniqueAgencies(creators: CreatorWithBusiness[], agenciaDe: (cb: CreatorWithBusiness["creator_business"]) => string, lineas: LineaDeAgencia[]): string[] {
  return opcionesDelFiltro(creators.map((c) => agenciaDe(c.creator_business)), lineas);
}

// Filtro Managers = PERSONAS con rol manager (mismo pool que el select de la
// ficha, vía RPC SECURITY DEFINER porque RLS de user_roles solo deja leer la
// fila propia).
export interface ManagerOption {
  id: string;
  full_name: string | null;
}

async function fetchAssignableManagers(): Promise<ManagerOption[]> {
  const { data, error } = await supabase.rpc("get_assignable_managers" as never);
  if (error) throw error;
  return (data ?? []) as ManagerOption[];
}

// Bitácora manager↔creadora (creator_manager_history): con ella el filtro
// muestra las modelos que SON o FUERON de cada manager (pedido de Jhon 08/09).
async function fetchManagerHistory(): Promise<Array<{ creator_id: string; manager_profile_id: string }>> {
  const { data, error } = await supabase
    .from("creator_manager_history" as never)
    .select("creator_id, manager_profile_id");
  if (error) throw error;
  return (data ?? []) as Array<{ creator_id: string; manager_profile_id: string }>;
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

function applyFilters(
  creators: CreatorWithBusiness[],
  filters: CreadorFilters,
  // creator_ids que alguna vez tuvieron a la manager del filtro (bitácora).
  managerCreatorIds: Set<string> | null,
  agenciaDe: (cb: CreatorWithBusiness["creator_business"]) => string,
): CreatorWithBusiness[] {
  let result = creators;

  if (filters.agency) {
    result = result.filter((c) => agenciaDe(c.creator_business) === filters.agency);
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
    // "Son o fueron" de la manager: asignación ACTUAL o cualquier fila de la
    // bitácora. Se combina en AND con los demás filtros (ej. activas + Carolina
    // = las activas que son o fueron de Carolina).
    result = result.filter(
      (c) =>
        (c as { assigned_manager_profile_id?: string | null }).assigned_manager_profile_id === filters.manager ||
        (managerCreatorIds?.has(c.id) ?? false),
    );
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
  const agencia = useAgenciaDeCreadoras();
  const query = useQuery({
    queryKey: ["creators"],
    queryFn: fetchCreators,
  });
  const managersQuery = useQuery({
    queryKey: ["assignable-managers"],
    queryFn: fetchAssignableManagers,
    staleTime: 5 * 60_000,
  });
  const historyQuery = useQuery({
    queryKey: ["creator-manager-history"],
    queryFn: fetchManagerHistory,
    staleTime: 60_000,
  });

  const allCreators = query.data ?? [];
  const managerCreatorIds = filters.manager
    ? new Set(
        (historyQuery.data ?? [])
          .filter((h) => h.manager_profile_id === filters.manager)
          .map((h) => h.creator_id),
      )
    : null;
  const filtered = applyFilters(allCreators, filters, managerCreatorIds, agencia.agenciaDe);
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
    agencies: uniqueAgencies(allCreators, agencia.agenciaDe, agencia.lineas),
    categories: uniqueValues(allCreators, "category"),
    countries: uniqueValues(allCreators, "country"),
    cities: uniqueValues(allCreators, "city"),
    managers: managersQuery.data ?? [],
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
  // Cuentas adicionales por red (creator_social_accounts) bufferadas en el form de crear.
  additionalAccounts?: Array<{ network: string; username: string }>;
}

// Redes de "handle pelado" donde la 1ª cuenta puede llenar la columna principal de
// creators si quedó vacía (safeguard "la 1ª que se agregue será la principal").
// Excluimos facebook/telegram/onlyfans/other porque sus columnas guardan URL/invite
// completos y promover un username pelado las rompería.
const PROMOTE_COL: Record<string, string> = {
  instagram: "instagram_handle",
  x: "twitter_handle",
  tiktok: "tiktok_handle",
  youtube: "youtube_handle",
  reddit: "reddit_handle",
};

// PII: las vistas devuelven phone/email/whatsapp_number ENMASCARADOS (con "•") a no-admin.
// Si el form de edición se guarda sin tocar esos campos, NO debemos pisar el valor real con
// el enmascarado. Dropeamos cualquier campo PII cuyo valor contenga "•" (no se editó de verdad).
// El no-admin SÍ puede registrar/cambiar un número: si escribe uno nuevo (sin "•"), se guarda.
export function stripMaskedPii<T extends Record<string, unknown>>(patch: T): T {
  const out: Record<string, unknown> = { ...patch };
  for (const k of ["phone", "phone_e164", "whatsapp_number", "email"]) {
    if (typeof out[k] === "string" && (out[k] as string).includes("•")) delete out[k];
  }
  return out as T;
}

export function useUpdateCreador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TablesInsert<"creators">> }) => {
      const { error } = await supabase.from("creators").update(stripMaskedPii(data)).eq("id", id);
      if (error) throw error;
      return id;
    },
    // También la ficha abierta (useCreadorById): el lápiz del Listado y la ficha
    // completa editan la misma fila.
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["creators"] });
      qc.invalidateQueries({ queryKey: ["creator", id] });
    },
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
        .from("v_creators" as never) // PII enmascarada (real solo admin)
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
    mutationFn: async ({ creator, business, documents, additionalAccounts }: AddCreadorFullInput): Promise<string> => {
      const { data: { user } } = await supabase.auth.getUser();
      const creatorPayload = { ...creator, created_by: creator.created_by || user?.id || null };

      // Procesar cuentas adicionales: agrupar por red, promover la 1ª a principal
      // si la columna quedó vacía (solo redes de handle), el resto quedan como extras.
      const byNet = new Map<string, string[]>();
      for (const a of additionalAccounts || []) {
        const u = (a.username || "").trim();
        if (!u) continue;
        const arr = byNet.get(a.network) || [];
        if (!arr.includes(u)) arr.push(u);
        byNet.set(a.network, arr);
      }
      const remaining: Array<{ network: string; username: string }> = [];
      for (const [network, list] of byNet) {
        const col = PROMOTE_COL[network];
        if (col && !(creatorPayload as Record<string, unknown>)[col]) {
          (creatorPayload as Record<string, unknown>)[col] = list[0];
          list.slice(1).forEach((u) => remaining.push({ network, username: u }));
        } else {
          list.forEach((u) => remaining.push({ network, username: u }));
        }
      }

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

      // Cuentas adicionales: best-effort (la creadora ya quedó creada; si falla un
      // extra no tiene sentido romper todo — se puede re-agregar en Editar).
      if (remaining.length > 0) {
        const rows = remaining.map((a) => ({
          creator_id: creatorId,
          network: a.network,
          username: a.username,
          active: true,
          created_by: user?.id || null,
        }));
        const { error: accError } = await supabase.from("creator_social_accounts").insert(rows);
        if (accError) console.warn("[useAddCreadorWithBusiness] cuentas adicionales:", accError.message);
      }
      return creatorId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["creators"] }),
  });
}
