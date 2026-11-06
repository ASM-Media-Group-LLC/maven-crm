import { supabase } from "@/integrations/supabase/client";

// Horario resuelto por persona (Alvaro, 05/11): de él salen la JORNADA (horas del
// turno) y el cupo EXENTO (baño + comida, que NO cuenta en contra) que usa la nota
// en el denominador de pantalla/cámara. Se resuelve: override de la persona →
// horario de su rol → default (8 h, baño 10 + comida 30). Lo cargan los hooks de
// la nota, igual que la exoneración.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export interface HorarioResuelto {
  jornadaHoras: number; // horas del turno (salida − entrada), default 8
  exentoSeg: number;    // baño + comida en segundos (no cuenta en contra), default 40 min
  entrada: string | null; // HH:MM:SS del horario asignado (persona o rol); null si no hay
  salida: string | null;
  toleranciaMin: number;  // minutos de gracia antes de contar "tarde"; default 5
}

const DEFAULT: HorarioResuelto = { jornadaHoras: 8, exentoSeg: 40 * 60, entrada: null, salida: null, toleranciaMin: 5 };

interface RolSched { name: string; hora_entrada: string | null; hora_salida: string | null; comida_min: number | null; bano_min: number | null; tolerancia_min: number | null }
interface PerfilSched { id: string; hora_entrada: string | null; hora_salida: string | null; comida_min: number | null; bano_min: number | null; turno_id: string | null }
interface RolTurno { id: string; role: string; nombre: string; hora_entrada: string; hora_salida: string }

/** Minutos desde medianoche de un "HH:MM[:SS]". null si no hay. */
function minutosDeHora(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

/** Horas de jornada entre entrada y salida (maneja turnos que cruzan medianoche). */
function horasEntre(entrada: string | null, salida: string | null): number | null {
  const e = minutosDeHora(entrada), s = minutosDeHora(salida);
  if (e == null || s == null) return null;
  let diff = s - e;
  if (diff <= 0) diff += 24 * 60; // cruza medianoche
  return diff / 60;
}

/** Carga el horario resuelto de cada persona (por id). */
export async function cargarHorarios(ids: string[]): Promise<Map<string, HorarioResuelto>> {
  const out = new Map<string, HorarioResuelto>();
  if (ids.length === 0) return out;

  const [perfRes, rolesRes, rolSchedRes, turnosRes] = await Promise.all([
    sinTipar.from("profiles").select("id, hora_entrada, hora_salida, comida_min, bano_min, turno_id").in("id", ids),
    sinTipar.from("user_roles").select("user_id, role").in("user_id", ids),
    sinTipar.from("roles_config").select("name, hora_entrada, hora_salida, comida_min, bano_min, tolerancia_min").eq("is_active", true),
    sinTipar.from("rol_turnos").select("id, role, nombre, hora_entrada, hora_salida"),
  ]);

  const perfilPor = new Map<string, PerfilSched>(((perfRes.data ?? []) as PerfilSched[]).map((p) => [p.id, p]));
  const schedPorRol = new Map<string, RolSched>(((rolSchedRes.data ?? []) as RolSched[]).map((r) => [r.name, r]));
  const turnoPorId = new Map<string, RolTurno>(((turnosRes.data ?? []) as RolTurno[]).map((t) => [t.id, t]));
  const rolesPor = new Map<string, string[]>();
  for (const r of (rolesRes.data ?? []) as Array<{ user_id: string; role: string }>) {
    const a = rolesPor.get(r.user_id) ?? [];
    a.push(r.role);
    rolesPor.set(r.user_id, a);
  }

  for (const id of ids) {
    const perfil = perfilPor.get(id);
    const roles = (rolesPor.get(id) ?? []).map((n) => schedPorRol.get(n)).filter((x): x is RolSched => !!x);
    // Rol con horario puesto (el primero que tenga entrada): default del rol si
    // la persona no tiene turno asignado.
    const rolConHora = roles.find((r) => r.hora_entrada);
    // Orden de resolución (Alvaro 06/11): override de persona → turno asignado →
    // default del rol. Así los Chatters con turno AM/PM/Madrugada caen al suyo.
    const turnoAsignado = perfil?.turno_id ? turnoPorId.get(perfil.turno_id) : null;
    const entrada = perfil?.hora_entrada ?? turnoAsignado?.hora_entrada ?? rolConHora?.hora_entrada ?? null;
    const salida = perfil?.hora_salida ?? turnoAsignado?.hora_salida ?? rolConHora?.hora_salida ?? null;
    const jornadaHoras = horasEntre(entrada, salida) ?? DEFAULT.jornadaHoras;
    // Baño/comida: override de persona; si no, el MAYOR cupo entre sus roles; si
    // no tiene rol con horario, el default (comida 30 / baño 10). No se mete el
    // default como piso, para respetar un rol configurado con menos.
    const comidasRol = roles.map((r) => r.comida_min).filter((n): n is number => n != null);
    const banosRol = roles.map((r) => r.bano_min).filter((n): n is number => n != null);
    const comida = perfil?.comida_min ?? (comidasRol.length ? Math.max(...comidasRol) : 30);
    const bano = perfil?.bano_min ?? (banosRol.length ? Math.max(...banosRol) : 10);
    // Tolerancia de tardanza: el MAYOR entre sus roles; si no tiene, default 5 min.
    const tolsRol = roles.map((r) => r.tolerancia_min).filter((n): n is number => n != null);
    const toleranciaMin = tolsRol.length ? Math.max(...tolsRol) : 5;
    out.set(id, { jornadaHoras, exentoSeg: (Math.max(0, comida) + Math.max(0, bano)) * 60, entrada, salida, toleranciaMin });
  }
  return out;
}

export function horarioDe(mapa: Map<string, HorarioResuelto>, id: string): HorarioResuelto {
  return mapa.get(id) ?? DEFAULT;
}
