import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useEnTurno } from "@/lib/turnoActivo";
import { a12 } from "@/lib/horaBogota";
import { debeRecordarComida, horaBogotaAhora } from "@/lib/horaDeComida";

// RECORDATORIO DE LA HORA DE COMIDA (Alvaro, 27/11/2026). Si el plan de su
// puesto (o RR. HH. en su horario) le pone una hora de comida, a esa hora Maven
// le avisa una vez al día, solo si está en turno. Recomendada: «tómala cuando te
// quede mejor». Obligatoria: «sal dentro de los próximos N min». No bloquea nada.

type RpcDb = { rpc: (f: string) => Promise<{ data: unknown; error: unknown }> };
const CLAVE = "maven.comida.recordada";

interface MiComida { hora: string | null; obligatoria: boolean; margen_min: number }

export function RecordatorioComida() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const enTurno = useEnTurno();

  useEffect(() => {
    if (!user || !enTurno) return;
    let vivo = true;
    let comida: MiComida | null = null;
    const revisar = () => {
      if (!comida?.hora) return;
      const { hoy, minutos } = horaBogotaAhora(new Date());
      let ultima: string | null = null;
      try { ultima = window.localStorage.getItem(CLAVE); } catch { /* sin almacenamiento */ }
      if (!debeRecordarComida(comida.hora, minutos, hoy, ultima)) return;
      try { window.localStorage.setItem(CLAVE, hoy); } catch { /* noop */ }
      const h = a12(comida.hora) ?? comida.hora;
      toast(t("hr.comida.recordatorioTitulo"), {
        description: comida.obligatoria
          ? t("hr.comida.recordatorioObligatoria", { h, m: comida.margen_min })
          : t("hr.comida.recordatorioRecomendada", { h }),
        duration: 20_000,
      });
    };
    void (async () => {
      try {
        const { data, error } = await (supabase as unknown as RpcDb).rpc("mi_comida");
        const fila = !error && Array.isArray(data) ? (data[0] as MiComida | undefined) : undefined;
        if (!vivo || !fila) return;
        comida = fila;
        revisar();
      } catch { /* sin dato no se recuerda: nunca se inventa una hora */ }
    })();
    const id = window.setInterval(revisar, 30_000);
    return () => { vivo = false; window.clearInterval(id); };
  }, [user, enTurno, t]);

  return null;
}

export default RecordatorioComida;
