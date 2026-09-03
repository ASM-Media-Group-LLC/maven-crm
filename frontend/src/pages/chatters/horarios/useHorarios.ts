import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useRoleTier } from "@/hooks/useRoleTier";
import { useUserRole } from "@/hooks/useUserRole";
import type { Agency, Descanso, Grupo, GrupoCreadora, Miembro, Shift } from "./types";
import { sumarDias } from "./types";

// Tablas nuevas: los tipos generados de Supabase no las conocen todavía.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const SIN_GRUPOS: Grupo[] = [];
const SIN_MIEMBROS: Miembro[] = [];
const SIN_CREADORAS: GrupoCreadora[] = [];
const SIN_DESCANSOS: Descanso[] = [];
const SIN_NOMBRES: Record<string, string> = {};

async function traer<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

// ¿Qué puede hacer quien mira? Misma precedencia que la BD: fila explícita del
// modal de permisos manda; sin fila, decide el nivel del rol.
export function usePermisosHorarios() {
  const { explicitPermission, isLoading } = usePermissions();
  const { isSupervisorOrAbove } = useRoleTier();
  const { isAdmin } = useUserRole();
  const esSupervisor = isAdmin || isSupervisorOrAbove;
  const puedeGestionar = isAdmin || (explicitPermission("Chatters", "Horarios · Gestionar") ?? isSupervisorOrAbove);
  return { esSupervisor, puedeGestionar, cargando: isLoading };
}

// Identidad de chatter del usuario logueado (null si no es chatter).
export function useMiIdentidad() {
  return useQuery({
    queryKey: ["horarios-mi-identidad"],
    queryFn: async (): Promise<string | null> => traer<string | null>(db.rpc("my_chatter_identity")),
    staleTime: 5 * 60_000,
  });
}

// Grupos, miembros y creadoras VIGENTES. RLS decide cuánto ve cada quien: el
// chatter recibe solo su grupo, su fila y sus creadoras; el supervisor, todo.
export function useRoster(agency?: Agency | "") {
  const grupos = useQuery({
    queryKey: ["horarios-grupos", agency ?? ""],
    queryFn: async (): Promise<Grupo[]> => {
      let q = db.from("chatter_groups").select("*").eq("active", true).order("sort_order").order("name");
      if (agency) q = q.eq("agency", agency);
      return traer<Grupo[]>(q);
    },
  });
  const miembros = useQuery({
    queryKey: ["horarios-miembros"],
    queryFn: async (): Promise<Miembro[]> => traer<Miembro[]>(db.from("chatter_group_members").select("*").is("valid_to", null)),
  });
  const creadoras = useQuery({
    queryKey: ["horarios-creadoras"],
    queryFn: async (): Promise<GrupoCreadora[]> =>
      traer<GrupoCreadora[]>(db.from("chatter_group_creators").select("*").is("valid_to", null).order("creator_handle")),
  });
  return {
    grupos: grupos.data ?? SIN_GRUPOS,
    miembros: miembros.data ?? SIN_MIEMBROS,
    creadoras: creadoras.data ?? SIN_CREADORAS,
    cargando: grupos.isLoading || miembros.isLoading || creadoras.isLoading,
  };
}

// Descansos de un rango de semanas (lunes inclusive).
export function useDescansos(desde: string, hasta: string, agency?: Agency | "") {
  return useQuery({
    queryKey: ["horarios-descansos", desde, hasta, agency ?? ""],
    queryFn: async (): Promise<Descanso[]> => {
      let q = db.from("chatter_rest_days").select("*").gte("week_start", desde).lte("week_start", hasta).order("weekday");
      if (agency) q = q.eq("agency", agency);
      return traer<Descanso[]>(q);
    },
  });
}

// Nombres de chatters por identidad (solo display_name, vía función).
export function useNombres(ids: string[]) {
  const unicos = Array.from(new Set(ids.filter(Boolean))).sort();
  const q = useQuery({
    queryKey: ["horarios-nombres", unicos],
    enabled: unicos.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const filas = await traer<Array<{ id: string; display_name: string }>>(db.rpc("chatter_display_names", { _ids: unicos }));
      return Object.fromEntries(filas.map((f) => [f.id, f.display_name]));
    },
    staleTime: 5 * 60_000,
  });
  return q.data ?? SIN_NOMBRES;
}

// Catálogo para "Agregar chatter": SOLO personas con rol Chatter o Chatter
// Supervisor en Maven (vía RPC; user_roles no se lee desde el front).
export function useChattersCatalogo(habilitado: boolean) {
  return useQuery({
    queryKey: ["horarios-chatters-catalogo"],
    enabled: habilitado,
    queryFn: async (): Promise<Array<{ id: string; display_name: string; role: string }>> =>
      traer(db.rpc("list_chatters_horarios")),
    staleTime: 5 * 60_000,
  });
}

// Creadoras activas para agregar a un grupo.
export function useCreadorasCatalogo(habilitado: boolean) {
  return useQuery({
    queryKey: ["horarios-creadoras-catalogo"],
    enabled: habilitado,
    queryFn: async (): Promise<Array<{ id: string; name: string; artistic_name: string | null }>> =>
      traer(db.from("creators").select("id, name, artistic_name").eq("status", "active").order("artistic_name")),
    staleTime: 5 * 60_000,
  });
}

export function useMutacionesHorarios() {
  const qc = useQueryClient();
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["horarios-grupos"] });
    qc.invalidateQueries({ queryKey: ["horarios-miembros"] });
    qc.invalidateQueries({ queryKey: ["horarios-creadoras"] });
    qc.invalidateQueries({ queryKey: ["horarios-descansos"] });
  };
  const hoy = () => new Date().toISOString().slice(0, 10);

  // Descanso de una persona en una semana: se reemplaza (una persona descansa
  // una vez por semana), así mover el día es un solo paso.
  const fijarDescanso = useMutation({
    mutationFn: async (d: { week_start: string; agency: Agency; weekday: number; shift: Shift; identity_id: string; covered_by_identity_id?: string | null; note?: string | null }) => {
      await traer(db.from("chatter_rest_days").delete().eq("week_start", d.week_start).eq("identity_id", d.identity_id));
      await traer(db.from("chatter_rest_days").insert({ ...d, covered_by_identity_id: d.covered_by_identity_id ?? null, note: d.note ?? null }));
    },
    onSuccess: invalidar,
  });
  const quitarDescanso = useMutation({
    mutationFn: async (id: string) => { await traer(db.from("chatter_rest_days").delete().eq("id", id)); },
    onSuccess: invalidar,
  });
  const fijarNotaDia = useMutation({
    mutationFn: async (d: { week_start: string; agency: Agency; weekday: number; shift: Shift; note: string | null }) => {
      await traer(db.from("chatter_rest_days").delete().eq("week_start", d.week_start).eq("agency", d.agency).eq("weekday", d.weekday).eq("shift", d.shift).is("identity_id", null));
      if (d.note) await traer(db.from("chatter_rest_days").insert({ ...d, identity_id: null }));
    },
    onSuccess: invalidar,
  });
  // Copiar la semana anterior: por defecto ROTA los descansos un día (lunes →
  // martes), como lo lleva el equipo; se puede pedir copia exacta.
  const copiarSemana = useMutation({
    mutationFn: async (p: { agency: Agency; to_week: string; rotar: boolean }) =>
      traer<number>(db.rpc("chatter_rest_days_copy_week", { _agency: p.agency, _from_week: sumarDias(p.to_week, -7), _to_week: p.to_week, _rotate: p.rotar })),
    onSuccess: invalidar,
  });

  const agregarCreadora = useMutation({
    mutationFn: async (c: { group_id: string; creator_id: string | null; creator_handle: string }) => {
      await traer(db.from("chatter_group_creators").insert({ ...c, valid_from: hoy() }));
    },
    onSuccess: invalidar,
  });
  // Quitar = cerrar la vigencia, no borrar: el pasado no se altera.
  const quitarCreadora = useMutation({
    mutationFn: async (id: string) => { await traer(db.from("chatter_group_creators").update({ valid_to: hoy() }).eq("id", id)); },
    onSuccess: invalidar,
  });
  const marcarCreadora = useMutation({
    mutationFn: async (p: { id: string; ig?: boolean; mad?: boolean; sop?: boolean }) => {
      const { id, ...campos } = p;
      await traer(db.from("chatter_group_creators").update(campos).eq("id", id));
    },
    onSuccess: invalidar,
  });
  const agregarMiembro = useMutation({
    mutationFn: async (m: { group_id: string; identity_id: string; shift: Shift; is_supernumerary?: boolean }) => {
      await traer(db.from("chatter_group_members").insert({ ...m, is_supernumerary: m.is_supernumerary ?? false, valid_from: hoy() }));
    },
    onSuccess: invalidar,
  });
  const quitarMiembro = useMutation({
    mutationFn: async (id: string) => { await traer(db.from("chatter_group_members").update({ valid_to: hoy() }).eq("id", id)); },
    onSuccess: invalidar,
  });
  const crearGrupo = useMutation({
    mutationFn: async (g: { agency: Agency; name: string; sort_order: number }) => { await traer(db.from("chatter_groups").insert(g)); },
    onSuccess: invalidar,
  });
  const renombrarGrupo = useMutation({
    mutationFn: async (p: { id: string; name?: string; lead_name?: string | null; active?: boolean }) => {
      const { id, ...campos } = p;
      await traer(db.from("chatter_groups").update(campos).eq("id", id));
    },
    onSuccess: invalidar,
  });

  return { fijarDescanso, quitarDescanso, fijarNotaDia, copiarSemana, agregarCreadora, quitarCreadora, marcarCreadora, agregarMiembro, quitarMiembro, crearGrupo, renombrarGrupo };
}
