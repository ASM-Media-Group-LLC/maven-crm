import { useEffect, useState, useSyncExternalStore } from "react";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/hooks/useLanguage";
import { useEsDueno } from "@/hooks/useEsDueno";
import { supabase } from "@/integrations/supabase/client";
import { hayLlamadaActiva } from "@/lib/llamadaActiva";
import { alCambiarReloj, fijarReloj24, horaUI, usaReloj24 } from "@/lib/formatoHora";

// LA HORA DE TODA LA EMPRESA (Alvaro, 18/11/2026): solo el dueño la ve y la
// cambia. Apagado = 5:25 PM (por defecto); prendido = 17:25. Vale para todos.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export function TarjetaHoraEmpresa() {
  const { t } = useLanguage();
  const { esDueno } = useEsDueno();
  const reloj24 = useSyncExternalStore(alCambiarReloj, usaReloj24);
  const [guardando, setGuardando] = useState(false);
  const [, setTic] = useState(0);
  useEffect(() => { const id = window.setInterval(() => setTic((n) => n + 1), 30_000); return () => window.clearInterval(id); }, []);

  if (esDueno !== true) return null;

  const cambiar = async (v: boolean) => {
    setGuardando(true);
    const { error } = await sinTipar.from("app_flags").update({ enabled: v, updated_at: new Date().toISOString() }).eq("key", "reloj_24h");
    setGuardando(false);
    if (error) { toast.error(t("settings.hora.error")); return; }
    fijarReloj24(v);
    toast.success(t("settings.hora.listo"));
    if (!hayLlamadaActiva()) window.setTimeout(() => window.location.reload(), 800);
  };

  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Clock className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{t("settings.hora.titulo")}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("settings.hora.desc", { ahora: horaUI(new Date()) })}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">{t("settings.hora.militar")}</span>
          <Switch checked={reloj24} disabled={guardando} onCheckedChange={(v) => void cambiar(v)} aria-label={t("settings.hora.militar")} />
        </div>
      </CardContent>
    </Card>
  );
}

/** Al entrar: lee la hora que eligió el dueño y la aplica (y la vigila). */
export function RelojDeLaEmpresa() {
  useEffect(() => {
    let vivo = true;
    const leer = async () => {
      try {
        const { data, error } = await sinTipar.from("app_flags").select("enabled").eq("key", "reloj_24h").maybeSingle();
        if (!vivo || error || !data) return; // un fallo no cambia nada: queda lo guardado
        const nuevo = !!data.enabled;
        if (nuevo === usaReloj24()) return;
        fijarReloj24(nuevo);
        // Las horas ya dibujadas se quedan como estaban: se recarga una vez para
        // que todo salga igual (nunca en una llamada; ahí se ve al colgar/volver).
        if (!hayLlamadaActiva()) window.location.reload();
      } catch { /* sin red: queda lo guardado */ }
    };
    void leer();
    const id = window.setInterval(leer, 10 * 60_000);
    return () => { vivo = false; window.clearInterval(id); };
  }, []);
  return null;
}
