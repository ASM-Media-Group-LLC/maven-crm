import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// MI TIEMPO EN COWORK, día por día: el reloj que va a reemplazar a Hubstaff
// (ver cowork_tiempo_hubstaff). Sale del RPC `cowork_tiempo_diario`, que con
// sesión de usuario devuelve solo lo propio (salvo admin). Convive con
// `useMisHoras` (Hubstaff) en los tableros mientras dure la transición.

export interface DiaDeCowork {
  date: string;
  /** Horas con el reloj corriendo: cámara + pantalla, presente. */
  horas: number;
  /** Horas dentro de la sala, corriendo o no. */
  horasEnSala: number;
}

const SIN_DIAS: DiaDeCowork[] = [];

export function useMiTiempoCowork(desde: string, hasta: string) {
  const { user } = useAuth();
  const q = useQuery({
    enabled: !!user?.id,
    queryKey: ["mi-tiempo-cowork", user?.id, desde, hasta],
    staleTime: 60_000,
    queryFn: async (): Promise<DiaDeCowork[]> => {
      // El RPC todavía no está en los tipos generados; el cast se acota acá.
      const db = supabase as unknown as {
        rpc: (f: string, a: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
      const { data, error } = await db.rpc("cowork_tiempo_diario", {
        _desde: desde, _hasta: hasta, _user_id: user!.id, _limit: 500, _offset: 0,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ dia: string; seg_activo: number; seg_en_sala: number }>)
        .map((r) => ({ date: r.dia, horas: Number(r.seg_activo) / 3600, horasEnSala: Number(r.seg_en_sala) / 3600 }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },
  });
  return { dias: q.data ?? SIN_DIAS, cargando: q.isLoading };
}

/** Total del rango. `diasConReloj` = días en los que el reloj corrió algo. */
export function resumirTiempoCowork(dias: DiaDeCowork[]) {
  const horas = dias.reduce((s, d) => s + d.horas, 0);
  const horasEnSala = dias.reduce((s, d) => s + d.horasEnSala, 0);
  return { horas, horasEnSala, diasConReloj: dias.filter((d) => d.horas > 0).length };
}

/** "31.5 h · 34.2 h en sala" — el pie de la tarjeta. */
export function pieTiempoCowork(r: ReturnType<typeof resumirTiempoCowork>, cargando: boolean): string {
  if (r.diasConReloj === 0) return cargando ? "cargando…" : "sin tiempo en Cowork en el rango";
  return `${r.diasConReloj} día${r.diasConReloj === 1 ? "" : "s"} · ${r.horasEnSala.toFixed(1)} h en sala`;
}
