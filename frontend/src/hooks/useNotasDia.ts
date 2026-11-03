import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calcularNota, type Nota } from "@/lib/notaEmpleado";

// LA NOTA DEL DÍA por persona (Argos), ligera, para pintarla en Conectados ahora:
// pantalla 30 / cámara 30 / atención 30 / horas 10, igual que el expediente y el
// resumen. Pantalla% y cámara% salen de los MOMENTOS (RPC argos_momentos_dia), no
// del ratito en Cowork. Devuelve un mapa userId → Nota. Lo ve el dueño (RLS).

const META_DIA = 8;
type RpcDb = { rpc: (f: string, a: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }> };

interface FilaMom { user_id: string; mom_camara: number | string; mom_pantalla: number | string; faltas_camara: number | string; juzgadas: number | string; juzgadas_ok: number | string; }
interface FilaTiempo { user_id: string; seg_activo: number | string; }

export function useNotasDia() {
  const q = useQuery({
    queryKey: ["notas-dia"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Map<string, Nota>> => {
      const dia = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
      const db = supabase as unknown as RpcDb;
      const [momRes, tiempoRes] = await Promise.all([
        db.rpc("argos_momentos_dia", { _dia: dia }),
        db.rpc("cowork_tiempo_diario", { _desde: dia, _hasta: dia, _user_id: null, _limit: 500, _offset: 0 }),
      ]);
      if (momRes.error) throw new Error(momRes.error.message);

      const horasPor = new Map<string, number>();
      for (const r of (tiempoRes.data ?? []) as FilaTiempo[]) horasPor.set(r.user_id, Number(r.seg_activo) / 3600);

      const notas = new Map<string, Nota>();
      for (const m of (momRes.data ?? []) as FilaMom[]) {
        const cam = Number(m.mom_camara), pant = Number(m.mom_pantalla), faltas = Number(m.faltas_camara);
        const juz = Number(m.juzgadas), juzOk = Number(m.juzgadas_ok);
        const pantallaPct = cam > 0 ? Math.min(1, pant / cam) : undefined;
        const camaraPct = cam > 0 ? cam / (cam + faltas) : undefined;
        const atencionPct = juz > 0 ? juzOk / juz : undefined;
        notas.set(m.user_id, calcularNota({ pantallaPct, camaraPct, atencionPct, horasHechas: horasPor.get(m.user_id) ?? 0, horasMeta: META_DIA }));
      }
      return notas;
    },
  });

  return { notasPor: q.data ?? null, cargando: q.isLoading, error: (q.error as Error | null) ?? null };
}
