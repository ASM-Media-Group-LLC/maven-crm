import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { CATEGORIES } from "./lineamientos/categoriesConfig";
import GuidelineItemRow from "./lineamientos/GuidelineItemRow";

type Guideline = Tables<"creator_guidelines">;

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

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [prefilled, setPrefilled] = useState(false);

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

  // Index guidelines by "category::title" for quick lookup
  const guidelineMap = useMemo(() => {
    const map = new Map<string, Guideline>();
    guidelines.forEach((g) => map.set(`${g.guideline_type}::${g.title}`, g));
    return map;
  }, [guidelines]);

  const upsertMutation = useMutation({
    mutationFn: async (payload: FormData & { id?: string }) => {
      if (payload.id) {
        const { error } = await supabase
          .from("creator_guidelines")
          .update({ content: payload.content })
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
  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const openAddForItem = (category: string, title: string) => {
    setEditingId(null);
    setForm({ title, guideline_type: category, content: "" });
    setPrefilled(true);
    setModalOpen(true);
  };

  const openEdit = (g: Guideline) => {
    setEditingId(g.id);
    setForm({ title: g.title, guideline_type: g.guideline_type, content: g.content });
    setPrefilled(true);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setPrefilled(false);
  };

  const handleSubmit = () => {
    if (!form.content.trim()) {
      toast.error("Escribe el contenido del lineamiento");
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
    <div className="space-y-6 mt-4">
      {CATEGORIES.map((cat) => (
        <div key={cat.category}>
          {/* Category header */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {cat.category}
            </h3>
          </div>

          {/* Items list */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {cat.items.map((item) => {
              const key = `${cat.category}::${item.title}`;
              const guideline = guidelineMap.get(key);
              return (
                <GuidelineItemRow
                  key={key}
                  item={item}
                  guideline={guideline}
                  expanded={expandedKeys.has(key)}
                  onToggle={() => toggleExpand(key)}
                  onAdd={() => openAddForItem(cat.category, item.title)}
                  onEdit={openEdit}
                  onDelete={(id) => setDeleteId(id)}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* Add / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => !o && closeModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Lineamiento" : "Nuevo Lineamiento"}</DialogTitle>
            <DialogDescription>
              {form.guideline_type && form.title
                ? `${form.guideline_type} · ${form.title}`
                : editingId
                  ? "Modifica el contenido y guarda los cambios."
                  : "Completa el contenido del lineamiento."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Contenido</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Describe el lineamiento…"
                rows={6}
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
