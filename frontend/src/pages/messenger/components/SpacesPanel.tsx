import { useState, useMemo } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, FolderOpen, GripVertical, X, Mail, Edit2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserAvatar } from "@/components/UserAvatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { ChatSpace } from "@/hooks/useSpaces";
import { ConversationWithDetails } from "../types";
import { Users } from "lucide-react";

interface SpacesPanelProps {
  spaces: ChatSpace[];
  conversations: ConversationWithDetails[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onCreateSpace: (name: string) => Promise<string | null>;
  onDeleteSpace: (spaceId: string) => Promise<boolean>;
  onRenameSpace: (spaceId: string, name: string) => Promise<boolean>;
  onAddConversation: (spaceId: string, conversationId: string) => Promise<boolean>;
  onRemoveConversation: (spaceId: string, conversationId: string) => Promise<boolean>;
  onDragStart?: (conversationId: string) => void;
  draggingChatId?: string | null;
}

export default function SpacesPanel({
  spaces, conversations, activeChatId, onSelectChat,
  onCreateSpace, onDeleteSpace, onRenameSpace,
  onAddConversation, onRemoveConversation,
  draggingChatId,
}: SpacesPanelProps) {
  const [newSpaceName, setNewSpaceName] = useState("");
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set());
  const [editingSpaceId, setEditingSpaceId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [dragOverSpaceId, setDragOverSpaceId] = useState<string | null>(null);

  const convMap = useMemo(() => {
    const map: Record<string, ConversationWithDetails> = {};
    conversations.forEach(c => { map[c.id] = c; });
    return map;
  }, [conversations]);

  const toggleExpand = (spaceId: string) => {
    setExpandedSpaces(prev => {
      const next = new Set(prev);
      if (next.has(spaceId)) next.delete(spaceId); else next.add(spaceId);
      return next;
    });
  };

  const handleCreateSpace = async () => {
    if (!newSpaceName.trim()) return;
    setCreatingSpace(true);
    const id = await onCreateSpace(newSpaceName.trim());
    if (id) {
      setExpandedSpaces(prev => new Set(prev).add(id));
    }
    setNewSpaceName("");
    setShowCreateInput(false);
    setCreatingSpace(false);
  };

  const handleStartRename = (space: ChatSpace) => {
    setEditingSpaceId(space.id);
    setEditName(space.name);
  };

  const handleConfirmRename = async (spaceId: string) => {
    if (editName.trim()) {
      await onRenameSpace(spaceId, editName.trim());
    }
    setEditingSpaceId(null);
  };

  const handleDragOver = (e: React.DragEvent, spaceId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverSpaceId(spaceId);
  };

  const handleDragLeave = () => {
    setDragOverSpaceId(null);
  };

  const handleDrop = async (e: React.DragEvent, spaceId: string) => {
    e.preventDefault();
    setDragOverSpaceId(null);
    const conversationId = e.dataTransfer.getData("conversationId");
    if (conversationId) {
      await onAddConversation(spaceId, conversationId);
    }
  };

  const getSpaceUnreadCount = (space: ChatSpace) => {
    return space.conversationIds.reduce((sum, cid) => {
      const conv = convMap[cid];
      return sum + (conv?.unreadCount || 0);
    }, 0);
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <FolderOpen className="h-3.5 w-3.5" />
          Espacios
        </span>
        <Button
          variant="ghost" size="icon" className="h-6 w-6"
          onClick={() => setShowCreateInput(!showCreateInput)}
          title="Crear espacio"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Create input */}
      {showCreateInput && (
        <div className="px-3 pb-1.5 flex gap-1.5">
          <Input
            placeholder="Nombre del espacio..."
            value={newSpaceName}
            onChange={e => setNewSpaceName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleCreateSpace(); if (e.key === "Escape") setShowCreateInput(false); }}
            className="h-7 text-xs"
            autoFocus
            disabled={creatingSpace}
          />
          <Button size="icon" className="h-7 w-7 shrink-0" onClick={handleCreateSpace} disabled={creatingSpace || !newSpaceName.trim()}>
            <Check className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Space list */}
      {spaces.length === 0 && !showCreateInput && (
        <p className="text-[11px] text-muted-foreground px-3 py-1">
          Crea un espacio para organizar tus chats
        </p>
      )}

      {spaces.map(space => {
        const isExpanded = expandedSpaces.has(space.id);
        const unread = getSpaceUnreadCount(space);
        const isDragOver = dragOverSpaceId === space.id;

        return (
          <div key={space.id}>
            <div
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-2xl mx-1 cursor-pointer transition-all text-sm",
                isDragOver && "bg-primary/15 ring-1 ring-primary/40",
                !isDragOver && "hover:bg-primary/5"
              )}
              onClick={() => toggleExpand(space.id)}
              onDragOver={(e) => handleDragOver(e, space.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, space.id)}
            >
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              <span className="text-sm shrink-0">{space.icon}</span>

              {editingSpaceId === space.id ? (
                <Input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleConfirmRename(space.id); if (e.key === "Escape") setEditingSpaceId(null); }}
                  onBlur={() => handleConfirmRename(space.id)}
                  className="h-6 text-xs flex-1"
                  autoFocus
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="text-xs font-medium text-foreground truncate flex-1">{space.name}</span>
              )}

              {unread > 0 && (
                <Badge className="h-4 min-w-4 px-1 text-[9px] bg-primary text-primary-foreground rounded-full shrink-0 font-bold">
                  {unread > 99 ? "99+" : unread}
                </Badge>
              )}

              <Button
                variant="ghost" size="icon" className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); handleStartRename(space); }}
                title="Renombrar"
              >
                <Edit2 className="h-3 w-3" />
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost" size="icon" className="h-5 w-5 shrink-0 text-destructive hover:text-destructive"
                    onClick={e => e.stopPropagation()}
                    title="Eliminar espacio"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar espacio "{space.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Los chats dentro del espacio no se eliminarán, solo se quitará la organización.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDeleteSpace(space.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Expanded conversations */}
            {isExpanded && (
              <div className="ml-6 mr-1 space-y-0.5 mt-0.5">
                {space.conversationIds.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground py-1 px-2 italic">
                    Arrastra un chat aquí
                  </p>
                ) : (
                  space.conversationIds.map(cid => {
                    const conv = convMap[cid];
                    if (!conv) return null;
                    const isGroup = conv.type === "group";
                    return (
                      <div
                        key={cid}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded-2xl cursor-pointer transition-colors group",
                          activeChatId === cid ? "bg-primary/12" : "hover:bg-primary/5"
                        )}
                        onClick={() => onSelectChat(cid)}
                      >
                        {isGroup ? (
                          /* Avatar de GRUPO: conserva su icono actual, no es una persona */
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-[9px] font-semibold bg-primary/10 text-primary">
                              <Users className="h-3 w-3" />
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <UserAvatar name={conv.displayName} src={conv.avatar_url} size="xs" />
                        )}
                        <span className="text-xs truncate flex-1 text-foreground">{conv.displayName}</span>
                        {conv.unreadCount > 0 && (
                          <Badge className="h-4 min-w-4 px-1 text-[9px] bg-primary text-primary-foreground rounded-full font-bold">
                            {conv.unreadCount}
                          </Badge>
                        )}
                        <Button
                          variant="ghost" size="icon"
                          className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); onRemoveConversation(space.id, cid); }}
                          title="Quitar del espacio"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
