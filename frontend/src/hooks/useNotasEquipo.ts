import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { calcularNota, type Nota } from "@/lib/notaEmpleado";

// Las NOTAS del equipo para el Monitor IA (Argos). Arma, por persona y para el
// período (Hoy / Semana), las cuatro señales de la nota a partir de datos reales
// que YA existen:
//   · horas  → RPC equipo_tiempo_cowork (seg_activo)
//   · faltas → tabla monitor_eventos (tipos serios, sin descartadas)
//   · pausas → RPC cowork_pausas_resumen (minutos por encima del límite)
//   · puntualidad → pendiente (horarios cubren a poca gente); por ahora va "sin
//                   dato" y la nota reparte su peso. Se conecta después.
// Permiso: los RPC/tablas ya restringen a supervisor+ (ven al equipo) y admin (ve
// todo); cada quien, solo lo suyo. No hace falta nada extra aquí.

export type PeriodoNota = "hoy" | "semana";

export interface NotaDePersona {
  userId: string;
  nombre: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  horas: number;
  /** Meta de horas del período (6 h/día hábil; en Semana escala con los días ya pasados). */
  metaHoras: number;
  faltas: number;
  /** Minutos de pausa por encima del límite; null si no hubo dato de pausas. */
  minutosPausaDeMas: number | null;
  nota: Nota;
}

const SERIAS = ["camara_apagada", "se_fue", "celular", "distraido", "no_mira"];

/** Fecha "YYYY-MM-DD" en el día contable de la empresa (America/Bogota). */
function fechaBogota(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

/** Rango [desde, hasta] del período. Semana = lunes de esta semana → hoy. */
function rangoDe(periodo: PeriodoNota): { desde: string; hasta: string } {
  const hoy = fechaBogota();
  if (periodo === "hoy") return { desde: hoy, hasta: hoy };
  // Lunes de la semana de "hoy" (en Bogota). Partimos de la fecha ISO ya en Bogota.
  const [y, m, d] = hoy.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const dow = base.getUTCDay(); // 0=dom..6=sab
  const haciaLunes = (dow + 6) % 7; // días a restar para llegar al lunes
  base.setUTCDate(base.getUTCDate() - haciaLunes);
  const desde = base.toISOString().slice(0, 10);
  return { desde, hasta: hoy };
}

/** Meta de horas del período: 6 h por día hábil. En Semana escala con los días
 *  hábiles ya transcurridos (lun→hoy), para que la nota sea justa a media semana. */
function metaDelPeriodo(periodo: PeriodoNota, hasta: string): number {
  if (periodo === "hoy") return 6;
  const [y, m, d] = hasta.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=dom..6=sab
  const habiles = dow === 0 ? 5 : Math.min(dow, 5); // lun=1..vie=5; sáb/dom = 5 (semana completa)
  return 6 * Math.max(1, habiles);
}

type RpcDb = {
  rpc: (f: string, a: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
};

export function useNotasEquipo(periodo: PeriodoNota) {
  const { user } = useAuth();
  const { desde, hasta } = rangoDe(periodo);

  const q = useQuery({
    enabled: !!user?.id,
    queryKey: ["notas-equipo", periodo, desde, hasta],
    staleTime: 60_000,
    queryFn: async (): Promise<NotaDePersona[]> => {
      const db = supabase as unknown as RpcDb;
      const inicio = `${desde}T00:00:00-05:00`;

      const [horasRes, faltasRes, pausasRes] = await Promise.all([
        db.rpc("equipo_tiempo_cowork", { _desde: desde, _hasta: hasta }),
        supabase
          .from("monitor_eventos")
          .select("user_id")
          .in("tipo", SERIAS)
          .neq("estado", "descartado")
          .gte("created_at", inicio),
        db.rpc("cowork_pausas_resumen", {
          _desde: desde,
          _hasta: hasta,
          _session_id: null,
          _user_id: null,
          _limit: 2000,
          _offset: 0,
        }),
      ]);

      if (horasRes.error) throw new Error(horasRes.error.message);
      if (faltasRes.error) throw new Error(faltasRes.error.message);
      // Las pausas no son críticas: si fallan, la nota reparte su peso.

      // --- horas por persona ---
      const horasPor = new Map<string, number>();
      for (const r of (horasRes.data ?? []) as Array<{ user_id: string; seg_activo: number | string }>) {
        horasPor.set(r.user_id, Number(r.seg_activo) / 3600);
      }

      // --- faltas serias por persona ---
      const faltasPor = new Map<string, number>();
      for (const r of (faltasRes.data ?? []) as Array<{ user_id: string }>) {
        faltasPor.set(r.user_id, (faltasPor.get(r.user_id) ?? 0) + 1);
      }

      // --- minutos de pausa por encima del límite, por persona ---
      const pausaMinPor = new Map<string, number>();
      for (const r of (pausasRes.data ?? []) as Array<{
        user_id: string;
        seg_bano?: number | null; bano_limite_seg?: number | null; bano_excedido?: boolean | null;
        seg_break_de_mas?: number | null; seg_almuerzo_de_mas?: number | null;
      }>) {
        const banoDeMas = r.bano_excedido ? Math.max(0, Number(r.seg_bano ?? 0) - Number(r.bano_limite_seg ?? 0)) : 0;
        const segDeMas = banoDeMas + Number(r.seg_break_de_mas ?? 0) + Number(r.seg_almuerzo_de_mas ?? 0);
        pausaMinPor.set(r.user_id, (pausaMinPor.get(r.user_id) ?? 0) + segDeMas / 60);
      }

      // --- roster: quien tuvo reloj, falta o pausa en el período ---
      const ids = new Set<string>([...horasPor.keys(), ...faltasPor.keys(), ...pausaMinPor.keys()]);
      ids.delete(user!.id); // el que mira no se nota a sí mismo en la lista
      if (ids.size === 0) return [];

      const { data: perfiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, avatar_seed")
        .in("id", [...ids]);
      const perfilPor = new Map(
        (perfiles ?? []).map((p) => [p.id as string, p as { full_name: string | null; avatar_url: string | null; avatar_seed: string | null }]),
      );

      const metaHoras = metaDelPeriodo(periodo, hasta);

      const filas: NotaDePersona[] = [...ids].map((id) => {
        const horas = horasPor.get(id) ?? 0;
        const faltas = faltasPor.get(id) ?? 0;
        const pausaDeMas = pausaMinPor.has(id) ? pausaMinPor.get(id)! : undefined;
        const nota = calcularNota({
          horasHechas: horas,
          horasMeta: metaHoras,
          faltasSerias: faltas,
          minutosPausaDeMas: pausaDeMas,
          // puntualidad: pendiente de horarios — se reparte el peso.
        });
        const p = perfilPor.get(id);
        return {
          userId: id,
          nombre: p?.full_name?.trim() || "", // la UI pone t("hr.noName") si viene vacío
          avatarUrl: p?.avatar_url ?? null,
          avatarSeed: p?.avatar_seed ?? null,
          horas,
          metaHoras,
          faltas,
          minutosPausaDeMas: pausaDeMas ?? null,
          nota,
        };
      });

      // Peor primero (nota más baja arriba), para saber al instante quién va mal.
      filas.sort((a, b) => (a.nota.valor ?? 999) - (b.nota.valor ?? 999) || a.nombre.localeCompare(b.nombre, "es"));
      return filas;
    },
  });

  return { notas: q.data ?? [], cargando: q.isLoading, error: q.error, periodo, desde, hasta };
}
