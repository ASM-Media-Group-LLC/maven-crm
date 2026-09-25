// Lista compacta de promos para CELULAR: una fila de ~64 px por creadora/día
// (avatar, nombre, redes leídas, hora, veredicto Sí/No) en vez de la tabla de 8
// columnas (se cortaba a mitad de palabra) o las tarjetas de 250 px (entraban 2
// por pantalla). Tocar la fila abre el mismo detalle que en escritorio; editar y
// borrar viven ahí. Paginado por "Ver más" para no dibujar 500 filas de golpe.
import { useState } from "react";
import { AlertTriangle, ChevronRight, Facebook as FacebookIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import TelegramIcon from "@/components/icons/TelegramIcon";
import { resultBadgeVariant } from "./promoResult";
import type { PromologEntry } from "./PromologEntryCard";
import { useLanguage } from "@/hooks/useLanguage";

const PAGE = 30;

const NetIcon = ({ network }: { network: string }) => {
  const n = network.toLowerCase();
  if (n === "instagram") return <InstagramIcon className="h-3.5 w-3.5" />;
  if (n === "tiktok") return <TikTokIcon className="h-3.5 w-3.5" />;
  if (n === "telegram") return <TelegramIcon className="h-3.5 w-3.5" />;
  if (n === "facebook") return <FacebookIcon className="h-3.5 w-3.5" />;
  return <XIcon className="h-3.5 w-3.5" />;
};

interface Props {
  entries: PromologEntry[];
  onView: (entry: PromologEntry) => void;
}

export default function PromologMobileList({ entries, onView }: Props) {
  const { t } = useLanguage();
  const [shown, setShown] = useState(PAGE);
  const visible = entries.slice(0, shown);

  if (entries.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t("promolog.noPromosWithFilters")}</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <ul className="divide-y">
        {visible.map((e) => {
          const nets = (e.networks?.length ? e.networks : [e.network]).filter(Boolean);
          const promoted = new Set(e.promotedNetworks ?? []);
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onView(e)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-muted/40"
              >
                <UserAvatar name={e.name} src={e.profile_photo_url} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">{e.name}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      {nets.map((n) => (
                        <span key={n} className={promoted.has(n) ? "text-foreground" : "text-muted-foreground/40"}>
                          <NetIcon network={n} />
                        </span>
                      ))}
                    </span>
                    <span className="truncate">{e.time}{e.handle ? ` · @${e.handle}` : ""}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {e.needs_review ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-label={t("promolog.review")} />
                  ) : e.is_pending ? (
                    <span className="text-[10px] text-muted-foreground">{t("promolog.notVerifiedShort")}</span>
                  ) : null}
                  <Badge variant={resultBadgeVariant(e.result)} className="text-xs">{e.result === "Sí" ? t("promolog.yes") : t("promolog.no")}</Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {shown < entries.length && (
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShown((n) => n + PAGE)}>
            {t("promolog.showMoreRemaining", { count: entries.length - shown })}
          </Button>
        </div>
      )}
    </div>
  );
}
