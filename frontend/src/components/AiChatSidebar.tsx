import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, MessageSquare } from "lucide-react";
import { AiConversation } from "@/hooks/useAiConversations";
import { format, isToday, isYesterday, isThisWeek } from "date-fns";
import { cn } from "@/lib/utils";

interface AiChatSidebarProps {
  conversations: AiConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

function groupConversations(conversations: AiConversation[]) {
  const groups: { label: string; items: AiConversation[] }[] = [
    { label: "Hoy", items: [] },
    { label: "Ayer", items: [] },
    { label: "Esta semana", items: [] },
    { label: "Anteriores", items: [] },
  ];

  for (const conv of conversations) {
    const date = new Date(conv.updated_at);
    if (isToday(date)) groups[0].items.push(conv);
    else if (isYesterday(date)) groups[1].items.push(conv);
    else if (isThisWeek(date)) groups[2].items.push(conv);
    else groups[3].items.push(conv);
  }

  return groups.filter((g) => g.items.length > 0);
}

export default function AiChatSidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: AiChatSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startEditing = (conv: AiConversation) => {
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  };

  const commitEdit = () => {
    if (editingId && editingTitle.trim()) {
      onRename(editingId, editingTitle.trim());
    }
    setEditingId(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") setEditingId(null);
  };

  const groups = groupConversations(conversations);

  return (
    <>
      <div className="flex w-full shrink-0 flex-col bg-background h-full min-w-0">
        {/* New Chat Button */}
        <div className="p-3 border-b border-border">
          <Button onClick={onCreate} className="w-full gap-2" size="sm">
            <Plus className="h-4 w-4" />
            Nuevo chat
          </Button>
        </div>

        {/* Conversations List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-4">
            {conversations.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                <MessageSquare className="h-8 w-8 opacity-40" />
                <p className="text-xs">Aún no hay conversaciones</p>
              </div>
            )}

            {groups.map((group) => (
              <div key={group.label}>
                <p className="mb-1 px-2 text-xs font-semibold text-muted-foreground">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.map((conv) => (
                    <div
                      key={conv.id}
                      className={cn(
                        "group relative flex items-center rounded-lg px-2.5 py-2 cursor-pointer transition-colors",
                        activeId === conv.id
                          ? "bg-muted text-foreground"
                          : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => editingId !== conv.id && onSelect(conv.id)}
                      onMouseEnter={() => setHoveredId(conv.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onDoubleClick={() => startEditing(conv)}
                    >
                      {editingId === conv.id ? (
                        <input
                          ref={inputRef}
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={handleEditKeyDown}
                          className="flex-1 bg-transparent text-sm text-foreground outline-none border-b border-primary"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="flex-1 text-sm leading-snug line-clamp-2">
                          {conv.title}
                        </span>
                      )}

                      {/* Action buttons on hover */}
                      {editingId !== conv.id && (hoveredId === conv.id || activeId === conv.id) && (
                        <div className="ml-2 flex items-center gap-1 shrink-0">
                          <button
                            className="rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditing(conv);
                            }}
                            title="Renombrar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="rounded-md p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteId(conv.id);
                            }}
                            title="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar conversación?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminarán todos los mensajes de esta conversación.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) onDelete(deleteId);
                setDeleteId(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
