// Minutos de gracia (ver lib/gracia.ts): el contador propio en Cowork y el de
// una persona en el Expediente.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { GraciaTurno } from "@/lib/gracia";

const CADA_MS = 60_000;

// Las tablas y funciones de la gracia aún no están en los tipos generados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any; rpc: (f: string, args?: Record<string, unknown>) => any };

/** Mi turno de hoy. Se refresca cada minuto. Un fallo NO borra lo último que llegó. */
export function useMiGracia(activo = true): { gracia: GraciaTurno | null; fallo: boolean } {
  const [gracia, setGracia] = useState<GraciaTurno | null>(null);
  const [fallo, setFallo] = useState(false);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    const leer = async () => {
      const { data, error } = await sinTipar.rpc("mi_gracia_hoy");
      if (!vivo) return;
      if (error) { setFallo(true); return; }
      setFallo(false);
      const fila = Array.isArray(data) ? (data[0] as GraciaTurno | undefined) : undefined;
      setGracia(fila ?? null);
    };
    void leer();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void leer(); }, CADA_MS);
    return () => { vivo = false; window.clearInterval(id); };
  }, [activo]);
  return { gracia, fallo };
}

export interface DevolucionGracia {
  id: number;
  pantalla_min: number;
  camara_min: number;
  motivo: string;
  created_at: string;
  puesto_por: string | null;
  quien: string | null;
}

export interface EstadoGraciaDe {
  cargando: boolean;
  /** null = la consulta falló (no es «sin datos»). */
  gracia: GraciaTurno | null | undefined;
  devoluciones: DevolucionGracia[];
  puedeDar: boolean;
  recargar: () => void;
}

/** El turno de una persona en un día, para el Expediente. */
export function useGraciaDe(userId: string | undefined, fecha: string): EstadoGraciaDe {
  const [cargando, setCargando] = useState(true);
  const [gracia, setGracia] = useState<GraciaTurno | null | undefined>(undefined);
  const [devoluciones, setDevoluciones] = useState<DevolucionGracia[]>([]);
  const [puedeDar, setPuedeDar] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);

  useEffect(() => {
    if (!userId) return;
    let vivo = true;
    setCargando(true);
    (async () => {
      const { data: sesion } = await supabase.auth.getUser();
      const [g, d, p] = await Promise.all([
        sinTipar.rpc("argos_gracia_de", { _uid: userId, _turno: fecha }),
        sinTipar.from("argos_gracia_extra")
          .select("id, pantalla_min, camara_min, motivo, created_at, puesto_por, quien:profiles!argos_gracia_extra_puesto_por_fkey(full_name)")
          .eq("user_id", userId).eq("turno", fecha).order("created_at", { ascending: true }),
        sesion?.user ? sinTipar.rpc("argos_puede_dar_gracia", { _viewer: sesion.user.id }) : Promise.resolve({ data: false, error: null }),
      ]);
      if (!vivo) return;
      setGracia(g.error ? null : ((Array.isArray(g.data) ? g.data[0] : undefined) as GraciaTurno | undefined) ?? undefined);
      setDevoluciones(d.error ? [] : ((d.data ?? []) as Array<Omit<DevolucionGracia, "quien"> & { quien: { full_name: string | null } | null }>)
        .map((x) => ({ ...x, quien: x.quien?.full_name ?? null })));
      setPuedeDar(!p.error && p.data === true);
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [userId, fecha, vuelta]);

  return { cargando, gracia, devoluciones, puedeDar, recargar };
}

/** Devolver minutos (RR. HH., admins, dueño). Devuelve el mensaje de error o null. */
export async function devolverMinutos(userId: string, fecha: string, pantalla: number, camara: number, motivo: string): Promise<string | null> {
  const { error } = await sinTipar.rpc("argos_dar_gracia", {
    _uid: userId, _turno: fecha, _pantalla: Math.round(pantalla), _camara: Math.round(camara), _motivo: motivo.trim(),
  });
  return error ? error.message : null;
}
