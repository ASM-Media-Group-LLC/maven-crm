import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calcularNota, fraccionJornada, type Nota } from "@/lib/notaEmpleado";
import { cargarExoneracion, esExento } from "@/lib/exoneracionCamara";
import { cargarHorarios, horarioDe } from "@/lib/horarioEmpleado";
import { a12 } from "@/lib/horaBogota";

// La gente de un TURNO del día (Alvaro, 04/11; nota v2 05/11): para el drill-down
// del Historial. Por persona que trabajó en ese rango de horas: su nota del turno
// y sus factores. Pantalla/cámara se miden en SEGUNDOS sobre el turno completo
// (no un ratio) con el RPC argos_dia_personas, así las horas quedan metidas y medio
// turno ≈ 50. Respeta roles_calificados (a quién se le cuenta cámara/pantalla).

export interface PersonaTurno {
  userId: string;
  nombre: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  equipo: string;
  nota: Nota;
  pantallaPct: number | null;
  camaraPct: number | null;
  atencionPct: number | null;
  /** Horas de TRABAJO dentro del turno (activo+sin_pantalla+sin_cámara+fuera_cámara). */
  horasTurno: number;
  /** Primera hora que se conectó dentro del rango del turno, HH:MM; null si no hay datos. */
  entroHHMM: string | null;
  /** Última hora detectada dentro del rango del turno (primer_ingreso del último segmento), HH:MM. */
  salioHHMM: string | null;
  /** Minutos de tardanza respecto al horario asignado, pasada la tolerancia. null si
   *  no tiene horario asignado o no se registró ingreso. Positivo = llegó tarde. */
  tardeMin: number | null;
  /** Turno al que la persona está ASIGNADA por su horario (no por cuándo estuvo
   *  activa). "madrugada" 0-8, "am" 8-16, "pm" 16-24; null si no tiene horario. */
  turnoAsignado: "madrugada" | "am" | "pm" | null;
}

/** Turno asignado a partir de la hora de entrada (HH:MM). */
export function turnoDeEntrada(entrada: string | null): "madrugada" | "am" | "pm" | null {
  if (!entrada) return null;
  const h = Number(entrada.split(":")[0]);
  if (Number.isNaN(h)) return null;
  if (h < 8) return "madrugada";
  if (h < 16) return "am";
  return "pm";
}

// El EQUIPO de una persona a partir de su puesto (los UUIDs del campo cowork.equipo
// son salas, no equipos). Se agrupa en los equipos reales de la agencia.
const EQUIPO_POR_ROL: Record<string, string> = {
  "Chatter": "Chatters", "Chatter Supervisor": "Chatters",
  "PR": "PR", "Warming": "Warming",
  "Coordinador": "Editores", "Coordinador Supervisor": "Editores",
  "Finanzas": "Finanzas", "Closer": "Closers",
  "Operations Sales": "Operaciones", "admin": "Admin",
  "HHRR": "RRHH", "RRHH": "RRHH",
};
export function equipoDeRoles(roles: Set<string> | undefined): string {
  if (roles) for (const r of roles) { const e = EQUIPO_POR_ROL[r]; if (e) return e; }
  return "Otros";
}

interface FilaDia {
  user_id: string;
  seg_activo: number | string; seg_sin_pantalla: number | string;
  seg_sin_camara: number | string; seg_fuera_camara: number | string;
  juzgadas: number | string; juzgadas_ok: number | string;
}

type RpcDb = { rpc: (f: string, a: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export function useTurnoPersonas(dia: string, hDesde: number, hHasta: number, habilitado: boolean) {
  const q = useQuery({
    enabled: habilitado,
    queryKey: ["argos-turno-personas", dia, hDesde, hHasta],
    staleTime: 60_000,
    queryFn: async (): Promise<PersonaTurno[]> => {
      const db = supabase as unknown as RpcDb;
      const { data, error } = await db.rpc("argos_dia_personas", { _dia: dia, _h_desde: hDesde, _h_hasta: hHasta });
      if (error) throw new Error(error.message);
      const filas = (data ?? []) as FilaDia[];
      if (filas.length === 0) return [];
      const horasJornada = Math.max(1, hHasta - hDesde);

      const ids = [...new Set(filas.map((f) => f.user_id))];
      // Rango del turno en Bogotá (para primer_ingreso / ultima_salida).
      const pad = (n: number) => String(n).padStart(2, "0");
      const inicioISO = `${dia}T${pad(hDesde)}:00:00-05:00`;
      const finISO = `${dia}T${pad(Math.min(hHasta, 23))}:${hHasta >= 24 ? "59" : "00"}:00-05:00`;
      const [perfRes, rolesRes, cfgRes, exo, horarios, segRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url, avatar_seed").in("id", ids),
        sinTipar.from("user_roles").select("user_id, role").in("user_id", ids),
        sinTipar.from("monitor_config").select("roles_calificados").eq("id", 1).maybeSingle(),
        cargarExoneracion(ids),
        cargarHorarios(ids, dia),
        // Para entró/salió dentro del turno: primer/último segmento de trabajo
        // (no cuenta pausa ni sin_conexion) en el rango.
        sinTipar.from("cowork_tiempo_segmentos")
          .select("user_id, started_at, seconds, estado")
          .in("user_id", ids)
          .in("estado", ["activo", "sin_pantalla", "sin_camara", "fuera_de_camara"])
          .gte("started_at", inicioISO)
          .lt("started_at", finISO)
          .order("started_at", { ascending: true }),
      ]);
      // Primer / último minuto trabajado por persona dentro del turno.
      const horariosPorPers = new Map<string, { primero: Date; ultimo: Date }>();
      for (const s of (segRes.data ?? []) as Array<{ user_id: string; started_at: string; seconds: number }>) {
        const t0 = new Date(s.started_at);
        const t1 = new Date(t0.getTime() + Number(s.seconds) * 1000);
        const prev = horariosPorPers.get(s.user_id);
        if (!prev) horariosPorPers.set(s.user_id, { primero: t0, ultimo: t1 });
        else { if (t0 < prev.primero) prev.primero = t0; if (t1 > prev.ultimo) prev.ultimo = t1; }
      }
      const hhmmBogota = (d: Date): string =>
        d.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
      const perfilPor = new Map(((perfRes.data ?? []) as Array<{ id: string; full_name: string | null; avatar_url: string | null; avatar_seed: string | null }>).map((p) => [p.id, p]));
      const rolesPor = new Map<string, Set<string>>();
      for (const r of (rolesRes.data ?? []) as Array<{ user_id: string; role: string }>) {
        const s = rolesPor.get(r.user_id) ?? new Set<string>();
        s.add(r.role);
        rolesPor.set(r.user_id, s);
      }
      const rolesCalif: string[] | null = (cfgRes.data as { roles_calificados: string[] | null } | null)?.roles_calificados ?? null;
      const esCalificado = (id: string): boolean => {
        if (!rolesCalif || rolesCalif.length === 0) return true;
        const roles = rolesPor.get(id);
        if (!roles) return false;
        for (const r of roles) if (rolesCalif.includes(r)) return true;
        return false;
      };

      const personas: PersonaTurno[] = filas.map((f) => {
        // Segundos sobre el turno: pantalla compartida = activo + sin_cámara +
        // fuera_cámara; cámara bien = activo + sin_pantalla. El denominador es la
        // jornada menos la pausa libre (dentro de fraccionJornada).
        const segPantalla = Number(f.seg_activo) + Number(f.seg_sin_camara) + Number(f.seg_fuera_camara);
        const segCamara = Number(f.seg_activo) + Number(f.seg_sin_pantalla);
        const juz = Number(f.juzgadas), juzOk = Number(f.juzgadas_ok);
        // Calificado en cámara/pantalla si su rol se califica Y no está exonerado.
        const calificado = esCalificado(f.user_id) && !esExento(exo, f.user_id, rolesPor.get(f.user_id));
        // Denominador: el turno menos el baño+comida de esa persona (no cuenta en contra).
        const exentoSeg = horarioDe(horarios, f.user_id).exentoSeg;
        const pantallaPct = calificado ? fraccionJornada(segPantalla, horasJornada, exentoSeg) : undefined;
        const camaraPct = calificado ? fraccionJornada(segCamara, horasJornada, exentoSeg) : undefined;
        const atencionPct = juz > 0 ? juzOk / juz : undefined;
        const nota = calcularNota({ pantallaPct, camaraPct, atencionPct });
        const perfil = perfilPor.get(f.user_id);
        // Horas de trabajo dentro del turno + entrada/salida.
        const segTrabajoTurno = Number(f.seg_activo) + Number(f.seg_sin_pantalla) + Number(f.seg_sin_camara) + Number(f.seg_fuera_camara);
        const h = horariosPorPers.get(f.user_id);
        // Minutos tarde (si tiene horario asignado y se pasó la tolerancia).
        // Comparación SIEMPRE en hora Bogotá, no en la zona del navegador.
        const horPers = horarioDe(horarios, f.user_id);
        let tardeMin: number | null = null;
        if (horPers.entrada && h) {
          const [eh, em] = horPers.entrada.split(":").map(Number);
          const asignadoMin = eh * 60 + (em || 0);
          const [rh, rm] = hhmmBogota(h.primero).split(":").map(Number);
          const realMin = rh * 60 + rm;
          const dif = realMin - asignadoMin;
          tardeMin = dif > horPers.toleranciaMin ? dif : null;
        }
        return {
          userId: f.user_id,
          nombre: perfil?.full_name?.trim() || "",
          avatarUrl: perfil?.avatar_url ?? null,
          avatarSeed: perfil?.avatar_seed ?? null,
          equipo: equipoDeRoles(rolesPor.get(f.user_id)),
          nota,
          pantallaPct: pantallaPct == null ? null : Math.round(pantallaPct * 100),
          camaraPct: camaraPct == null ? null : Math.round(camaraPct * 100),
          atencionPct: atencionPct == null ? null : Math.round(atencionPct * 100),
          horasTurno: segTrabajoTurno / 3600,
          entroHHMM: h ? a12(hhmmBogota(h.primero)) : null,
          salioHHMM: h ? a12(hhmmBogota(h.ultimo)) : null,
          tardeMin,
          turnoAsignado: turnoDeEntrada(horPers.entrada),
        };
      });

      // De PEOR a mejor (los sin nota, al final).
      personas.sort((a, b) => {
        if (a.nota.valor == null) return 1;
        if (b.nota.valor == null) return -1;
        return a.nota.valor - b.nota.valor;
      });
      return personas;
    },
  });

  return { personas: q.data ?? [], cargando: q.isLoading, error: (q.error as Error | null) ?? null };
}
