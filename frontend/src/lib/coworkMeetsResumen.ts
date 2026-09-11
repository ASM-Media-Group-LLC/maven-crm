// Meets grupales de Cowork para el diálogo de Pausas y meets: agrega las filas
// (una por persona y meet) que devuelve la RPC `cowork_meets_resumen`. Puro,
// para probarlo.
export interface FilaMeetPersona {
  meet_id: string;
  session_id: string;
  session_name: string | null;
  created_by: string;
  creador: string | null;
  meet_started_at: string;
  meet_ended_at: string | null;
  meet_seconds: number;
  user_id: string;
  nombre: string | null;
  room_id: string | null;
  room_name: string | null;
  joined_at: string;
  left_at: string | null;
  is_open: boolean;
  seconds: number;
}

export interface PersonaMeets {
  userId: string;
  nombre: string;
  meets: number;
  segMeet: number;
}

export interface MeetResumen {
  meetId: string;
  sesion: string;
  creador: string;
  startedAt: string;
  endedAt: string | null;
  abierto: boolean;
  /** Duración del meet en sí (hasta ahora si sigue abierto). */
  segundos: number;
  gente: Array<{ userId: string; nombre: string; sala: string | null; segundos: number; abierto: boolean }>;
}

const nombreDe = (n: string | null | undefined) => n?.trim() || "Sin nombre";

/** Por persona: cuántos meets y cuánto tiempo, de más a menos. */
export function agregarMeetsPorPersona(filas: FilaMeetPersona[]): PersonaMeets[] {
  const m = new Map<string, PersonaMeets>();
  for (const f of filas) {
    const p = m.get(f.user_id) ?? { userId: f.user_id, nombre: nombreDe(f.nombre), meets: 0, segMeet: 0 };
    p.meets += 1;
    p.segMeet += f.seconds;
    m.set(f.user_id, p);
  }
  return [...m.values()].sort((a, b) => b.segMeet - a.segMeet || a.nombre.localeCompare(b.nombre, "es"));
}

/** Por meet, del más reciente al más viejo, con su gente por nombre. */
export function agruparMeets(filas: FilaMeetPersona[]): MeetResumen[] {
  const m = new Map<string, MeetResumen>();
  for (const f of filas) {
    const meet = m.get(f.meet_id) ?? {
      meetId: f.meet_id,
      sesion: f.session_name?.trim() || "Sesión",
      creador: nombreDe(f.creador),
      startedAt: f.meet_started_at,
      endedAt: f.meet_ended_at,
      abierto: !f.meet_ended_at,
      segundos: f.meet_seconds,
      gente: [],
    };
    meet.gente.push({ userId: f.user_id, nombre: nombreDe(f.nombre), sala: f.room_name, segundos: f.seconds, abierto: f.is_open });
    m.set(f.meet_id, meet);
  }
  for (const meet of m.values()) meet.gente.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return [...m.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function totalesMeets(filas: FilaMeetPersona[]) {
  return {
    meets: new Set(filas.map((f) => f.meet_id)).size,
    personas: new Set(filas.map((f) => f.user_id)).size,
    segMeet: filas.reduce((s, f) => s + f.seconds, 0),
  };
}

/** "10 sept · 7:52 p. m." — la fecha corta de un meet en la lista. */
export function fechaHoraCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  const hora = d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
  return `${dia} · ${hora}`;
}
