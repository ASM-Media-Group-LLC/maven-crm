import { ChevronDown, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CategoryItem } from "./categoriesConfig";
import type { Tables } from "@/integrations/supabase/types";

type Guideline = Tables<"creator_guidelines">;

interface Props {
  item: CategoryItem;
  guideline: Guideline | undefined;
  expanded: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onEdit: (g: Guideline) => void;
  onDelete: (id: string) => void;
  inlineAdding?: boolean;
  inlineContent?: string;
  onInlineContentChange?: (value: string) => void;
  onInlineSubmit?: () => void;
  onInlineCancel?: () => void;
  isSaving?: boolean;
}

const GuidelineItemRow = ({
  item,
  guideline,
  expanded,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
  inlineAdding = false,
  inlineContent = "",
  onInlineContentChange,
  onInlineSubmit,
  onInlineCancel,
  isSaving = false,
}: Props) => {
  const Icon = item.icon;
  const isExpanded = expanded || inlineAdding;

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Row header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">{item.title}</p>
          <p className="text-xs text-muted-foreground truncate">{item.description}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {guideline ? (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(guideline)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(guideline.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onAdd}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggle}>
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isExpanded && "rotate-180")} />
          </Button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 pl-16">
          {inlineAdding ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Contenido</Label>
                <Textarea
                  value={inlineContent}
                  onChange={(e) => onInlineContentChange?.(e.target.value)}
                  placeholder="Describe el lineamiento…"
                  rows={4}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onInlineCancel}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={onInlineSubmit} disabled={!inlineContent.trim() || isSaving}>
                  {isSaving ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            </div>
          ) : guideline ? (
            <p className="text-sm whitespace-pre-wrap text-foreground">{guideline.content}</p>
          ) : (
            <div
              className="rounded-lg border-2 border-dashed border-border py-3 flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={onAdd}
            >
              <Plus className="h-4 w-4 mr-2 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Agregar a {item.title}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GuidelineItemRow;
