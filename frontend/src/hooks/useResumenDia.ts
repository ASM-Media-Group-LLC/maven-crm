import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calcularNota, type Nota } from "@/lib/notaEmpleado";

// RESUMEN DEL DÍA de Argos (Álvaro, 02/11): quién va mejor o peor HOY, con la
// PELÍCULA del día (no solo el número final). Por persona: su nota del día
// (pantalla 30 / cámara 30 / atención 30 / horas 10), las barras de cada factor,
// y sus BAJONES (momentos malos del día: sin pantalla, cámara, ocio) con hora y
// duración — para distinguir «tuvo un bache puntual» de «va mal todo el día».
// Lo ve el dueño (lo fuerza la RLS de las fuentes).

const META_DIA = 8;

type RpcDb = { rpc: (f: string, a: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export interface BajonDia {
  tipo: string;          // sin_pantalla | camara_apagada | fuera_de_lugar | ...
  desdeISO: string;      // cuándo empezó
  minutos: number;       // cuánto duró (hasta ahora si sigue abierto)
  abierto: boolean;      // sigue pasando
  detalle: string | null;
}

export interface PersonaResumen {
  userId: string;
  nombre: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  nota: Nota;
  pantallaPct: number | null; // 0–100
  camaraPct: number | null;
  atencionPct: number | null;
  /** Cuántas pantallas juzgó la IA hoy (el "tamaño de muestra" de atención). */
  juzgadas: number;
  horas: number;
  bajones: BajonDia[];
  /** Estuvo activo en Maven ese día (capturas, cámara, pantalla, atención, horas
   *  o alguna alerta) — no solo el reloj de Cowork. Para distinguir «no apareció». */
  activo: boolean;
  /** Su rol se CALIFICA en cámara/pantalla (config roles_calificados). Si no, esos
   *  factores no cuentan para su nota (ej. supervisores, finanzas). */
  calificado: boolean;
}

interface FilaTiempo { user_id: string; seg_activo: number | string; }
interface FilaMomentos { user_id: string; mom_camara: number | string; mom_pantalla: number | string; faltas_camara: number | string; juzgadas: number | string; juzgadas_ok: number | string; mom_cara_ok: number | string; mom_cara_medida: number | string; }
interface FilaAlerta { user_id: string; tipo: string; detalle: string | null; abierta_at: string; cerrada_at: string | null; }

export function useResumenDia(dia: string) {
  const q = useQuery({
    queryKey: ["resumen-dia", dia],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<PersonaResumen[]> => {
      const db = supabase as unknown as RpcDb;
      const inicioISO = `${dia}T00:00:00-05:00`;
      const finISO = `${dia}T23:59:59-05:00`;

      const [tiempoRes, momentosRes, alertasRes] = await Promise.all([
        db.rpc("cowork_tiempo_diario", { _desde: dia, _hasta: dia, _user_id: null, _limit: 500, _offset: 0 }),
        db.rpc("argos_momentos_dia", { _dia: dia }),
        sinTipar.from("argos_alertas").select("user_id, tipo, detalle, abierta_at, cerrada_at").gte("abierta_at", inicioISO).lte("abierta_at", finISO).limit(5000),
      ]);
      if (tiempoRes.error) throw new Error(tiempoRes.error.message);
      if (momentosRes.error) throw new Error(momentosRes.error.message);

      // Horas conectadas (reloj de Cowork) por persona, solo para el factor horas.
      const horasPor = new Map<string, number>();
      for (const r of (tiempoRes.data ?? []) as FilaTiempo[]) horasPor.set(r.user_id, Number(r.seg_activo) / 3600);

      // Momentos por persona: de TODO el tiempo conectada (capturas de cámara),
      // cuántos compartió pantalla y cuántos juzgó la IA en lo suyo. Pantalla% y
      // cámara% salen de aquí, no del ratito en Cowork (Alvaro, 02/11).
      const momPor = new Map<string, { camara: number; pantalla: number; caraOk: number; caraMedida: number }>();
      const atPor = new Map<string, { ok: number; n: number }>();
      for (const m of (momentosRes.data ?? []) as FilaMomentos[]) {
        momPor.set(m.user_id, { camara: Number(m.mom_camara), pantalla: Number(m.mom_pantalla), caraOk: Number(m.mom_cara_ok), caraMedida: Number(m.mom_cara_medida) });
        atPor.set(m.user_id, { ok: Number(m.juzgadas_ok), n: Number(m.juzgadas) });
      }

      // Bajones por persona (momentos malos del día).
      const ahora = Date.now();
      const bajonesPor = new Map<string, BajonDia[]>();
      for (const a of (alertasRes.data ?? []) as FilaAlerta[]) {
        const fin = a.cerrada_at ? Date.parse(a.cerrada_at) : ahora;
        const minutos = Math.max(1, Math.round((fin - Date.parse(a.abierta_at)) / 60000));
        const arr = bajonesPor.get(a.user_id) ?? [];
        arr.push({ tipo: a.tipo, desdeISO: a.abierta_at, minutos, abierto: !a.cerrada_at, detalle: a.detalle });
        bajonesPor.set(a.user_id, arr);
      }

      // Roster del día: quien tuvo momentos (capturas), horas o alertas.
      const ids = new Set<string>([...momPor.keys(), ...horasPor.keys(), ...bajonesPor.keys()]);
      if (ids.size === 0) return [];

      const [perfRes, rolesRes, cfgRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url, avatar_seed").in("id", [...ids]),
        sinTipar.from("user_roles").select("user_id, role").in("user_id", [...ids]),
        sinTipar.from("monitor_config").select("roles_calificados").eq("id", 1).maybeSingle(),
      ]);
      const perfilPor = new Map(((perfRes.data ?? []) as Array<{ id: string; full_name: string | null; avatar_url: string | null; avatar_seed: string | null }>).map((p) => [p.id, p]));

      // Qué roles tiene cada persona (puede tener varios) y qué roles SE CALIFICAN
      // en cámara/pantalla (config del dueño). Sin config = se califica a todos
      // (comportamiento viejo); con config, solo esos roles cuentan en esos factores.
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

      const personas: PersonaResumen[] = [...ids].map((id) => {
        const m = momPor.get(id);
        const at = atPor.get(id);
        const calificado = esCalificado(id);
        // Pantalla% = de todos los momentos conectada (cámara), cuántos compartió.
        const pantallaRaw = m && m.camara > 0 ? Math.min(1, m.pantalla / m.camara) : undefined;
        // Cámara% REAL: momentos con cara ÷ momentos de TRABAJO (los que compartió
        // pantalla, o los que midió cámara: el que sea mayor). Así la cámara APAGADA
        // mientras trabajaba SÍ baja la nota (decisión de Alvaro, 05/11). Sin ningún
        // momento (ni pantalla ni cámara) = sin dato, no cuenta.
        const denomCam = m ? Math.max(m.pantalla, m.caraMedida) : 0;
        const camaraRaw = denomCam > 0 ? Math.min(1, m!.caraOk / denomCam) : undefined;
        // Si el rol NO se califica en cámara/pantalla (supervisor, finanzas…), esos
        // factores quedan en N/A: no cuentan para la nota ni lo tiran a "Mal" por 0%.
        const pantallaPct = calificado ? pantallaRaw : undefined;
        const camaraPct = calificado ? camaraRaw : undefined;
        const atencionPct = at && at.n > 0 ? at.ok / at.n : undefined;
        const horas = horasPor.get(id) ?? 0;
        // Activo = estuvo en Maven ese día por CUALQUIER señal, no solo Cowork.
        const activo = horas > 0 || (!!m && (m.camara > 0 || m.pantalla > 0)) || (!!at && at.n > 0) || (bajonesPor.get(id)?.length ?? 0) > 0;
        const nota = calcularNota({ pantallaPct, camaraPct, atencionPct, horasHechas: horas, horasMeta: META_DIA });
        const perfil = perfilPor.get(id);
        const bajones = (bajonesPor.get(id) ?? []).sort((a, b) => b.minutos - a.minutos).slice(0, 8);
        return {
          userId: id,
          nombre: perfil?.full_name?.trim() || "",
          avatarUrl: perfil?.avatar_url ?? null,
          avatarSeed: perfil?.avatar_seed ?? null,
          nota,
          pantallaPct: pantallaPct == null ? null : Math.round(pantallaPct * 100),
          camaraPct: camaraPct == null ? null : Math.round(camaraPct * 100),
          atencionPct: atencionPct == null ? null : Math.round(atencionPct * 100),
          juzgadas: at?.n ?? 0,
          horas,
          bajones,
          activo,
          calificado,
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

  return { personas: q.data ?? [], cargando: q.isLoading, error: (q.error as Error | null) ?? null, refrescar: () => q.refetch() };
}
