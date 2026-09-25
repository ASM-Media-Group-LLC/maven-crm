import { X, MicOff, Hand, UserX, MoreVertical, MicVocal, Eye, Crown, PhoneOff } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LKParticipant } from "@/hooks/useLiveKit";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";

interface CallParticipantsSidebarProps {
  participants: LKParticipant[];
  isAdmin: boolean;
  onMuteParticipant: (identity: string) => void;
  onRemoveParticipant: (identity: string) => void;
  onClose: () => void;
  // Controles de anfitrión. Opcionales: una llamada 1:1 no los necesita, y así
  // este componente sigue sirviendo donde no hay moderación.
  onMuteAll?: () => void;
  onEndForAll?: () => void;
  onSetCanPublish?: (identity: string, canPublish: boolean) => void;
  onSetCohost?: (identity: string, isCohost: boolean) => void;
}


export default function CallParticipantsSidebar({
  participants, isAdmin, onMuteParticipant, onRemoveParticipant, onClose,
  onMuteAll, onEndForAll, onSetCanPublish, onSetCohost,
}: CallParticipantsSidebarProps) {
  const { t } = useLanguage();
  const handRaisedFirst = [...participants].sort((a, b) => {
    if (a.isLocal) return -1;
    if (b.isLocal) return 1;
    if (a.handRaised && !b.handRaised) return -1;
    if (!a.handRaised && b.handRaised) return 1;
    return 0;
  });

  return (
    <div className="w-80 max-sm:absolute max-sm:inset-y-0 max-sm:right-0 max-sm:w-full max-sm:z-30 flex flex-col bg-background border-l border-secondary rounded-l-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-secondary">
        <h3 className="text-sm font-medium text-foreground">
          {t("messenger.participants.titulo", { n: participants.length })}
        </h3>
        <button onClick={onClose} aria-label={t("common.close")} className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-0.5">
          {handRaisedFirst.map((p) => (
            <div
              key={`${p.identity}-${p.sid}`}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-card",
                p.isSpeaking && "bg-primary/10"
              )}
            >
              <div className="relative">
                <UserAvatar name={p.name} size="sm" />
                {p.isSpeaking && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success border-2 border-background" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-foreground truncate">
                    {p.isLocal ? t("messenger.preview.tu") : p.name}
                  </span>
                  {p.isLocal && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t("messenger.preview.tu")}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {p.handRaised && <Hand className="h-4 w-4 text-warning" />}
                {p.isMuted && (
                  <div className="h-5 w-5 rounded-full bg-destructive/20 flex items-center justify-center">
                    <MicOff className="h-3 w-3 text-destructive" />
                  </div>
                )}

                {/* Silenciar lo puede hacer cualquiera (como en Google), así que
                    el menú tiene sentido para todos; el resto de las acciones
                    siguen siendo del anfitrión y se ocultan más abajo. */}
                {!p.isLocal && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button aria-label={t("messenger.tile.masOpcionesPara", { name: p.name })} className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-[200] bg-card border-border">
                      {/* Cualquiera puede silenciar a quien dejó el micrófono
                          abierto — el servidor lo ejecuta de verdad y verifica
                          que quien lo pide esté en la llamada. Nadie puede
                          DES-silenciar a otro: eso solo lo hace su dueño. */}
                      {!p.isMuted && (
                        <DropdownMenuItem onClick={() => onMuteParticipant(p.identity)} className="text-foreground focus:bg-muted">
                          <MicOff className="h-3.5 w-3.5 mr-2" /> {t("messenger.participants.silenciar")}
                        </DropdownMenuItem>
                      )}
                      {isAdmin && onSetCanPublish && (
                        <>
                          <DropdownMenuItem onClick={() => onSetCanPublish(p.identity, false)} className="text-foreground focus:bg-muted">
                            <Eye className="h-3.5 w-3.5 mr-2" /> {t("messenger.participants.soloOyente")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onSetCanPublish(p.identity, true)} className="text-foreground focus:bg-muted">
                            <MicVocal className="h-3.5 w-3.5 mr-2" /> {t("messenger.participants.devolverPalabra")}
                          </DropdownMenuItem>
                        </>
                      )}
                      {isAdmin && onSetCohost && (
                        <DropdownMenuItem onClick={() => onSetCohost(p.identity, true)} className="text-foreground focus:bg-muted">
                          <Crown className="h-3.5 w-3.5 mr-2" /> {t("messenger.participants.hacerCoanfitrion")}
                        </DropdownMenuItem>
                      )}
                      {isAdmin && (
                        <DropdownMenuItem onClick={() => onRemoveParticipant(p.identity)} className="text-destructive focus:bg-muted">
                          <UserX className="h-3.5 w-3.5 mr-2" /> {t("common.delete")}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {isAdmin && (onMuteAll || onEndForAll) && (
        <div className="border-t border-secondary p-3 flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">
            {t("messenger.participants.controlesAnfitrion")}
          </span>
          {onMuteAll && (
            <button
              onClick={onMuteAll}
              className="flex items-center gap-2 text-xs text-foreground hover:bg-secondary rounded-lg px-2 py-1.5 transition-colors"
            >
              <MicOff className="h-3.5 w-3.5" /> {t("messenger.participants.silenciarATodos")}
            </button>
          )}
          {onEndForAll && (
            <button
              onClick={onEndForAll}
              className="flex items-center gap-2 text-xs text-destructive hover:bg-secondary rounded-lg px-2 py-1.5 transition-colors"
            >
              <PhoneOff className="h-3.5 w-3.5" /> {t("messenger.participants.terminarParaTodos")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
