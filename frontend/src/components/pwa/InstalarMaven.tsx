import { useState } from "react";
import { Check, Copy, Download, Share, Smartphone, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { useInstalarMaven } from "@/hooks/useInstalarMaven";
import { cn } from "@/lib/utils";

// Guía para instalar Maven como app en el teléfono. Dos variantes:
//   · "banner": arriba de la lista de chats. Solo en teléfono, solo si no está
//     instalada, y se puede posponer 7 días. En escritorio no dibuja nada.
//   · "panel": dentro de Ajustes → Notificaciones → Canales. Siempre visible;
//     si ya está instalada, lo dice.
// Por qué existe: en iPhone el push de mensajes SOLO funciona con la app
// instalada desde Safari, y el sistema no ofrece instalarla solo.
export default function InstalarMaven({
  variante = "banner",
  className,
}: {
  variante?: "banner" | "panel";
  className?: string;
}) {
  const { t } = useLanguage();
  const { instalada, plataforma, puedeInstalarNativo, mostrarGuia, instalar, posponer } = useInstalarMaven();
  const [copiado, setCopiado] = useState(false);

  if (variante === "banner" && !mostrarGuia) return null;

  const copiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/dashboard`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sin portapapeles: el enlace igual está en la barra */
    }
  };

  const Paso = ({ n, icono, texto }: { n: number; icono: React.ReactNode; texto: string }) => (
    <li className="flex items-center gap-2.5 text-[13px]">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
        {n}
      </span>
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-muted text-foreground/80">{icono}</span>
      <span>{texto}</span>
    </li>
  );

  let cuerpo: React.ReactNode;
  if (instalada) {
    cuerpo = <p className="text-[13px] text-muted-foreground">{t("pwa.instalar.yaInstalada")}</p>;
  } else if (plataforma === "escritorio") {
    cuerpo = <p className="text-[13px] text-muted-foreground">{t("pwa.instalar.soloTelefono")}</p>;
  } else if (plataforma === "ios-safari" || plataforma === "ios-otro") {
    // Los mismos cuatro pasos para Safari, Brave y Chrome en iPhone: desde iOS
    // 16.4 cualquier navegador puede añadir a la pantalla de inicio desde su
    // menú Compartir, y Brave ni siquiera se distingue de Safari por el UA. Lo
    // que fallaba no era el navegador sino que "Toca Compartir" no decía DÓNDE.
    cuerpo = (
      <div className="space-y-2">
        <ol className="space-y-1.5">
          <Paso n={1} icono={<Share className="h-3.5 w-3.5" />} texto={t("pwa.instalar.iosPaso1")} />
          <Paso n={2} icono={<SquarePlus className="h-3.5 w-3.5" />} texto={t("pwa.instalar.iosPaso2")} />
          <Paso n={3} icono={<Check className="h-3.5 w-3.5" />} texto={t("pwa.instalar.iosPaso3")} />
          <Paso n={4} icono={<Smartphone className="h-3.5 w-3.5" />} texto={t("pwa.instalar.iosPaso4")} />
        </ol>
        <p className="text-xs text-muted-foreground">{t("pwa.instalar.iosSoloSafari")}</p>
        {plataforma === "ios-otro" && (
          <Button size="sm" variant="secondary" className="h-8 gap-1.5" onClick={copiarEnlace}>
            {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copiado ? t("pwa.instalar.enlaceCopiado") : t("pwa.instalar.copiarEnlace")}
          </Button>
        )}
      </div>
    );
  } else if (puedeInstalarNativo) {
    cuerpo = (
      <Button size="sm" className="h-8 gap-1.5" onClick={() => void instalar()}>
        <Download className="h-3.5 w-3.5" />
        {t("pwa.instalar.boton")}
      </Button>
    );
  } else {
    cuerpo = <p className="text-[13px] text-muted-foreground">{t("pwa.instalar.androidManual")}</p>;
  }

  return (
    <div
      data-testid="instalar-maven"
      className={cn(
        "relative rounded-2xl border border-primary/15 bg-primary/5 p-3.5",
        variante === "panel" && "border-border bg-muted/30",
        className,
      )}
    >
      {variante === "banner" && (
        <button
          type="button"
          onClick={posponer}
          aria-label={t("pwa.instalar.posponer")}
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
          <Smartphone className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1 space-y-2 pr-5">
          <div>
            <p className="text-sm font-semibold leading-tight">{t("pwa.instalar.titulo")}</p>
            {!instalada && plataforma !== "escritorio" && (
              <p className="mt-0.5 text-xs text-muted-foreground">{t("pwa.instalar.descripcion")}</p>
            )}
          </div>
          {cuerpo}
        </div>
      </div>
    </div>
  );
}
