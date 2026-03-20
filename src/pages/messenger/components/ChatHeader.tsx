import {
  Video, Search, MoreVertical, ArrowLeft, Bell, FileText, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConversationWithDetails, UserProfile } from "../types";
import { cn } from "@/lib/utils";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { getStatusColor, getStatusLabel } from "./StatusPicker";
import { useAuth } from "@/hooks/useAuth";
import AvatarUpload from "./AvatarUpload";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ChatHeaderProps {
  conversation: ConversationWithDetails;
  profiles: Record<string, UserProfile>;
  typingUsers: string[];
  onSearchToggle: () => void;
  onBack: () => void;
  onStartVideoCall: (conv: ConversationWithDetails) => void;
  onOpenNotificationSettings: () => void;
  onOpenSharedFiles: () => void;
  onOpenGroupMembers?: () => void;
  onAvatarChanged?: () => void;
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function ChatHeader({
  conversation, profiles, typingUsers, searchOpen, searchQuery,
  onSearchToggle, onSearchChange, onBack, onStartVideoCall,
  onOpenNotificationSettings, onOpenSharedFiles, onOpenGroupMembers,
  onAvatarChanged,
}: ChatHeaderProps) {
  const { user } = useAuth();
  const { isOnline, getStatus } = useOnlinePresence();

  const isGroup = conversation.type === "group";
  const isAdmin = isGroup && conversation.participants.some(
    p => p.user_id === user?.id && p.role === "admin"
  );

  // Find the OTHER participant in direct chats
  const otherParticipant = !isGroup
    ? conversation.participants.find(p => p.user_id !== user?.id)
    : null;
  const otherUserId = otherParticipant?.user_id;
  const otherProfile = otherUserId ? profiles[otherUserId] : null;
  const online = otherUserId ? isOnline(otherUserId) : false;
  const status = otherUserId ? getStatus(otherUserId) : null;

  const typingNames = typingUsers
    .map(id => profiles[id]?.full_name?.split(" ")[0] || "Alguien")
    .join(", ");

  const onlineCount = isGroup
    ? conversation.participants.filter(p => isOnline(p.user_id)).length
    : 0;

  const subtitle = typingNames
    ? `${typingNames} ${typingUsers.length > 1 ? "están escribiendo..." : "está escribiendo..."}`
    : isGroup
      ? `${conversation.participants.length} miembros${onlineCount > 0 ? ` · ${onlineCount} en línea` : ""}`
      : online
        ? getStatusLabel(status, online)
        : "Desconectado";

  // Avatar URL: group avatar or other user's avatar
  const avatarUrl = isGroup
    ? conversation.avatar_url
    : otherProfile?.avatar_url;

  const handleGroupAvatarChange = async (url: string) => {
    const { error } = await supabase
      .from("chat_conversations")
      .update({ avatar_url: url })
      .eq("id", conversation.id);
    if (error) {
      toast.error("Error al actualizar avatar del grupo");
    } else {
      onAvatarChanged?.();
    }
  };

  const handleProfileAvatarChange = async (url: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", user.id);
    if (error) {
      toast.error("Error al actualizar tu avatar");
    } else {
      onAvatarChanged?.();
    }
  };

  return (
    <div className="shrink-0 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5">
        <Button variant="ghost" size="icon" className="sm:hidden shrink-0 h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="relative">
          {isGroup && isAdmin ? (
            <AvatarUpload
              currentUrl={avatarUrl}
              displayName={conversation.displayName}
              onAvatarChanged={handleGroupAvatarChange}
              size="sm"
              isGroup
              editable
            />
          ) : !isGroup ? (
            <AvatarUpload
              currentUrl={avatarUrl}
              displayName={conversation.displayName}
              onAvatarChanged={handleProfileAvatarChange}
              size="sm"
              editable={otherUserId === user?.id || !otherUserId}
            />
          ) : (
            <Avatar className="h-9 w-9 shrink-0">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={conversation.displayName} className="object-cover" />}
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {getInitials(conversation.displayName)}
              </AvatarFallback>
            </Avatar>
          )}
          {!isGroup && (
            <span className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card z-10",
              getStatusColor(status, online)
            )} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate leading-tight">
            {conversation.displayName}
          </p>
          {subtitle && (
            <p className={cn(
              "text-[11px] leading-tight mt-0.5",
              typingNames ? "text-primary animate-pulse" : online ? "text-success" : "text-muted-foreground"
            )}>
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onStartVideoCall(conversation)} title="Videollamada">
            <Video className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            onClick={onSearchToggle}
            title="Buscar"
          >
            <Search className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onOpenSharedFiles}>
                <FileText className="h-3.5 w-3.5 mr-2" /> Archivos compartidos
              </DropdownMenuItem>
              {isGroup && onOpenGroupMembers && (
                <DropdownMenuItem onClick={onOpenGroupMembers}>
                  <Users className="h-3.5 w-3.5 mr-2" /> Miembros del grupo
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onOpenNotificationSettings}>
                <Bell className="h-3.5 w-3.5 mr-2" /> Notificaciones
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-border bg-muted/20 animate-fade-in">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            placeholder="Buscar en la conversación..."
            className="h-7 bg-background text-sm"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            autoFocus
          />
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onSearchToggle}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
