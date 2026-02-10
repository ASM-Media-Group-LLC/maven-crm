import { ChevronDown, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
}

const GuidelineItemRow = ({
  item,
  guideline,
  expanded,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
}: Props) => {
  const Icon = item.icon;

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
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", expanded && "rotate-180")} />
          </Button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 pl-16">
          {guideline ? (
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
