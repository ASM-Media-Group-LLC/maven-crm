import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// La copia de cada grabación en el Drive (edge grabaciones-al-drive): si ya
// está, hasta cuándo queda (30 días desde que se copió) y el botón «Guardar 30
// días más» (grabacion_drive_extender). La RLS de grabaciones_al_drive deja ver
// solo la copia de las grabaciones que uno ya ve en /grabaciones.

// La tabla y la función son nuevas: todavía no están en los tipos generados.
const sinTipar = supabase as unknown as {
  from: (t: string) => any;
  rpc: (f: string, a?: unknown) => Promise<{ data: any; error: { message: string } | null }>;
};

export type CopiaDelDrive = {
  recording_id: string;
  estado: "pendiente" | "subiendo" | "juntando" | "listo" | "fallo" | "cancelado" | "vencido";
  vence_drive_at: string | null;
};

export function useCopiasDelDrive(ids: string[]) {
  const [copias, setCopias] = useState<Map<string, CopiaDelDrive>>(new Map());
  // Un fallo NO es «sin copia»: la página no dice nada del Drive si no pudo leerlo.
  const [fallo, setFallo] = useState(false);
  const clave = [...ids].sort().join(",");

  const cargar = useCallback(async () => {
    const lista = clave ? clave.split(",") : [];
    if (!lista.length) { setCopias(new Map()); setFallo(false); return; }
    const { data, error } = await sinTipar.from("grabaciones_al_drive")
      .select("recording_id, estado, vence_drive_at")
      .in("recording_id", lista);
    if (error || !data) { setFallo(true); return; }
    setFallo(false);
    setCopias(new Map((data as CopiaDelDrive[]).map((c) => [c.recording_id, c])));
  }, [clave]);

  useEffect(() => { void cargar(); }, [cargar]);

  /** Suma 30 días; devuelve el nuevo vencimiento o tira con el motivo. */
  const extender = useCallback(async (recordingId: string): Promise<string> => {
    const { data, error } = await sinTipar.rpc("grabacion_drive_extender", { p_recording: recordingId });
    if (error) throw new Error(error.message);
    const vence = String(data);
    setCopias((m) => {
      const n = new Map(m);
      const c = n.get(recordingId);
      if (c) n.set(recordingId, { ...c, vence_drive_at: vence });
      return n;
    });
    return vence;
  }, []);

  return { copias, fallo, extender, recargar: cargar };
}
