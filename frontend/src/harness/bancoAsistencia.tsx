// Banco de pruebas: Asistencia y Mis días (20/11/2026). Sin sesión ni base: las
// RPC responden con datos de ejemplo. /harness.html?ver=asistencia[&tab=hoy|calendario|ausencias|horarios|festivos][&vista=…]
// · ?ver=mis-dias · ?ver=menu-asistencia (el menú antes y después) · &tema=claro
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import {
  CalendarCheck2, CalendarHeart, Clock, LayoutDashboard, Mail, MessageCircle, MoreHorizontal, Users, Users2, Video,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthContext } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import Asistencia from "@/pages/asistencia/Asistencia";
import MisDias from "@/pages/asistencia/MisDias";
import { hoyBogota, lunesDe, rangoDias, sumarDias, type FilaAsistencia } from "@/lib/ausencias";

const HOY = hoyBogota();
const GENTE = [
  ["a1", "Alexandra Giraldo", "Chatters"], ["a2", "Breyner Garzon", "Chatters"], ["a3", "Daniel Ospina", "Chatters"],
  ["a4", "Isabel Tuiran", "Warming"], ["a5", "Michel Zarate", "PR"], ["a6", "Monica Duque", "PR"], ["a7", "David Aunta", "Editores"],
] as const;

const iso = (dia: string, hhmm: string) => new Date(`${dia}T${hhmm}:00-05:00`).toISOString();

function fila(uid: string, nombre: string, equipo: string, dia: string): FilaAsistencia {
  const dow = new Date(`${dia}T12:00:00Z`).getUTCDay();
  const base: FilaAsistencia = {
    user_id: uid, nombre, avatar_url: null, avatar_seed: null, equipo, dia, turno_inicio: iso(dia, "08:00"), turno_fin: iso(dia, "16:00"),
    estado: "presente", entrada_at: iso(dia, "07:56"), tarde_min: 0, trabajado_min: 420, turno_min: 480, ausencia_id: null,
    ausencia_tipo: null, ausencia_estado: null, ausencia_pagada: null, ausencia_parcial: null, festivo: null,
    en_vivo: dia === HOY ? "conectado" : null,
  };
  if (dow === 0 || dow === 6) return { ...base, estado: "descanso", turno_inicio: null, turno_fin: null, entrada_at: null, trabajado_min: null, turno_min: null };
  if (dia === "2026-12-08") return { ...base, estado: "festivo", festivo: "Inmaculada Concepción", entrada_at: null, trabajado_min: null };
  if (uid === "a4" && dia >= sumarDias(HOY, -1) && dia <= sumarDias(HOY, 6)) {
    return { ...base, estado: "ausente", ausencia_id: "x", ausencia_tipo: "vacaciones", ausencia_estado: "aprobada", ausencia_pagada: true, ausencia_parcial: false, entrada_at: null, trabajado_min: null };
  }
  if (uid === "a6" && dia === HOY) return { ...base, estado: "ausente", ausencia_id: "y", ausencia_tipo: "incapacidad", ausencia_estado: "aprobada", ausencia_pagada: true, ausencia_parcial: false, entrada_at: null, trabajado_min: null };
  if (dia > HOY) return { ...base, estado: "pendiente", entrada_at: null, trabajado_min: null, en_vivo: null };
  if (uid === "a2") return { ...base, estado: "tarde", tarde_min: 17, entrada_at: iso(dia, "08:17"), trabajado_min: 380, en_vivo: dia === HOY ? "en_pausa" : null };
  if (uid === "a5" && (dia === HOY || dia === sumarDias(HOY, -3))) return { ...base, estado: dia === HOY ? "sin_entrada" : "falto", entrada_at: null, trabajado_min: 0, en_vivo: dia === HOY ? "desconectado" : null };
  return base;
}

function asistencia(desde: string, hasta: string, uid: string | null): FilaAsistencia[] {
  const out: FilaAsistencia[] = [];
  for (const [id, n, e] of GENTE) {
    if (uid && uid !== id) continue;
    for (const d of rangoDias(desde, hasta)) out.push(fila(id, n, e, d));
  }
  return out;
}

const RESPUESTAS: Record<string, (a: Record<string, string | null>) => unknown> = {
  mis_permisos_ausencias: () => [{ alcance: "all", aprueba_equipo: true, aprueba_final: true, es_rrhh: true, configura_empresa: true, permisos_extra: true }],
  asistencia_dias: (a) => asistencia(a._desde!, a._hasta!, a._user_id),
  ausencias_bandeja: () => [
    { id: "b1", user_id: "a1", nombre: "Alexandra Giraldo", avatar_url: null, avatar_seed: null, equipo: "Chatters", tipo: "vacaciones", desde: sumarDias(HOY, 20), hasta: sumarDias(HOY, 26), hora_desde: null, hora_hasta: null, dias: 5, estado: "pendiente_rrhh", pagada: true, created_at: HOY, jefe_nombre: "Daniel Ospina", jefe_nota: "Cubre Breyner", motivo: "Viaje familiar", adjunto_path: null, puedo_jefe: false, puedo_final: true, saldo_disponible: 11.5 },
    { id: "b2", user_id: "a7", nombre: "David Aunta", avatar_url: null, avatar_seed: null, equipo: "Editores", tipo: "permiso", desde: sumarDias(HOY, 3), hasta: sumarDias(HOY, 3), hora_desde: "08:00", hora_hasta: "10:00", dias: 0.5, estado: "pendiente_jefe", pagada: null, created_at: HOY, jefe_nombre: null, jefe_nota: null, motivo: "Cita médica", adjunto_path: null, puedo_jefe: true, puedo_final: true, saldo_disponible: null },
  ],
  ausencias_calendario: () => [],
  ausencias_politica_mia: () => [{ vacaciones_dias_anio: 15, aviso_vacaciones_dias: 15, aviso_permiso_dias: 2, aviso_dia_libre_dias: 2, puede_editar: true }],
  ausencias_saldo: () => [{ fecha_ingreso: "2025-03-10", ingreso_estimado: false, dias_anio: 15, acumulados: 17.75, usados: 5, pendientes: 0, disponibles: 12.75 }],
  mis_ausencias: () => [
    { id: "m1", tipo: "vacaciones", desde: sumarDias(HOY, 30), hasta: sumarDias(HOY, 34), hora_desde: null, hora_hasta: null, dias: 5, motivo: null, adjunto_path: null, estado: "pendiente_jefe", pagada: true, directa: false, rechazo_motivo: null, created_at: HOY },
    { id: "m2", tipo: "incapacidad", desde: "2026-10-14", hasta: "2026-10-15", hora_desde: null, hora_hasta: null, dias: 2, motivo: "Gripa", adjunto_path: "x/y.pdf", estado: "aprobada", pagada: true, directa: true, rechazo_motivo: null, created_at: "2026-10-14" },
    { id: "m3", tipo: "permiso", desde: "2026-09-02", hasta: "2026-09-02", hora_desde: "14:00", hora_hasta: "16:00", dias: 0.5, motivo: null, adjunto_path: null, estado: "rechazada", pagada: null, directa: false, rechazo_motivo: "Ese día hay cierre de mes", created_at: "2026-08-28" },
  ],
  mi_horario_semana: () => [1, 2, 3, 4, 5, 6, 0].map((d) => ({ dia: d, entrada: d >= 1 && d <= 5 ? "08:00:00" : null, salida: d >= 1 && d <= 5 ? "16:00:00" : null, por_semana: true })),
  mi_ausencia_hoy: () => [{ ausente: false, ahora: false, tipo: null, hasta: null, parcial: false, hora_desde: null, hora_hasta: null, festivo: null }],
  horarios_del_equipo: () => GENTE.map(([id, n, e]) => ({ user_id: id, nombre: n, avatar_url: null, avatar_seed: null, puesto: e, equipo: e, base_entrada: "08:00:00", base_salida: "16:00:00", turno: null, semana: null, confirmado_at: HOY, confirmado_por: "RR. HH." })),
  pausas_del_equipo: () => [],
};

export function prepararAsistenciaFalsa() {
  const sb = supabase as unknown as { rpc: unknown; from: unknown };
  sb.rpc = async (f: string, a: Record<string, string | null> = {}) => ({ data: RESPUESTAS[f] ? RESPUESTAS[f](a) : [], error: null });
  const fromOriginal = (supabase.from as unknown as (t: string) => unknown).bind(supabase);
  sb.from = (t: string) => {
    if (t !== "ausencias_festivos") return fromOriginal(t);
    const datos = [{ id: "f1", fecha: "2026-12-08", nombre: "Inmaculada Concepción" }, { id: "f2", fecha: "2026-12-25", nombre: "Navidad" }];
    const q = { select: () => q, order: async () => ({ data: datos, error: null }) };
    return q;
  };
}

const USUARIO = { id: "a3" } as User;

export function BancoAsistencia({ cual, ruta }: { cual: "asistencia" | "mis-dias"; ruta: string }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false } } });
  return (
    <AuthContext.Provider value={{ user: USUARIO, session: null, loading: false, signOut: async () => {} }}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[ruta]}>
          <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
            {cual === "asistencia" ? <Asistencia /> : <MisDias />}
          </div>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

// El menú lateral antes y después (el real depende de sesión, presencia y
// contadores; aquí van las mismas filas que arma DashboardSidebar).
function Menu({ titulo, filas, rrhh }: { titulo: string; filas: Array<[typeof Users, string, boolean?]>; rrhh: string[] }) {
  return (
    <div className="flex w-[17rem] shrink-0 flex-col gap-2">
      <p className="px-1 text-xs font-semibold text-muted-foreground">{titulo}</p>
      <div className="vidrio flex flex-col p-3">
        <p className="px-2 pb-3 pt-1 font-display text-xl font-bold"><span className="text-[#bed161]">M</span>aven</p>
        <nav className="flex flex-col gap-0.5">
          {filas.map(([I, n, nuevo]) => (
            <span key={n} className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm ${nuevo ? "bg-primary/15 text-foreground ring-1 ring-primary/30" : "text-foreground/80"}`}>
              <I className="h-4 w-4 text-muted-foreground" />{n}
            </span>
          ))}
          <span className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-foreground/80"><MoreHorizontal className="h-4 w-4 text-muted-foreground" />Más</span>
        </nav>
        <p className="mt-3 px-2 text-[11px] font-semibold text-muted-foreground">RR. HH. · Gestión laboral · Control de tiempo</p>
        <nav className="mt-1 flex flex-col gap-0.5">
          {rrhh.map((n) => <span key={n} className="flex items-center gap-2.5 rounded-lg px-2 py-1 text-xs text-foreground/70"><Clock className="h-3.5 w-3.5 text-muted-foreground" />{n}</span>)}
        </nav>
      </div>
    </div>
  );
}

export function BancoMenuAsistencia() {
  const { t } = useLanguage();
  const antes: Array<[typeof Users, string, boolean?]> = [[LayoutDashboard, t("nav.dashboard")], [Users2, t("nav.cowork")], [MessageCircle, t("nav.messenger")], [Mail, t("nav.mail")], [Video, t("nav.meet")]];
  const despues: Array<[typeof Users, string, boolean?]> = [[LayoutDashboard, t("nav.dashboard")], [Users2, t("nav.cowork")], [CalendarCheck2, t("aus.nav.equipo"), true], [CalendarHeart, t("aus.nav.mias"), true], [MessageCircle, t("nav.messenger")], [Mail, t("nav.mail")], [Video, t("nav.meet")]];
  return (
    <div className="flex min-h-dvh flex-wrap items-start gap-8 bg-background p-8 text-foreground">
      <Menu titulo="ANTES" filas={antes} rrhh={[t("nav.hr.attendance"), t("nav.hr.schedules"), t("nav.hr.staffSchedule"), t("nav.hr.chatterSchedules"), t("nav.hr.overtime"), t("nav.hr.hoursBank"), t("nav.hr.vacations"), t("nav.hr.leave")]} />
      <Menu titulo="DESPUÉS" filas={despues} rrhh={[t("nav.hr.overtime"), t("nav.hr.hoursBank")]} />
    </div>
  );
}

export const LUNES = lunesDe(HOY);
