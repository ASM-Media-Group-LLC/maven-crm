import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ClipboardList,
  Plus,
  Eye,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Guideline = Tables<"creator_guidelines">;

const GUIDELINE_TYPES = [
  { value: "Operativo", label: "Operativo" },
  { value: "Contenido", label: "Contenido" },
  { value: "Ventas", label: "Ventas" },
  { value: "Comunicación", label: "Comunicación" },
];

const typeBadgeVariant: Record<string, "default" | "secondary" | "outline"> = {
  Operativo: "default",
  Contenido: "secondary",
  Ventas: "outline",
  Comunicación: "secondary",
};

const PLACEHOLDER_USER_ID = "00000000-0000-0000-0000-000000000000";

interface Props {
  creatorId: string;
}

interface FormData {
  title: string;
  guideline_type: string;
  content: string;
}

const emptyForm: FormData = { title: "", guideline_type: "", content: "" };

const LineamientosTabContent = ({ creatorId }: Props) => {
  const queryClient = useQueryClient();
  const queryKey = ["creator_guidelines", creatorId];

  const [modalOpen, setModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<Guideline | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);

  // --- Queries & Mutations ---
  const { data: guidelines = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_guidelines")
        .select("*")
        .eq("creator_id", creatorId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Guideline[];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: FormData & { id?: string }) => {
      if (payload.id) {
        const { error } = await supabase
          .from("creator_guidelines")
          .update({
            title: payload.title,
            guideline_type: payload.guideline_type,
            content: payload.content,
          })
          .eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("creator_guidelines").insert({
          title: payload.title,
          guideline_type: payload.guideline_type,
          content: payload.content,
          creator_id: creatorId,
          created_by: PLACEHOLDER_USER_ID,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(editingId ? "Lineamiento actualizado" : "Lineamiento creado");
      closeModal();
    },
    onError: () => toast.error("Error al guardar lineamiento"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("creator_guidelines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Lineamiento eliminado");
      setDeleteId(null);
    },
    onError: () => toast.error("Error al eliminar"),
  });

  // --- Handlers ---
  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (g: Guideline) => {
    setEditingId(g.id);
    setForm({ title: g.title, guideline_type: g.guideline_type, content: g.content });
    setModalOpen(true);
  };

  const openView = (g: Guideline) => {
    setViewItem(g);
    setViewModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = () => {
    if (!form.title.trim() || !form.guideline_type || !form.content.trim()) {
      toast.error("Completa todos los campos");
      return;
    }
    upsertMutation.mutate({ ...form, id: editingId ?? undefined });
  };

  // --- Render ---
  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">Cargando lineamientos…</div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold text-base leading-tight">Lineamientos Operativos</h3>
            <p className="text-xs text-muted-foreground">{guidelines.length} registrados</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={guidelines.length === 0} onClick={() => guidelines.length > 0 && openView(guidelines[0])} className="gap-1.5">
            <Eye className="h-4 w-4" /> Ver
          </Button>
          <Button size="sm" variant="outline" onClick={openAdd} className="gap-1.5">
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {guidelines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/40 flex flex-col items-center justify-center py-16 gap-3">
          <ClipboardList className="h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium text-muted-foreground">Sin lineamientos</p>
          <p className="text-sm text-muted-foreground/70">Documenta cómo manejar esta cuenta</p>
          <Button variant="outline" size="sm" onClick={openAdd} className="gap-1.5 mt-2">
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        </div>
      ) : (
        /* Guidelines list */
        <div className="space-y-3">
          {guidelines.map((g) => (
            <div
              key={g.id}
              className="rounded-lg border border-border bg-card p-4 flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{g.title}</span>
                  <Badge variant={typeBadgeVariant[g.guideline_type] ?? "secondary"} className="text-xs">
                    {g.guideline_type}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{g.content}</p>
                {g.created_at && (
                  <p className="text-xs text-muted-foreground/60">
                    {format(new Date(g.created_at), "d MMM yyyy", { locale: es })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openView(g)}>
                  <Eye className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(g)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(g.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => !o && closeModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Lineamiento" : "Nuevo Lineamiento"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Modifica los campos y guarda los cambios." : "Completa los campos para agregar un lineamiento."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ej: Horario de publicación"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={form.guideline_type}
                onValueChange={(v) => setForm((f) => ({ ...f, guideline_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {GUIDELINE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Contenido</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Describe el lineamiento…"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeModal}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={viewModalOpen} onOpenChange={setViewModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{viewItem?.title}</DialogTitle>
            <DialogDescription>
              {viewItem?.guideline_type}
              {viewItem?.created_at &&
                ` · ${format(new Date(viewItem.created_at), "d MMM yyyy", { locale: es })}`}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap">{viewItem?.content}</p>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar lineamiento?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LineamientosTabContent;
