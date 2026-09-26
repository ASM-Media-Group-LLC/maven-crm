import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import TelegramIcon from "@/components/icons/TelegramIcon";
import type { PromologEntry } from "./PromologEntryCard";
import { resultBadgeVariant } from "./promoResult";
import { displayPlatform } from "./promoScore";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: PromologEntry | null;
}

const NetworkIcon = ({ network }: { network: string }) => {
  switch (network) {
    case "instagram": return <InstagramIcon className="h-4 w-4" />;
    case "tiktok": return <TikTokIcon className="h-4 w-4" />;
    case "x": return <XIcon className="h-4 w-4" />;
    case "telegram": return <TelegramIcon className="h-4 w-4" />;
    default: return null;
  }
};

const networkLabel: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X / Twitter",
  telegram: "Telegram",
};

const ViewPromologEntryModal = ({ open, onOpenChange, entry }: Props) => {
  const { t } = useLanguage();
  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("promolog.promoDetail")}
            <Badge variant="outline" className="text-xs font-mono">#{entry.ticketNumber}</Badge>
          </DialogTitle>
          <DialogDescription>{t("promolog.entryFullInfo")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Model */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">{t("promolog.model")}</p>
            <p className="text-sm font-semibold">{entry.name}</p>
            {entry.handle && (
              <p className="text-xs text-muted-foreground">@{entry.handle}</p>
            )}
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">{t("common.date")}</p>
              <p className="text-sm">{entry.date}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">{t("promolog.time")}</p>
              <p className="text-sm">{entry.time}</p>
            </div>
          </div>

          {/* Network & Platform */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">{t("promolog.networkPlaceholder")}</p>
              <Badge variant="secondary-soft" className="gap-1.5 text-xs mt-1">
                <NetworkIcon network={entry.network} />
                {networkLabel[entry.network] || entry.network}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">{t("promolog.platform")}</p>
              <Badge variant="primary-soft" className="text-xs mt-1">
                {displayPlatform(entry) ?? "—"}
              </Badge>
            </div>
          </div>

          {/* Result — SIEMPRE binario (Sí/No). "revisar" y "no verificado" son
              marcas AL LADO, nunca reemplazan el resultado. */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">{t("promolog.result")}</p>
            <div className="flex items-center gap-1 mt-1">
              <Badge variant={resultBadgeVariant(entry.result)} className="text-xs">
                {entry.result === "Sí" ? t("promolog.yes") : t("promolog.no")}
              </Badge>
              {entry.needs_review ? (
                <span title={entry.error_reason ?? t("promolog.reviewManually")} className="text-warning" aria-label={t("promolog.reviewManually")}>
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
              ) : entry.is_pending ? (
                <span title={t("promolog.unconfirmedRead")} className="text-[10px] text-muted-foreground">{t("promolog.notVerifiedShort")}</span>
              ) : null}
            </div>
          </div>

          {/* Agent */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">{t("promolog.agent")}</p>
            <p className="text-sm">{entry.agent}</p>
          </div>

          {/* Notes */}
          {entry.notes && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">{t("promolog.notes")}</p>
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">{entry.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ViewPromologEntryModal;
