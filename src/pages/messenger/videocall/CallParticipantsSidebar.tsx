import { X, MicOff, Hand, Crown, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import { LKParticipant } from "@/hooks/useLiveKit";
import { cn } from "@/lib/utils";

interface CallParticipantsSidebarProps {
  participants: LKParticipant[];
  isAdmin: boolean;
  onMuteParticipant: (identity: string) => void;
  onRemoveParticipant: (identity: string) => void;
  onClose: () => void;
}

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function CallParticipantsSidebar({
  participants, isAdmin, onMuteParticipant, onRemoveParticipant, onClose,
}: CallParticipantsSidebarProps) {
  const handRaisedFirst = [...participants].sort((a, b) => {
    if (a.isLocal) return -1;
    if (b.isLocal) return 1;
    if (a.handRaised && !b.handRaised) return -1;
    if (!a.handRaised && b.handRaised) return 1;
    return 0;
  });

  return (
    <div className="w-80 flex flex-col bg-[hsl(240_8%_10%)] border-l border-[hsl(0_0%_100%/0.1)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(0_0%_100%/0.1)]">
        <h3 className="text-sm font-semibold text-[hsl(0_0%_96%)]">
          Participantes ({participants.length})
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-[hsl(0_0%_96%/0.7)]" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-1">
          {handRaisedFirst.map((p) => (
            <div
              key={p.sid}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors",
                p.isSpeaking && "bg-primary/10"
              )}
            >
              <div className="relative">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-[10px] bg-primary/20 text-primary font-semibold">
                    {getInitials(p.name)}
                  </AvatarFallback>
                </Avatar>
                {p.isSpeaking && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-[hsl(240_8%_10%)]" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-[hsl(0_0%_96%)] truncate">
                    {p.isLocal ? "Tú" : p.name}
                  </span>
                  {p.isLocal && (
                    <Badge variant="secondary" className="text-[9px] h-4">Tú</Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {p.handRaised && <Hand className="h-4 w-4 text-amber-400" />}
                {p.isMuted && <MicOff className="h-3.5 w-3.5 text-destructive" />}

                {isAdmin && !p.isLocal && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-[hsl(0_0%_96%/0.5)]">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onMuteParticipant(p.identity)}>
                        <MicOff className="h-3.5 w-3.5 mr-2" /> Silenciar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onRemoveParticipant(p.identity)}
                        className="text-destructive"
                      >
                        <UserX className="h-3.5 w-3.5 mr-2" /> Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
