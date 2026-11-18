import { useState } from "react";
import { CalendarClock, Clapperboard, FolderOpen, Upload } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { SubirAqui } from "@/components/aportar/SubirAqui";
import { ExploradorDeCarpeta } from "@/components/aportar/ExploradorDeCarpeta";
import type { PedidoDelLink } from "@/lib/aportar/api";
import type { TranslationKey } from "@/lib/i18n";

// EL LINK DE UN PEDIDO (Backstage, 18/11/2026): la modelo lo abre sin cuenta, ve
// qué tiene que grabar y hasta cuándo, y sube ahí mismo. Lo que sube cae en la
// carpeta del pedido y Backstage lo ve por la API (/contenido/pedidos).

/** «2026-11-25» → «25 nov 2026» en el idioma de la página, sin correrse de día. */
function fechaLegible(iso: string, idioma: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(idioma, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function PedidoParaGrabar({ token, pedido, carpetaId }: { token: string; pedido: PedidoDelLink; carpetaId: string | null }) {
  const { t, language } = useLanguage();
  const [version, setVersion] = useState(0);

  if (pedido.cancelado) {
    return (
      <div className="vidrio rounded-panel px-6 py-10 text-center text-sm text-muted-foreground">
        {t("drive.pedido.cancelado")}
      </div>
    );
  }

  const tipo = pedido.tipo && ["foto", "video", "audio"].includes(pedido.tipo) ? t(`drive.pedido.tipo.${pedido.tipo}` as TranslationKey) : null;

  return (
    <>
      <section className="vidrio flex flex-col gap-3 rounded-panel p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Clapperboard className="h-4 w-4 text-primary" />
          <span>{t("drive.pedido.queGrabar")}</span>
          {tipo && <span className="ml-auto rounded-control bg-primary/10 px-2 py-0.5 text-[11px] normal-case tracking-normal text-primary">{tipo}</span>}
        </div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{pedido.que_grabar}</p>
        {pedido.duracion && <p className="text-xs text-muted-foreground">{t("drive.pedido.duracion", { d: pedido.duracion })}</p>}
        {pedido.fecha_limite && (
          <p className="flex items-center gap-1.5 border-t border-border/40 pt-3 text-sm font-semibold text-foreground">
            <CalendarClock className="h-4 w-4 text-primary" />
            {t("drive.pedido.fechaLimite", { f: fechaLegible(pedido.fecha_limite, language) })}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Upload className="h-4 w-4 text-primary" />{t("drive.pedido.subeAqui")}</h2>
        <SubirAqui token={token} pedirNombre={false} alSubir={() => setVersion((v) => v + 1)} />
      </section>

      {carpetaId && (
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold"><FolderOpen className="h-4 w-4 text-primary" />{t("drive.pedido.loQueSubiste")}</h2>
          <ExploradorDeCarpeta token={token} raizId={carpetaId} modo="mios" puedeCompartir={false} version={version} />
        </section>
      )}

      <p className="text-center text-[11px] text-muted-foreground">{t("drive.pedido.pie")}</p>
    </>
  );
}
