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
  horas: number;
  bajones: BajonDia[];
}

interface FilaTiempo { user_id: string; seg_activo: number | string; seg_en_sala?: number | string; seg_sin_pantalla?: number | string; seg_sin_camara?: number | string; }
interface FilaCaptura { user_id: string; fuera_de_lugar: boolean | null; }
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

      const [tiempoRes, capturasRes, alertasRes] = await Promise.all([
        db.rpc("cowork_tiempo_diario", { _desde: dia, _hasta: dia, _user_id: null, _limit: 500, _offset: 0 }),
        sinTipar.from("monitor_capturas").select("user_id, fuera_de_lugar").eq("tipo", "pantalla").not("veredicto", "is", null).gte("created_at", inicioISO).lte("created_at", finISO).limit(20000),
        sinTipar.from("argos_alertas").select("user_id, tipo, detalle, abierta_at, cerrada_at").gte("abierta_at", inicioISO).lte("abierta_at", finISO).limit(5000),
      ]);
      if (tiempoRes.error) throw new Error(tiempoRes.error.message);

      // Tiempo en sala / pantalla / cámara por persona (para pantalla% y cámara%).
      const tiempoPor = new Map<string, { enSala: number; sinPant: number; sinCam: number; horas: number }>();
      for (const r of (tiempoRes.data ?? []) as FilaTiempo[]) {
        const enSala = Number(r.seg_en_sala ?? 0);
        tiempoPor.set(r.user_id, {
          enSala,
          sinPant: Number(r.seg_sin_pantalla ?? 0),
          sinCam: Number(r.seg_sin_camara ?? 0),
          horas: Number(r.seg_activo) / 3600,
        });
      }

      // Atención por persona: de los pantallazos juzgados, cuántos en lo suyo.
      const atPor = new Map<string, { ok: number; n: number }>();
      for (const c of (capturasRes.data ?? []) as FilaCaptura[]) {
        const a = atPor.get(c.user_id) ?? { ok: 0, n: 0 };
        a.n++;
        if (c.fuera_de_lugar !== true) a.ok++;
        atPor.set(c.user_id, a);
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

      // Roster del día: quien tuvo tiempo en sala, pantallazos juzgados o alertas.
      const ids = new Set<string>([...tiempoPor.keys(), ...atPor.keys(), ...bajonesPor.keys()]);
      if (ids.size === 0) return [];

      const { data: perfiles } = await supabase.from("profiles").select("id, full_name, avatar_url, avatar_seed").in("id", [...ids]);
      const perfilPor = new Map((perfiles ?? []).map((p) => [p.id as string, p as { full_name: string | null; avatar_url: string | null; avatar_seed: string | null }]));

      const personas: PersonaResumen[] = [...ids].map((id) => {
        const t = tiempoPor.get(id);
        const at = atPor.get(id);
        const tuvoCapturas = !!at && at.n > 0;
        const pantallaPct = t && t.enSala > 0 ? Math.max(0, t.enSala - t.sinPant) / t.enSala : tuvoCapturas ? 0 : undefined;
        const camaraPct = t && t.enSala > 0 ? Math.max(0, t.enSala - t.sinCam) / t.enSala : undefined;
        const atencionPct = at && at.n > 0 ? at.ok / at.n : undefined;
        const horas = t?.horas ?? 0;
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
          horas,
          bajones,
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
