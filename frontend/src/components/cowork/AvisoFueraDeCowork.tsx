import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DoorOpen, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { anunciar } from "@/lib/anunciarVoz";
import { playMessageNotification } from "@/lib/notificationSound";
import { VOZ_ARGOS, fraseFueraDeCowork } from "@/lib/argosNudge";

// ARGOS FUERA DE COWORK (Alvaro, 13/11/2026): «Isabel tiene que estar en el cowork.
// Si no está, le tiene que avisar que se meta». Mientras la persona está en su turno
// y fuera de la sala, en CUALQUIER página de Maven le sale este cartel y Argos le
// habla en cada llamado. Los llamados los cuenta el servidor (vigilar_fuera_de_cowork,
// cada 2 min, el mismo que manda el push al teléfono): acá solo se lee y se dice.
// Desde el 3ro, la frase es «te estoy reportando» y el reporte ya salió a sus jefes.

interface Estado {
  desde: string | null;
  llamados: number;
  nunca_entro: boolean;
  reportado: boolean;
  entrada: string | null;
}

const CADA_MS = 30_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { rpc: (f: string) => Promise<{ data: any; error: unknown }> };

export function AvisoFueraDeCowork() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const hablados = useRef(0);

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    const leer = async () => {
      const { data, error } = await sinTipar.rpc("mi_fuera_de_cowork");
      // Un fallo NO es «ya entró»: se deja lo último que se supo y se reintenta.
      if (!vivo || error) return;
      const fila = (Array.isArray(data) ? data[0] : null) as Estado | null;
      setEstado(fila && fila.llamados > 0 ? fila : null);
      setAhora(Date.now());
    };
    void leer();
    const id = window.setInterval(() => { void leer(); }, CADA_MS);
    return () => { vivo = false; window.clearInterval(id); };
  }, [user]);

  // Un llamado nuevo del servidor = Argos habla (una vez por llamado).
  useEffect(() => {
    if (!estado) { hablados.current = 0; return; }
    if (estado.llamados <= hablados.current) return;
    hablados.current = estado.llamados;
    playMessageNotification(0.5);
    void anunciar(fraseFueraDeCowork(estado.llamados, estado.nunca_entro), { voiceId: VOZ_ARGOS, volumen: 0.9 });
  }, [estado]);

  // En la página de Cowork no hace falta el cartel: ya está entrando.
  if (!estado || pathname.startsWith("/cowork")) return null;

  const min = estado.desde ? Math.max(1, Math.round((ahora - Date.parse(estado.desde)) / 60_000)) : null;
  const entrada = estado.entrada ? estado.entrada.slice(0, 5) : "";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
        {estado.reportado ? <ShieldAlert className="h-4 w-4" /> : <DoorOpen className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          {estado.nunca_entro ? t("int.argosFuera.tituloNoEntro") : t("int.argosFuera.titulo")}
        </p>
        <p className="text-xs text-muted-foreground">
          {estado.nunca_entro ? t("int.argosFuera.debiaEntrar", { h: entrada }) : t("int.argosFuera.lleva", { n: min ?? 1 })}
          {estado.reportado && <span className="ml-1 font-semibold text-destructive">{t("int.argosFuera.reportado")}</span>}
        </p>
      </div>
      <Button size="sm" variant="destructive" className="rounded-full" onClick={() => navigate("/cowork")}>
        {t("int.argosFuera.entrar")}
      </Button>
    </div>
  );
}

export default AvisoFueraDeCowork;
