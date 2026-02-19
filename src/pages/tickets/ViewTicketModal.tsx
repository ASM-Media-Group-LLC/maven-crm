import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil, Trash2, MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  COMPANIES,
  TEAM_MEMBERS,
  type TicketWithCreator,
  useTickets,
} from "./useTickets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: TicketWithCreator;
  onEdit: () => void;
  onDelete: () => void;
}

const priorityVariant: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
  urgent: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
};

const ViewTicketModal = ({ open, onOpenChange, ticket, onEdit, onDelete }: Props) => {
  const { updateTicket, useTicketComments, addComment } = useTickets();
  const commentsQuery = useTicketComments(ticket.id);
  const comments = commentsQuery.data || [];

  const [commentText, setCommentText] = useState("");

  const ticketNum = ticket.id.slice(0, 6).toUpperCase();
  const creatorHandle = ticket.creators?.instagram_handle || ticket.creators?.artistic_name || ticket.creators?.name || "—";
  const companyLabel = COMPANIES.find((c) => c.value === ticket.company)?.label;
  const assignedLabel = TEAM_MEMBERS.find((m) => m.value === ticket.assigned_to)?.label;

  const handleInlineUpdate = (field: string, value: string) => {
    updateTicket.mutate({ id: ticket.id, [field]: value });
  };

  const handleAddComment = () => {
    if (!commentText.trim()) return;
    addComment.mutate(
      { ticket_id: ticket.id, author_name: "Usuario", content: commentText.trim() },
      { onSuccess: () => setCommentText("") }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader className="pr-8">
          <DialogTitle className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono">#{ticketNum}</span>
            {ticket.title}
          </DialogTitle>
          {ticket.created_at && (
            <p className="text-xs text-muted-foreground">
              Creado el {format(new Date(ticket.created_at), "dd MMM yyyy, HH:mm", { locale: es })}
            </p>
          )}
        </DialogHeader>

        <div className="overflow-y-auto max-h-[60vh] space-y-4 pr-1">
          {/* Description */}
          {ticket.description && (
            <div>
              <h4 className="text-sm font-medium mb-1">Descripción</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ticket.description}</p>
            </div>
          )}

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">Creado por</h4>
              <p className="text-sm">@{creatorHandle}</p>
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">Compañía</h4>
              {companyLabel ? (
                <Badge variant="outline">{companyLabel}</Badge>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">Tipo</h4>
              <Badge variant="outline">{TYPE_LABELS[ticket.ticket_type] || ticket.ticket_type}</Badge>
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">Prioridad</h4>
              <Select value={ticket.priority} onValueChange={(v) => handleInlineUpdate("priority", v)}>
                <SelectTrigger className="w-[140px] h-8">
                  <Badge variant={priorityVariant[ticket.priority] || "secondary"}>
                    {PRIORITY_LABELS[ticket.priority] || ticket.priority}
                  </Badge>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">Estado</h4>
              <Select value={ticket.status} onValueChange={(v) => handleInlineUpdate("status", v)}>
                <SelectTrigger className="w-[140px] h-8">
                  <SelectValue>{STATUS_LABELS[ticket.status] || ticket.status}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">Asignado a</h4>
              <Select value={ticket.assigned_to || undefined} onValueChange={(v) => handleInlineUpdate("assigned_to", v === "__none__" ? "" : v)}>
                <SelectTrigger className="w-[180px] h-8">
                  <SelectValue placeholder="Sin asignar">{assignedLabel || "Sin asignar"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin asignar</SelectItem>
                  {TEAM_MEMBERS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {ticket.creator_notes && (
            <div>
              <h4 className="text-sm font-medium mb-1">Notas sobre el creator</h4>
              <p className="text-sm text-muted-foreground">{ticket.creator_notes}</p>
            </div>
          )}

          <Separator />

          {/* Comments */}
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Comentarios ({comments.length})
            </h4>

            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay comentarios aún</p>
            ) : (
              <div className="space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className="border rounded-md p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{c.author_name}</span>
                      {c.created_at && (
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(c.created_at), "dd MMM yyyy, HH:mm", { locale: es })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{c.content}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <Textarea
                placeholder="Escribe un comentario..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={2}
                className="flex-1"
              />
              <Button onClick={handleAddComment} disabled={addComment.isPending || !commentText.trim()} className="self-end">
                Agregar
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onEdit}>
            <Pencil className="h-4 w-4 mr-1" />
            Editar
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-1" />
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ViewTicketModal;
