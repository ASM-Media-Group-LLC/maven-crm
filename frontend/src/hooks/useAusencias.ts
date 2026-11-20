import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type {
  Alcance, EstadoAusencia, FilaAsistencia, Politica, TipoAusencia,
} from "@/lib/ausencias";

// AUSENCIAS Y ASISTENCIA (20/11/2026): todo por RPC (20261120150000_ausencias.sql).
// Un fallo es un fallo: cada pantalla dice «no se pudo cargar» y ofrece
// reintentar; nunca «no hay nada».

type RpcDb = { rpc: (f: string, a?: unknown) => Promise<{ data: unknown; error: { message: string } | null }> };
const db = supabase as unknown as RpcDb;

async function llamar<T>(f: string, a?: unknown): Promise<T> {
  const { data, error } = await db.rpc(f, a);
  if (error) throw new Error(error.message.replace(/^[a-z_]+: /, ""));
  return data as T;
}

export interface MisPermisosAusencias {
  alcance: Alcance | null;
  aprueba_equipo: boolean;
  aprueba_final: boolean;
  es_rrhh: boolean;
  configura_empresa: boolean;
  permisos_extra: boolean;
}

/** ¿Ve a otras personas? (el menú «Asistencia» y la tarjeta del Inicio). */
export function veAOtros(p: MisPermisosAusencias | null | undefined): boolean {
  return !!p && (p.alcance === "all" || p.alcance === "subordinates" || p.aprueba_equipo || p.aprueba_final);
}

export function useMisPermisosAusencias() {
  const { user } = useAuth();
  return useQuery<MisPermisosAusencias | null>({
    enabled: !!user?.id,
    queryKey: ["ausencias-permisos", user?.id ?? null],
    staleTime: 60_000,
    queryFn: async () => {
      const d = await llamar<MisPermisosAusencias[] | MisPermisosAusencias>("mis_permisos_ausencias");
      return (Array.isArray(d) ? d[0] : d) ?? null;
    },
  });
}

export interface MiAusenciaHoy {
  ausente: boolean;
  ahora: boolean;
  tipo: TipoAusencia | null;
  hasta: string | null;
  parcial: boolean;
  hora_desde: string | null;
  hora_hasta: string | null;
  festivo: string | null;
}

export function useMiAusenciaHoy() {
  const { user } = useAuth();
  return useQuery<MiAusenciaHoy | null>({
    enabled: !!user?.id,
    queryKey: ["mi-ausencia-hoy", user?.id ?? null],
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const d = await llamar<MiAusenciaHoy[] | MiAusenciaHoy>("mi_ausencia_hoy");
      return (Array.isArray(d) ? d[0] : d) ?? null;
    },
  });
}

export interface Saldo {
  fecha_ingreso: string;
  ingreso_estimado: boolean;
  dias_anio: number;
  acumulados: number;
  usados: number;
  pendientes: number;
  disponibles: number;
}

export function useSaldo(userId: string | null | undefined) {
  return useQuery<Saldo | null>({
    enabled: !!userId,
    queryKey: ["ausencias-saldo", userId ?? null],
    staleTime: 30_000,
    queryFn: async () => {
      const d = await llamar<Saldo[]>("ausencias_saldo", { _uid: userId });
      const s = d?.[0];
      return s ? {
        ...s,
        dias_anio: Number(s.dias_anio), acumulados: Number(s.acumulados), usados: Number(s.usados),
        pendientes: Number(s.pendientes), disponibles: Number(s.disponibles),
      } : null;
    },
  });
}

export function usePoliticaAusencias() {
  return useQuery<(Politica & { puede_editar: boolean }) | null>({
    queryKey: ["ausencias-politica"],
    staleTime: 60_000,
    queryFn: async () => {
      const d = await llamar<Array<Politica & { puede_editar: boolean }>>("ausencias_politica_mia");
      const p = d?.[0];
      return p ? { ...p, vacaciones_dias_anio: Number(p.vacaciones_dias_anio) } : null;
    },
  });
}

export function useGuardarPolitica() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Politica) => llamar("ausencias_politica_guardar", {
      _dias_anio: p.vacaciones_dias_anio, _aviso_vac: p.aviso_vacaciones_dias,
      _aviso_permiso: p.aviso_permiso_dias, _aviso_dia_libre: p.aviso_dia_libre_dias,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["ausencias-politica"] }); },
  });
}

export interface MiAusencia {
  id: string;
  tipo: TipoAusencia;
  desde: string;
  hasta: string;
  hora_desde: string | null;
  hora_hasta: string | null;
  dias: number;
  motivo: string | null;
  adjunto_path: string | null;
  estado: EstadoAusencia;
  pagada: boolean | null;
  directa: boolean;
  rechazo_motivo: string | null;
  created_at: string;
}

export function useMisAusencias() {
  const { user } = useAuth();
  return useQuery<MiAusencia[]>({
    enabled: !!user?.id,
    queryKey: ["mis-ausencias", user?.id ?? null],
    staleTime: 15_000,
    queryFn: () => llamar<MiAusencia[]>("mis_ausencias").then((d) => d ?? []),
  });
}

export interface FilaBandeja {
  id: string;
  user_id: string;
  nombre: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
  equipo: string | null;
  tipo: TipoAusencia;
  desde: string;
  hasta: string;
  hora_desde: string | null;
  hora_hasta: string | null;
  dias: number;
  estado: EstadoAusencia;
  pagada: boolean | null;
  created_at: string;
  jefe_nombre: string | null;
  jefe_nota: string | null;
  motivo: string | null;
  adjunto_path: string | null;
  puedo_jefe: boolean;
  puedo_final: boolean;
  saldo_disponible: number | null;
}

export function useBandejaAusencias(enabled = true) {
  return useQuery<FilaBandeja[]>({
    enabled,
    queryKey: ["ausencias-bandeja"],
    staleTime: 15_000,
    refetchInterval: 60_000,
    queryFn: () => llamar<FilaBandeja[]>("ausencias_bandeja").then((d) => d ?? []),
  });
}

export interface FilaCalendario {
  id: string;
  user_id: string;
  nombre: string | null;
  equipo: string | null;
  tipo: TipoAusencia;
  desde: string;
  hasta: string;
  hora_desde: string | null;
  hora_hasta: string | null;
  estado: EstadoAusencia;
  pagada: boolean | null;
}

export function useCalendarioAusencias(desde: string, hasta: string, enabled = true) {
  return useQuery<FilaCalendario[]>({
    enabled,
    queryKey: ["ausencias-calendario", desde, hasta],
    staleTime: 30_000,
    queryFn: () => llamar<FilaCalendario[]>("ausencias_calendario", { _desde: desde, _hasta: hasta }).then((d) => d ?? []),
  });
}

export function useAsistencia(desde: string, hasta: string, userId: string | null = null, enabled = true) {
  return useQuery<FilaAsistencia[]>({
    enabled,
    queryKey: ["asistencia-dias", desde, hasta, userId],
    staleTime: 30_000,
    refetchInterval: desde === hasta ? 60_000 : false,
    queryFn: () => llamar<FilaAsistencia[]>("asistencia_dias", { _desde: desde, _hasta: hasta, _user_id: userId }).then((d) => d ?? []),
  });
}

export interface Festivo { id: string; fecha: string; nombre: string }

export function useFestivos() {
  return useQuery<Festivo[]>({
    queryKey: ["ausencias-festivos"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("ausencias_festivos" as never).select("id, fecha, nombre").order("fecha");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Festivo[];
    },
  });
}

export interface DiaHorario { dia: number; entrada: string | null; salida: string | null; por_semana: boolean }

export function useMiHorarioSemana() {
  const { user } = useAuth();
  return useQuery<DiaHorario[]>({
    enabled: !!user?.id,
    queryKey: ["mi-horario-semana", user?.id ?? null],
    staleTime: 60_000,
    queryFn: () => llamar<DiaHorario[]>("mi_horario_semana").then((d) => d ?? []),
  });
}

/** Quién está de vacaciones o ausente hoy (lo que ven los compañeros). */
export function useAusentesHoy() {
  const { user } = useAuth();
  return useQuery<Map<string, { etiqueta: "vacaciones" | "ausente"; hasta: string }>>({
    enabled: !!user?.id,
    queryKey: ["ausentes-hoy"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const d = await llamar<Array<{ user_id: string; etiqueta: "vacaciones" | "ausente"; hasta: string }>>("ausentes_hoy_empresa");
      return new Map((d ?? []).map((r) => [r.user_id, { etiqueta: r.etiqueta, hasta: r.hasta }]));
    },
  });
}

export interface PermisoExtra {
  id: string;
  clave: string | null;
  fila: string | null;
  alcance: Alcance | null;
  motivo: string | null;
  otorgado_por_nombre: string | null;
  otorgado_at: string;
  revocado_por_nombre: string | null;
  revocado_at: string | null;
  puedo_editar: boolean;
}

export function usePermisosExtra(userId: string | null | undefined) {
  return useQuery<PermisoExtra[]>({
    enabled: !!userId,
    queryKey: ["permisos-extra", userId ?? null],
    staleTime: 30_000,
    queryFn: () => llamar<PermisoExtra[]>("permisos_extra_de", { _user_id: userId }).then((d) => d ?? []),
  });
}

/** Todas las acciones; cada una refresca lo que toca. */
export function useAccionesAusencias() {
  const qc = useQueryClient();
  const refrescar = () => {
    for (const k of ["mis-ausencias", "ausencias-bandeja", "ausencias-calendario", "asistencia-dias", "ausencias-saldo", "mi-ausencia-hoy", "ausencias-festivos", "permisos-extra", "mi-turno"]) {
      void qc.invalidateQueries({ queryKey: [k] });
    }
  };
  const solicitar = useMutation({
    mutationFn: (s: { tipo: TipoAusencia; desde: string; hasta: string; horaDesde?: string | null; horaHasta?: string | null; motivo?: string; adjunto?: string | null }) =>
      llamar<string>("ausencia_solicitar", {
        _tipo: s.tipo, _desde: s.desde, _hasta: s.hasta, _hora_desde: s.horaDesde || null, _hora_hasta: s.horaHasta || null,
        _motivo: s.motivo || null, _adjunto_path: s.adjunto || null,
      }),
    onSuccess: refrescar,
  });
  const cancelar = useMutation({ mutationFn: (id: string) => llamar("ausencia_cancelar", { _id: id }), onSuccess: refrescar });
  const decidirJefe = useMutation({
    mutationFn: (d: { id: string; aprobar: boolean; nota?: string }) => llamar("ausencia_decidir_jefe", { _id: d.id, _aprobar: d.aprobar, _nota: d.nota || null }),
    onSuccess: refrescar,
  });
  const decidirFinal = useMutation({
    mutationFn: (d: { id: string; aprobar: boolean; pagada?: boolean | null; nota?: string }) =>
      llamar("ausencia_decidir_final", { _id: d.id, _aprobar: d.aprobar, _pagada: d.pagada ?? null, _nota: d.nota || null }),
    onSuccess: refrescar,
  });
  const registrar = useMutation({
    mutationFn: (r: { userId: string; tipo: TipoAusencia; desde: string; hasta: string; pagada: boolean; horaDesde?: string | null; horaHasta?: string | null; motivo?: string; adjunto?: string | null }) =>
      llamar<string>("ausencia_registrar", {
        _user_id: r.userId, _tipo: r.tipo, _desde: r.desde, _hasta: r.hasta, _pagada: r.pagada,
        _hora_desde: r.horaDesde || null, _hora_hasta: r.horaHasta || null, _motivo: r.motivo || null, _adjunto_path: r.adjunto || null,
      }),
    onSuccess: refrescar,
  });
  const festivoGuardar = useMutation({ mutationFn: (f: { fecha: string; nombre: string }) => llamar("ausencias_festivo_guardar", { _fecha: f.fecha, _nombre: f.nombre }), onSuccess: refrescar });
  const festivoQuitar = useMutation({ mutationFn: (id: string) => llamar("ausencias_festivo_quitar", { _id: id }), onSuccess: refrescar });
  const fechaIngreso = useMutation({ mutationFn: (f: { userId: string; fecha: string | null }) => llamar("ausencias_fecha_ingreso_guardar", { _user_id: f.userId, _fecha: f.fecha }), onSuccess: refrescar });
  const otorgarExtra = useMutation({
    mutationFn: (p: { userId: string; clave: string | null; fila: string | null; alcance: Alcance | null; motivo?: string }) =>
      llamar("permisos_extra_otorgar", { _user_id: p.userId, _clave: p.clave, _fila: p.fila, _alcance: p.alcance, _motivo: p.motivo || null }),
    onSuccess: refrescar,
  });
  const revocarExtra = useMutation({ mutationFn: (id: string) => llamar("permisos_extra_revocar", { _id: id }), onSuccess: refrescar });
  return { solicitar, cancelar, decidirJefe, decidirFinal, registrar, festivoGuardar, festivoQuitar, fechaIngreso, otorgarExtra, revocarExtra };
}

/** Sube el soporte al buzón privado (carpeta = la persona). Devuelve la ruta. */
export async function subirAdjunto(userId: string, archivo: File): Promise<string> {
  const ext = (archivo.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
  const ruta = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("ausencias-adjuntos").upload(ruta, archivo, { contentType: archivo.type || undefined });
  if (error) throw new Error(error.message);
  return ruta;
}

export async function abrirAdjunto(ruta: string): Promise<void> {
  const { data, error } = await supabase.storage.from("ausencias-adjuntos").createSignedUrl(ruta, 120);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "no-signed-url");
  window.open(data.signedUrl, "_blank", "noopener");
}
