import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardList, Eye, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { TranslationKey } from "@/lib/i18n";
import { useLanguage } from "@/hooks/useLanguage";

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

// El nombre que se MUESTRA de una categoría guardada (guideline_type). Lo que no
// está en el catálogo (categorías creadas a mano, slugs viejos) se muestra tal cual.
const categoriaVisible = (t: (k: TranslationKey) => string, guardada: string) => {
  const cat = CATEGORIES.find((c) => c.category === guardada);
  return cat ? t(cat.label) : guardada;
};

const LineamientosTabContent = ({ creatorId }: Props) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const queryKey = ["creator_guidelines", creatorId];

  const [showCategories, setShowCategories] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [inlineFormCategory, setInlineFormCategory] = useState<string | null>(null);
  const [inlineTitle, setInlineTitle] = useState("");
  const [inlineDescription, setInlineDescription] = useState("");
  const [showList, setShowList] = useState(true);
  const [inlineAddingKey, setInlineAddingKey] = useState<string | null>(null);
  const [inlineAddContent, setInlineAddContent] = useState("");
  const [inlineAddTitle, setInlineAddTitle] = useState("");
  const [inlineAddPrice, setInlineAddPrice] = useState("");
  const [inlineAddCurrency, setInlineAddCurrency] = useState("USD");
  const [inlineAddNote, setInlineAddNote] = useState("");

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

  // Lookup: "category|title" -> guideline
  const guidelineLookup = useMemo(() => {
    const map = new Map<string, Guideline>();
    for (const g of guidelines) {
      map.set(`${g.guideline_type}|${g.title}`, g);
    }
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
          price: (payload as any).price ?? null,
          currency: (payload as any).currency ?? "USD",
          note: (payload as any).note ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(editingId ? t("creadores.guide.updated") : t("creadores.guide.created"));
      closeModal();
    },
    onError: () => toast.error(t("creadores.guide.saveError")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("creator_guidelines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(t("creadores.guide.deleted"));
      setDeleteId(null);
    },
    onError: () => toast.error(t("common.errorDeleting")),
  });

  // --- Handlers ---
  const openAddForItem = (category: string, title: string) => {
    const key = `${category}|${title}`;
    setInlineAddingKey(key);
    setInlineAddContent("");
  };

  const resetInlineForm = () => {
    setInlineAddTitle("");
    setInlineAddPrice("");
    setInlineAddCurrency("USD");
    setInlineAddNote("");
    setInlineAddContent("");
  };

  const handleInlineAddSubmit = (keepOpen = false) => {
    if (!inlineAddingKey || !inlineAddTitle.trim()) return;
    const [category, title] = inlineAddingKey.split("|");
    const content = inlineAddTitle.trim();
    const price = inlineAddPrice ? parseFloat(inlineAddPrice) : null;
    const currency = inlineAddCurrency.trim() || "USD";
    const note = inlineAddNote.trim() || null;
    upsertMutation.mutate(
      {
        title: content,
        guideline_type: category,
        content,
        price,
        currency,
        note,
      } as any,
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey });
          toast.success(t("creadores.guide.created"));
          if (keepOpen) {
            resetInlineForm();
          } else {
            setInlineAddingKey(null);
            resetInlineForm();
          }
        },
        onError: () => {
          toast.error(t("creadores.guide.saveError"));
        },
      }
    );
  };

  const openEdit = (g: Guideline) => {
    setEditingId(g.id);
    setForm({ title: g.title, guideline_type: g.guideline_type, content: g.content });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = () => {
    if (!form.content.trim()) {
      toast.error(t("creadores.guide.contentRequired"));
      return;
    }
    upsertMutation.mutate({ ...form, id: editingId ?? undefined });
  };

  const handleCreateInlineCategory = () => {
    if (!inlineTitle.trim()) {
      toast.error(t("creadores.guide.categoryNameRequired"));
      return;
    }
    upsertMutation.mutate(
      {
        title: inlineTitle.trim(),
        guideline_type: inlineFormCategory!,
        content: inlineDescription.trim() || inlineTitle.trim(),
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey });
          toast.success(t("creadores.guide.created"));
          setInlineFormCategory(null);
          setInlineTitle("");
          setInlineDescription("");
        },
      }
    );
  };

  const toggleExpanded = (key: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // --- Render ---
  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">{t("creadores.guide.loading")}</div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold leading-tight">{t("creadores.guide.title")}</h3>
            <p className="text-xs text-muted-foreground">{t("creadores.guide.countRegistered", { n: guidelines.length })}</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          <Button
            variant={showList && !showCategories ? "secondary" : "ghost"}
            size="sm"
            disabled={guidelines.length === 0}
            onClick={() => { setShowList((v) => !v); setShowCategories(false); }}
          >
            <Eye className="h-4 w-4 mr-1" />
            {t("common.view")}
          </Button>
          <Button
            variant={showCategories ? "secondary" : "ghost"}
            size="sm"
            onClick={() => { setShowCategories((v) => !v); setShowList(false); }}
          >
            <ClipboardList className="h-4 w-4 mr-1" />
            {t("common.add")}
          </Button>
        </div>
      </div>

      {/* Inline categories */}
      {showCategories && (
        <div className="space-y-5">
          {CATEGORIES.map((cat) => (
            <div key={cat.category}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-muted-foreground">
                  {t(cat.label)}
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground h-auto py-1 px-2"
                  onClick={() => {
                    setInlineFormCategory((prev) => prev === cat.category ? null : cat.category);
                    setInlineTitle("");
                    setInlineDescription("");
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {t("creadores.guide.newCategory")}
                </Button>
              </div>
              {inlineFormCategory === cat.category && (
                <div className="rounded-lg border-2 border-dashed border-border p-4 mb-3 space-y-3">
                  <Input
                    value={inlineTitle}
                    onChange={(e) => setInlineTitle(e.target.value)}
                    placeholder={t("creadores.guide.categoryNamePh")}
                  />
                  <Input
                    value={inlineDescription}
                    onChange={(e) => setInlineDescription(e.target.value)}
                    placeholder={t("creadores.guide.shortDescPh")}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setInlineFormCategory(null)}>
                      {t("common.cancel")}
                    </Button>
                    <Button size="sm" onClick={handleCreateInlineCategory} disabled={upsertMutation.isPending || !inlineTitle.trim()}>
                      {upsertMutation.isPending ? t("creadores.guide.creating") : t("creadores.guide.createCategory")}
                    </Button>
                  </div>
                </div>
              )}
              <div className="space-y-3">
                {cat.items.map((item) => {
                  const key = `${cat.category}|${item.title}`;
                  const guideline = guidelineLookup.get(key);
                  return (
                    <GuidelineItemRow
                      key={key}
                      item={item}
                      formType={item.formType ?? "detail"}
                      guideline={guideline}
                      expanded={expandedItems.has(key)}
                      onToggle={() => toggleExpanded(key)}
                      onAdd={() => openAddForItem(cat.category, item.title)}
                      onEdit={openEdit}
                      onDelete={(id) => setDeleteId(id)}
                      inlineAdding={inlineAddingKey === key && !guideline}
                      inlineContent={inlineAddContent}
                      onInlineContentChange={setInlineAddContent}
                      inlineTitle={inlineAddTitle}
                      onInlineTitleChange={setInlineAddTitle}
                      inlinePrice={inlineAddPrice}
                      onInlinePriceChange={setInlineAddPrice}
                      inlineCurrency={inlineAddCurrency}
                      onInlineCurrencyChange={setInlineAddCurrency}
                      inlineNote={inlineAddNote}
                      onInlineNoteChange={setInlineAddNote}
                      onInlineSubmit={() => handleInlineAddSubmit(false)}
                      onInlineSubmitAndAnother={() => handleInlineAddSubmit(true)}
                      onInlineCancel={() => { setInlineAddingKey(null); resetInlineForm(); toast(t("creadores.editCancelled")); }}
                      isSaving={upsertMutation.isPending}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Existing guidelines list */}
      {showList && guidelines.length > 0 && !showCategories && (
        <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
          {guidelines.map((g) => {
            // Find matching item for icon
            const catConfig = CATEGORIES.find((c) => c.category === g.guideline_type);
            const itemConfig = catConfig?.items.find((i) => i.title === g.title);
            if (itemConfig) {
              const key = `list|${g.id}`;
              return (
                <GuidelineItemRow
                  key={g.id}
                  item={itemConfig}
                  guideline={g}
                  expanded={expandedItems.has(key)}
                  onToggle={() => toggleExpanded(key)}
                  onAdd={() => openAddForItem(g.guideline_type, g.title)}
                  onEdit={openEdit}
                  onDelete={(id) => setDeleteId(id)}
                />
              );
            }
            // Fallback for guidelines without matching config
            return (
              <div key={g.id} className="flex items-start gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {categoriaVisible(t, g.guideline_type)}
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-sm font-medium">{g.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-2">
                    {g.content}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {guidelines.length === 0 && !showCategories && (
        <div className="flex flex-col items-center justify-center rounded-lg bg-muted/50 py-16 px-6">
          <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
          <h4 className="text-base font-semibold mb-1">{t("creadores.guide.empty")}</h4>
          <p className="text-sm text-muted-foreground mb-5">{t("creadores.guide.emptyDesc")}</p>
          <Button variant="outline" size="sm" onClick={() => setShowCategories(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t("common.add")}
          </Button>
        </div>
      )}

      {/* Add / Edit Content Modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => !o && closeModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? t("creadores.guide.editTitle") : t("creadores.guide.newTitle")}</DialogTitle>
            <DialogDescription>
              {form.guideline_type && form.title
                ? `${categoriaVisible(t, form.guideline_type)} · ${form.title}`
                : editingId
                  ? t("creadores.guide.editDesc")
                  : t("creadores.guide.newDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("creadores.guide.content")}</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder={t("creadores.guide.contentPh")}
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeModal}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSubmit} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? t("creadores.savingEllipsis") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("creadores.guide.deleteQ")}</AlertDialogTitle>
            <AlertDialogDescription>{t("common.cannotBeUndone")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LineamientosTabContent;
