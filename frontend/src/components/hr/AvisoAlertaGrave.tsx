import { useEffect, useRef, useState } from "react";
import { AppWindow, MousePointerClick, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { anunciar } from "@/lib/anunciarVoz";
import { playMessageNotification } from "@/lib/notificationSound";
import { VOZ_ARGOS } from "@/lib/argosNudge";

// ALERTA GRAVE A LA PERSONA (Alvaro, 19/11/2026): «antes de que llegue a ti».
// Si lleva 10 min sin tocar nada en su turno, o una hora en apps ajenas, Argos
// se lo dice con su voz y un cartel en cualquier página de Maven. Si a los 2 min
// sigue igual, el servidor (argos_vigilar_graves) ya avisó a su jefe, a RR. HH. y
// al dueño, y el cartel lo dice. Un fallo al consultar no es «ya volvió»: se deja
// lo último que se supo y se reintenta.

interface Alerta { id: string; tipo: "sin_actividad" | "fuera_del_trabajo"; desde: string; minutos: number; detalle: string | null; escalada: boolean; obligatorio?: boolean }

const CADA_MS = 30_000;
const db = supabase as unknown as { rpc: (f: string) => Promise<{ data: unknown; error: unknown }> };

export function AvisoAlertaGrave() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [alerta, setAlerta] = useState<Alerta | null>(null);
  const dicho = useRef<string>("");

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    const leer = async () => {
      const { data, error } = await db.rpc("mi_alerta_grave");
      if (!vivo || error) return;
      const fila = (Array.isArray(data) ? data[0] : null) as Alerta | null;
      setAlerta(fila ?? null);
    };
    void leer();
    const id = window.setInterval(() => { void leer(); }, CADA_MS);
    return () => { vivo = false; window.clearInterval(id); };
  }, [user]);

  // Argos habla una vez al abrirse y otra cuando ya avisó a los jefes.
  useEffect(() => {
    if (!alerta) { dicho.current = ""; return; }
    const clave = `${alerta.id}:${alerta.escalada ? 1 : 0}`;
    if (dicho.current === clave) return;
    dicho.current = clave;
    playMessageNotification(0.6);
    const frase = alerta.escalada
      ? t("hr.grave.voz.escalada")
      : alerta.tipo === "sin_actividad" ? t("hr.grave.voz.sinActividad") : t("hr.grave.voz.fuera");
    void anunciar(frase, { voiceId: VOZ_ARGOS, volumen: 0.95 });
  }, [alerta, t]);

  if (!alerta) return null;
  const Icono = alerta.escalada ? ShieldAlert : alerta.tipo === "sin_actividad" ? MousePointerClick : AppWindow;
  return (
    <div role="alert" aria-live="assertive"
      className="flex flex-wrap items-center gap-3 rounded-panel border border-destructive/40 bg-destructive/10 px-3 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-destructive/15 text-destructive">
        <Icono className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          {alerta.tipo === "sin_actividad" ? t("hr.grave.tituloSinActividad", { n: alerta.minutos }) : t("hr.grave.tituloFuera", { n: alerta.minutos })}
        </p>
        <p className="text-xs text-muted-foreground">
          {alerta.tipo === "fuera_del_trabajo" && alerta.detalle ? `${alerta.detalle} · ` : ""}
          {alerta.escalada ? <span className="font-semibold text-destructive">{t("hr.grave.yaAviso")}</span> : t("hr.grave.antesDeAvisar")}
          {alerta.obligatorio && alerta.tipo === "sin_actividad" && <span className="ml-1">{t("hr.grave.noSePaga")}</span>}
        </p>
      </div>
    </div>
  );
}
