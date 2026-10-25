import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCanalQueRevive } from "@/hooks/useCanalQueRevive";
import { SITUACION_POR_SLUG } from "@/lib/coworkAvisos";
import { anunciar } from "@/lib/anunciarVoz";
import { playCoordinatorRequestSound } from "@/lib/coordinatorRequestSound";
import { nombreYApellido } from "@/lib/pausaCowork";
import type { TranslationKey } from "@/lib/i18n";

// Recepción del aviso del botón "Avisar": alguien (supervisor o dueño) eligió
// una situación y se insertó una fila en cowork_avisos para ESTA persona. Llega
// por realtime: suena la campana, Mario lo dice en voz alta y aparece el cartel
// con quién avisó.
//
// Vive en un hook compartido a propósito: lo reciben tanto los CHATTERS (vista
// de participante) como los SUPERVISORES (tablero de host) — al dueño avisarle a
// un supervisor no servía de nada si el supervisor no lo oía. Se escucha por
// user_id (no por un topic compartido con quien envía), así que el versionado de
// useCanalQueRevive no estorba; y al revivir tras un corte se relee el último
// aviso fresco por si entró con el canal caído.

export interface AvisoRecibido {
  id: string;
  etiqueta: TranslationKey;
  nombreDe: string | null;
}

interface FilaAviso {
  id?: string;
  situacion?: string;
  created_by?: string;
  created_at?: string;
}

export function useRecepcionAvisos(userId: string | null | undefined) {
  const [aviso, setAviso] = useState<AvisoRecibido | null>(null);
  const avisosVistos = useRef<Set<string>>(new Set());
  const nombresAviso = useRef<Record<string, string | null>>({});
  const cierreAviso = useRef<number | null>(null);

  const resolverNombreAviso = async (uid: string): Promise<string | null> => {
    if (uid in nombresAviso.current) return nombresAviso.current[uid];
    try {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle();
      const n = data?.full_name ? nombreYApellido(data.full_name) : null;
      nombresAviso.current[uid] = n;
      return n;
    } catch { return null; }
  };

  const manejarAviso = (row: FilaAviso) => {
    const id = row?.id;
    const slug = row?.situacion;
    if (!id || !slug || avisosVistos.current.has(id)) return;
    avisosVistos.current.add(id);
    // Un aviso viejo releído al reconectar no se vuelve a gritar.
    const edadMs = row.created_at ? Date.now() - new Date(row.created_at).getTime() : 0;
    if (edadMs > 30_000) return;
    const s = SITUACION_POR_SLUG[slug];
    if (!s) return;
    playCoordinatorRequestSound(0.9);
    void anunciar(s.vozEs);
    setAviso({ id, etiqueta: s.etiqueta, nombreDe: null });
    if (row.created_by) {
      void resolverNombreAviso(row.created_by).then((n) =>
        setAviso((a) => (a && a.id === id ? { ...a, nombreDe: n } : a)),
      );
    }
    if (cierreAviso.current) window.clearTimeout(cierreAviso.current);
    cierreAviso.current = window.setTimeout(() => setAviso(null), 15_000);
  };

  useEffect(() => () => { if (cierreAviso.current) window.clearTimeout(cierreAviso.current); }, []);

  useCanalQueRevive({
    topic: userId ? `cowork-avisos-${userId}` : null,
    armar: (ch) =>
      ch.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cowork_avisos", filter: `user_id=eq.${userId}` },
        (payload) => manejarAviso(payload.new as FilaAviso),
      ),
    alRevivir: () => {
      void (async () => {
        try {
          const desde = new Date(Date.now() - 30_000).toISOString();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sinTipar = supabase as unknown as { from: (t: string) => any };
          const { data } = await sinTipar.from("cowork_avisos")
            .select("*").eq("user_id", userId).gte("created_at", desde)
            .order("created_at", { ascending: false }).limit(1);
          if (data && data[0]) manejarAviso(data[0]);
        } catch { /* noop */ }
      })();
    },
  });

  return { aviso, cerrar: () => setAviso(null) };
}
