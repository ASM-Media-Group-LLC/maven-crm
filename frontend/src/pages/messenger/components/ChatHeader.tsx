import { useState, useRef, useEffect } from "react";
import {
  Video, Search, MoreVertical, ArrowLeft, Bell, FileText, Users,
  Pin, PinOff, Archive, Trash2, Settings, Pencil, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ConversationWithDetails, UserProfile } from "../types";
import { cn } from "@/lib/utils";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { getStatusColor, getStatusLabel } from "./StatusPicker";
import { useAuth } from "@/hooks/useAuth";
import AvatarUpload from "./AvatarUpload";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getInitials, puedeVerLaListaDeMiembros } from "../utils";

interface ChatHeaderProps {
  conversation: ConversationWithDetails;
  profiles: Record<string, UserProfile>;
  typingUsers: string[];
  onSearchToggle: () => void;
  onBack: () => void;
  onStartVideoCall: (conv: ConversationWithDetails) => void;
  onOpenProfile?: (userId: string) => void;
  onOpenNotificationSettings: () => void;
  onOpenSharedFiles: () => void;
  onOpenGroupMembers?: () => void;
  onAvatarChanged?: () => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
  // Se llegó a este chat desde una MENCIÓN en otro chat: botón para volver a
  // ese grupo (salto y vuelta). Ausente = entrada normal, sin botón.
  returnTo?: { name: string; onBack: () => void } | null;
}

export default function ChatHeader({
  conversation, profiles, typingUsers, returnTo,
  onSearchToggle, onBack, onStartVideoCall, onOpenProfile,
  onOpenNotificationSettings, onOpenSharedFiles, onOpenGroupMembers,
  onAvatarChanged,
  isPinned, onTogglePin, onArchive, onDelete, canDelete,
}: ChatHeaderProps) {
  const { user } = useAuth();
  const { isOnline, getStatus, getStatusText, getStatusColorPersonal } = useOnlinePresence();

  const isGroup = conversation.type === "group";
  const isAdmin = isGroup && conversation.participants.some(
    p => p.user_id === user?.id && p.role === "admin"
  );
  // "Ver miembros solo admins": a un no-admin le ocultamos la lista y el conteo.
  const canSeeMembers = puedeVerLaListaDeMiembros(conversation, user?.id);
  // "Editar info solo admins": quién puede cambiar nombre/foto del grupo (default 'admins').
  const canEditInfo = isAdmin || (conversation.info_permission ?? "admins") === "all";
  // Click en el nombre abre el panel SOLO si puedes verlo (admin siempre; no-admin solo si
  // members_visibility='all'). Antes se colaba el panel de miembros ignorando el candado.
  const nameOpensPanel = isGroup && !!onOpenGroupMembers && canSeeMembers;

  // Renombrar el grupo desde el encabezado (lápiz al lado del nombre).
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);
  const startRename = () => { setNameValue(conversation.name || conversation.displayName); doneRef.current = false; setEditingName(true); };
  const cancelRename = () => { doneRef.current = true; setEditingName(false); };
  const saveRename = async () => {
    if (doneRef.current) return; // evita doble-guardado (blur tras Enter/click)
    doneRef.current = true;
    setEditingName(false);
    const v = nameValue.trim();
    if (!v || v === (conversation.name || conversation.displayName)) return;
    const { data, error } = await supabase
      .from("chat_conversations").update({ name: v }).eq("id", conversation.id).select("id");
    if (error || !data || data.length === 0) { toast.error("No se pudo cambiar el nombre"); return; }
    await supabase.from("chat_messages").insert({
      conversation_id: conversation.id, sender_id: user!.id, type: "system",
      content: `${profiles[user?.id ?? ""]?.full_name || "Alguien"} cambió el nombre del grupo a "${v}"`,
    });
    onAvatarChanged?.();
  };
  useEffect(() => { if (editingName) { nameInputRef.current?.focus(); nameInputRef.current?.select(); } }, [editingName]);

  const otherParticipant = !isGroup
    ? conversation.participants.find(p => p.user_id !== user?.id)
    : null;
  const otherUserId = otherParticipant?.user_id;
  const otherProfile = otherUserId ? profiles[otherUserId] : null;
  const online = otherUserId ? isOnline(otherUserId) : false;
  const status = otherUserId ? getStatus(otherUserId) : null;
  const colorPersonal = otherUserId ? getStatusColorPersonal(otherUserId) : null;
  // Estado personalizado de la otra persona (texto libre): si lo tiene, manda sobre
  // la etiqueta fija ("Disponible"/"Ausente"), como en Google Chat.
  const statusText = otherUserId ? getStatusText(otherUserId) : "";

  const typingNames = typingUsers
    .map(id => profiles[id]?.full_name?.split(" ")[0] || "Alguien")
    .join(", ");

  const onlineCount = isGroup
    ? conversation.participants.filter(p => isOnline(p.user_id)).length
    : 0;

  const subtitle = typingNames
    ? `${typingNames} ${typingUsers.length > 1 ? "están escribiendo..." : "está escribiendo..."}`
    : isGroup
      ? (canSeeMembers ? `${conversation.participants.length} miembros${onlineCount > 0 ? ` · ${onlineCount} en línea` : ""}` : "Grupo")
      : statusText
        ? statusText
        : online
          ? getStatusLabel(status, online)
          : "Desconectado";

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
    <div className="shrink-0 bg-primary/[0.03]">
      <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5">
        <Button variant="ghost" size="icon" aria-label="Volver a la lista de chats" className="md:hidden shrink-0 h-9 w-9 rounded-full hover:bg-primary/8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* Volver al grupo desde el que se clickeó la mención (también en desktop). */}
        {returnTo && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Volver a ${returnTo.name}`}
            title={`Volver a ${returnTo.name}`}
            className="shrink-0 h-9 w-9 rounded-full text-primary hover:bg-primary/8"
            onClick={returnTo.onBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}

        <div className="relative">
          {isGroup && canEditInfo ? (
            <AvatarUpload
              currentUrl={avatarUrl}
              displayName={conversation.displayName}
              onAvatarChanged={handleGroupAvatarChange}
              size="sm"
              isGroup
              editable
            />
          ) : !isGroup && otherUserId && otherUserId !== user?.id ? (
            // Avatar de la otra persona: click → abre su ficha de Karma Points.
            <button
              type="button"
              onClick={() => onOpenProfile?.(otherUserId)}
              title="Ver ficha"
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <AvatarUpload
                currentUrl={avatarUrl}
                seed={otherProfile?.avatar_seed}
                displayName={conversation.displayName}
                onAvatarChanged={handleProfileAvatarChange}
                size="sm"
                editable={false}
              />
            </button>
          ) : !isGroup ? (
            <AvatarUpload
              currentUrl={avatarUrl}
              seed={otherProfile?.avatar_seed}
              displayName={conversation.displayName}
              onAvatarChanged={handleProfileAvatarChange}
              size="sm"
              editable={otherUserId === user?.id || !otherUserId}
            />
          ) : (
            /* Avatar de GRUPO (miembro sin admin): conserva su estilo actual, no es una persona */
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
              getStatusColor(status, online, colorPersonal)
            )} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                ref={nameInputRef}
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); saveRename(); }
                  if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
                }}
                onBlur={saveRename}
                maxLength={60}
                className="flex-1 min-w-0 bg-transparent border-b border-primary/50 text-sm font-semibold text-foreground outline-none py-0.5"
              />
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={saveRename} className="shrink-0 text-primary hover:opacity-80" aria-label="Guardar nombre">
                <Check className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <p
                className={cn("font-semibold text-sm text-foreground truncate leading-tight", nameOpensPanel && "cursor-pointer hover:underline")}
                onClick={nameOpensPanel ? onOpenGroupMembers : undefined}
                title={nameOpensPanel ? "Ver configuración del grupo" : undefined}
              >
                {conversation.displayName}
              </p>
              {isGroup && canEditInfo && (
                <button type="button" onClick={startRename} className="shrink-0 text-muted-foreground hover:text-primary transition-colors" title="Editar nombre" aria-label="Editar nombre del grupo">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
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
          <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8 rounded-full hover:bg-primary/8" onClick={() => onStartVideoCall(conversation)} title="Videollamada">
            <Video className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8 rounded-full hover:bg-primary/8"
            onClick={onSearchToggle}
            title="Buscar"
          >
            <Search className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Más opciones del chat" className="h-9 w-9 sm:h-8 sm:w-8 rounded-full hover:bg-primary/8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-2xl">
              {onTogglePin && (
                <DropdownMenuItem onClick={onTogglePin}>
                  {isPinned ? <PinOff className="h-3.5 w-3.5 mr-2" /> : <Pin className="h-3.5 w-3.5 mr-2" />}
                  {isPinned ? "Desanclar" : "Anclar"}
                </DropdownMenuItem>
              )}
              {onArchive && (
                <DropdownMenuItem onClick={onArchive}>
                  <Archive className="h-3.5 w-3.5 mr-2" /> Archivar
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onOpenSharedFiles}>
                <FileText className="h-3.5 w-3.5 mr-2" /> Archivos compartidos
              </DropdownMenuItem>
              {isGroup && isAdmin && onOpenGroupMembers && (
                <DropdownMenuItem onClick={onOpenGroupMembers}>
                  <Settings className="h-3.5 w-3.5 mr-2" /> Configuración del grupo
                </DropdownMenuItem>
              )}
              {isGroup && canSeeMembers && onOpenGroupMembers && (
                <DropdownMenuItem onClick={onOpenGroupMembers}>
                  <Users className="h-3.5 w-3.5 mr-2" /> Miembros del grupo
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onOpenNotificationSettings}>
                <Bell className="h-3.5 w-3.5 mr-2" /> Notificaciones
              </DropdownMenuItem>
              {canDelete && onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Eliminar {isGroup ? "grupo" : "chat"}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
