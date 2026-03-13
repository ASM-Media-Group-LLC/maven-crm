import { X, MicOff, Hand, UserX, MoreVertical } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
    <div className="w-80 flex flex-col bg-[hsl(220_3%_17%)] border-l border-[hsl(220_3%_25%)] rounded-l-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(220_3%_25%)]">
        <h3 className="text-sm font-medium text-[hsl(220_3%_85%)]">
          Participantes ({participants.length})
        </h3>
        <button onClick={onClose} className="h-7 w-7 rounded-full flex items-center justify-center text-[hsl(220_3%_60%)] hover:bg-[hsl(220_3%_25%)] transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-0.5">
          {handRaisedFirst.map((p) => (
            <div
              key={`${p.identity}-${p.sid}`}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[hsl(220_3%_22%)]",
                p.isSpeaking && "bg-[hsl(214_82%_51%/0.08)]"
              )}
            >
              <div className="relative">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-[10px] bg-[hsl(220_50%_45%)] text-white font-medium">
                    {getInitials(p.name)}
                  </AvatarFallback>
                </Avatar>
                {p.isSpeaking && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[hsl(145_63%_49%)] border-2 border-[hsl(220_3%_17%)]" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-[hsl(220_3%_85%)] truncate">
                    {p.isLocal ? "Tú" : p.name}
                  </span>
                  {p.isLocal && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[hsl(220_3%_28%)] text-[hsl(220_3%_60%)]">Tú</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {p.handRaised && <Hand className="h-4 w-4 text-[hsl(40_96%_50%)]" />}
                {p.isMuted && (
                  <div className="h-5 w-5 rounded-full bg-[hsl(0_72%_51%/0.2)] flex items-center justify-center">
                    <MicOff className="h-3 w-3 text-[hsl(0_72%_51%)]" />
                  </div>
                )}

                {!p.isLocal && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="h-7 w-7 rounded-full flex items-center justify-center text-[hsl(220_3%_55%)] hover:bg-[hsl(220_3%_28%)] transition-colors">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-[hsl(220_3%_22%)] border-[hsl(220_3%_30%)]">
                      {!p.isMuted && (
                        <DropdownMenuItem onClick={() => onMuteParticipant(p.identity)} className="text-[hsl(220_3%_85%)] focus:bg-[hsl(220_3%_28%)]">
                          <MicOff className="h-3.5 w-3.5 mr-2" /> Silenciar
                        </DropdownMenuItem>
                      )}
                      {isAdmin && (
                        <DropdownMenuItem onClick={() => onRemoveParticipant(p.identity)} className="text-[hsl(0_72%_65%)] focus:bg-[hsl(220_3%_28%)]">
                          <UserX className="h-3.5 w-3.5 mr-2" /> Eliminar
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
    </div>
  );
}
