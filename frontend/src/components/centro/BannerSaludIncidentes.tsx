import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEsDueno } from "@/hooks/useEsDueno";

// Banner rojo en el home que pinta los incidentes abiertos de salud_incidentes
// (Alvaro, 08/11 noche). Solo lo ve el dueño; se puede cerrar (local), pero si
// hay incidentes nuevos vuelve a aparecer.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

interface Incidente { id: string; tipo: string; mensaje: string; abierto_at: string; }

const LABEL: Record<string, string> = {
  nas_caido: "NAS caído",
  correo_atascado: "Correos atascados",
  argos_sin_juzgar: "Argos sin juzgar",
  cron_parado: "Robot parado",
};

export default function BannerSaludIncidentes() {
  const { user } = useAuth();
  const { esDueno } = useEsDueno();
  const [cerradoLocal, setCerradoLocal] = useState<Set<string>>(new Set());

  const q = useQuery<Incidente[]>({
    queryKey: ["salud-incidentes-abiertos"],
    staleTime: 20_000,
    refetchInterval: 30_000,
    enabled: !!user && esDueno === true,
    queryFn: async () => {
      const { data, error } = await sinTipar.from("salud_incidentes")
        .select("id, tipo, mensaje, abierto_at")
        .is("cerrado_at", null)
        .order("abierto_at", { ascending: false });
      if (error) return [];
      return (data ?? []) as Incidente[];
    },
  });

  const abiertos = (q.data ?? []).filter((i) => !cerradoLocal.has(i.id));
  if (esDueno !== true || abiertos.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {abiertos.map((inc) => (
        <div key={inc.id}
          className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <span className="text-sm font-semibold text-destructive">{LABEL[inc.tipo] ?? inc.tipo}</span>
            <span className="ml-2 text-[12px] text-destructive/80">{inc.mensaje}</span>
          </div>
          <button type="button"
            onClick={() => setCerradoLocal((s) => new Set([...s, inc.id]))}
            className="rounded-full p-1 text-destructive/70 transition hover:bg-destructive/20"
            aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
