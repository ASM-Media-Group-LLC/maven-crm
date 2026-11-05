import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calcularNota, fraccionJornada, type Nota } from "@/lib/notaEmpleado";

// RESUMEN DEL DÍA de Argos (Álvaro, 02/11; nota v2 05/11): quién va mejor o peor
// HOY, con la PELÍCULA del día (no solo el número final). Por persona: su nota del
// día (pantalla 45 / cámara 35 / distracción 20), las barras de cada factor, y sus
// BAJONES (momentos malos del día) con hora y duración. Pantalla/cámara se miden en
// SEGUNDOS sobre la jornada de 8 h (RPC argos_dia_personas), así las horas quedan
// metidas: medio día ≈ 50. Lo ve el dueño (lo fuerza la RLS de las fuentes).

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

interface FilaDia {
  user_id: string;
  seg_activo: number | string; seg_sin_pantalla: number | string;
  seg_sin_camara: number | string; seg_fuera_camara: number | string;
  juzgadas: number | string; juzgadas_ok: number | string;
}
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

      const [diaRes, alertasRes] = await Promise.all([
        db.rpc("argos_dia_personas", { _dia: dia, _h_desde: 0, _h_hasta: 24 }),
        sinTipar.from("argos_alertas").select("user_id, tipo, detalle, abierta_at, cerrada_at").gte("abierta_at", inicioISO).lte("abierta_at", finISO).limit(5000),
      ]);
      if (diaRes.error) throw new Error(diaRes.error.message);

      // Por persona: segundos en cada estado (sobre la jornada de 8 h) y los
      // pantallazos que la IA juzgó / en lo suyo. Pantalla/cámara y horas salen de
      // aquí (un solo RPC sobre cowork_tiempo_segmentos), ya consistente con el turno.
      const segPor = new Map<string, { pantalla: number; camara: number; horas: number }>();
      const atPor = new Map<string, { ok: number; n: number }>();
      for (const m of (diaRes.data ?? []) as FilaDia[]) {
        const activo = Number(m.seg_activo), sinPant = Number(m.seg_sin_pantalla);
        const sinCam = Number(m.seg_sin_camara), fueraCam = Number(m.seg_fuera_camara);
        const segPantalla = activo + sinCam + fueraCam;      // compartiendo pantalla
        const segCamara = activo + sinPant;                   // cámara/cara bien
        const horas = (activo + sinPant + sinCam + fueraCam) / 3600; // tiempo de trabajo
        segPor.set(m.user_id, { pantalla: segPantalla, camara: segCamara, horas });
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

      // Roster del día: quien tuvo tiempo/pantallazos o alertas.
      const ids = new Set<string>([...segPor.keys(), ...atPor.keys(), ...bajonesPor.keys()]);
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
        const m = segPor.get(id);
        const at = atPor.get(id);
        const calificado = esCalificado(id);
        // Pantalla% y cámara% sobre la JORNADA de 8 h (pausa libre descontada): así
        // medio día ≈ 50 y las horas quedan metidas. Si el rol NO se califica
        // (supervisor, finanzas…), esos factores quedan en N/A: no cuentan.
        const pantallaPct = calificado && m ? fraccionJornada(m.pantalla) : undefined;
        const camaraPct = calificado && m ? fraccionJornada(m.camara) : undefined;
        const atencionPct = at && at.n > 0 ? at.ok / at.n : undefined;
        const horas = m?.horas ?? 0;
        // Activo = estuvo en Maven ese día por CUALQUIER señal.
        const activo = horas > 0 || (!!at && at.n > 0) || (bajonesPor.get(id)?.length ?? 0) > 0;
        const nota = calcularNota({ pantallaPct, camaraPct, atencionPct });
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
