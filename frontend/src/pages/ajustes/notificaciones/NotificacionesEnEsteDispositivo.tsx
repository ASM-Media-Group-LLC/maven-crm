import { BellOff, BellRing, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import InstalarMaven from "@/components/pwa/InstalarMaven";
import { Link } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";
import { usePushDispositivo } from "@/hooks/usePushDispositivo";

// "Notificaciones en este dispositivo": el interruptor del Web Push. Es POR
// DISPOSITIVO (la suscripción vive en el navegador), así que el texto lo dice
// y el estado se calcula acá, no desde la base.
export default function NotificacionesEnEsteDispositivo() {
  const { t } = useLanguage();
  const { estado, ocupado, plataforma, activar, desactivar } = usePushDispositivo();

  const ayudaBloqueado =
    plataforma === "android"
      ? t("push.dispositivo.ayudaBloqueadoAndroid")
      : plataforma === "ios-safari" || plataforma === "ios-otro"
        ? t("push.dispositivo.ayudaBloqueadoIos")
        : t("push.dispositivo.ayudaBloqueadoEscritorio");

  return (
    <div className="rounded-md px-3 py-3 hover:bg-muted/50 transition-colors" data-testid="push-dispositivo">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <BellRing className="h-4 w-4 mt-0.5 text-muted-foreground" />
          <div>
            <span className="text-sm font-medium">{t("push.dispositivo.titulo")}</span>
            <p className="text-xs text-muted-foreground mt-0.5">{t("push.dispositivo.descripcion")}</p>
          </div>
        </div>
        {estado === "activo" && (
          <Badge variant="default" className="shrink-0 text-[10px] gap-1">
            <BellRing className="h-3 w-3" />
            {t("push.dispositivo.activas")}
          </Badge>
        )}
        {estado === "inactivo" && (
          <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
            {t("push.dispositivo.inactivas")}
          </Badge>
        )}
        {estado === "bloqueado" && (
          <Badge variant="destructive" className="shrink-0 text-[10px] gap-1">
            <BellOff className="h-3 w-3" />
            {t("push.dispositivo.bloqueadas")}
          </Badge>
        )}
        {estado === "no-soportado" && (
          <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
            {t("push.dispositivo.noSoportado")}
          </Badge>
        )}
      </div>

      <div className="mt-3 pl-7">
        {estado === "necesita-instalar" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("push.dispositivo.necesitaInstalar")}</p>
            <InstalarMaven variante="panel" />
          </div>
        )}
        {estado === "bloqueado" && <p className="text-xs text-muted-foreground">{ayudaBloqueado}</p>}
        {estado === "inactivo" && (
          <Button size="sm" className="h-8 gap-1.5" disabled={ocupado} onClick={() => void activar()}>
            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
            {t("push.dispositivo.activar")}
          </Button>
        )}
        {estado === "activo" && (
          <div className="space-y-2">
            {plataforma === "android" && (
              <p className="text-xs text-muted-foreground">{t("push.dispositivo.ayudaEmergenteAndroid")}</p>
            )}
            <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={ocupado} onClick={() => void desactivar()}>
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellOff className="h-3.5 w-3.5" />}
              {t("push.dispositivo.desactivar")}
            </Button>
          </div>
        )}
      </div>
      {/* Para depurar la PWA en un teléfono sin inspector: medidas reales del dispositivo. */}
      <div className="mt-3 pl-7">
        <Link to="/diagnostico-pantalla" className="text-[11px] text-muted-foreground underline-offset-2 hover:underline">
          Diagnóstico de pantalla
        </Link>
      </div>
    </div>
  );
}
