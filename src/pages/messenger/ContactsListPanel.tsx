import { useState, useMemo } from "react";
import { Search, ArrowLeft, MessageSquarePlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserProfile } from "./types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useOnlinePresence, UserStatus } from "@/hooks/useOnlinePresence";
import { getStatusColor, getStatusLabel } from "./components/StatusPicker";

interface ContactsListPanelProps {
  profiles: Record<string, UserProfile>;
  onSelectUser: (userId: string) => void;
  onClose: () => void;
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function ContactsListPanel({ profiles, onSelectUser, onClose }: ContactsListPanelProps) {
  const { user } = useAuth();
  const { isOnline, getStatus } = useOnlinePresence();
  const [search, setSearch] = useState("");

  const allUsers = useMemo(() => Object.values(profiles).filter(p => p.id !== user?.id), [profiles, user?.id]);

  const sorted = useMemo(() => {
    const filtered = allUsers.filter(p =>
      (p.full_name || "").toLowerCase().includes(search.toLowerCase())
    );
    return [...filtered].sort((a, b) => {
      const aOnline = isOnline(a.id);
      const bOnline = isOnline(b.id);
      if (aOnline && !bOnline) return -1;
      if (!aOnline && bOnline) return 1;
      return (a.full_name || "").localeCompare(b.full_name || "");
    });
  }, [allUsers, search, isOnline]);

  const onlineCount = useMemo(() => allUsers.filter(p => isOnline(p.id)).length, [allUsers, isOnline]);

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      {/* Header */}
      <div className="shrink-0 p-4 pb-3 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-foreground tracking-tight">Contactos</h2>
            <p className="text-xs text-muted-foreground">{onlineCount} en línea · {allUsers.length} total</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contactos..."
            className="pl-9 h-9 bg-muted/40 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 rounded-xl"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 pb-2">
          {/* Online section */}
          {sorted.some(p => isOnline(p.id)) && (
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">
              En línea — {onlineCount}
            </p>
          )}
          {sorted.filter(p => isOnline(p.id)).map(p => (
            <ContactRow key={p.id} profile={p} online={true} status={getStatus(p.id)} onClick={() => onSelectUser(p.id)} />
          ))}

          {/* Offline section */}
          {sorted.some(p => !isOnline(p.id)) && (
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2 mt-2">
              Desconectados
            </p>
          )}
          {sorted.filter(p => !isOnline(p.id)).map(p => (
            <ContactRow key={p.id} profile={p} online={false} status={null} onClick={() => onSelectUser(p.id)} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function ContactRow({ profile, online, status, onClick }: {
  profile: UserProfile;
  online: boolean;
  status: UserStatus | null;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 hover:bg-muted/50"
    >
      <div className="relative shrink-0">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="text-sm font-semibold bg-primary/10 text-primary">
            {getInitials(profile.full_name || "?")}
          </AvatarFallback>
        </Avatar>
        <span className={cn(
          "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card",
          getStatusColor(status, online)
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{profile.full_name || "Sin nombre"}</p>
        <p className="text-xs text-muted-foreground">
          {online ? (status ? getStatusLabel(status) : "En línea") : "Desconectado"}
        </p>
      </div>
      <MessageSquarePlus className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
    </button>
  );
}
