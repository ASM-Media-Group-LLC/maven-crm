import { useState } from "react";
import { ChevronDown, Plus, Pencil, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CategoryItem, FormType } from "./categoriesConfig";
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
  formType?: FormType;
  inlineAdding?: boolean;
  inlineContent?: string;
  onInlineContentChange?: (value: string) => void;
  inlineTitle?: string;
  onInlineTitleChange?: (value: string) => void;
  inlinePrice?: string;
  onInlinePriceChange?: (value: string) => void;
  inlineCurrency?: string;
  onInlineCurrencyChange?: (value: string) => void;
  inlineNote?: string;
  onInlineNoteChange?: (value: string) => void;
  onInlineSubmit?: () => void;
  onInlineSubmitAndAnother?: () => void;
  onInlineCancel?: () => void;
  isSaving?: boolean;
}

const PREDEFINED_LANGUAGES = ["Español", "English", "Português", "Français", "Deutsch", "Italiano"];

const GuidelineItemRow = ({
  item,
  guideline,
  expanded,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
  formType = "detail",
  inlineAdding = false,
  inlineContent = "",
  onInlineContentChange,
  inlineTitle = "",
  onInlineTitleChange,
  inlinePrice = "",
  onInlinePriceChange,
  inlineCurrency = "USD",
  onInlineCurrencyChange,
  inlineNote = "",
  onInlineNoteChange,
  onInlineSubmit,
  onInlineSubmitAndAnother,
  onInlineCancel,
  isSaving = false,
}: Props) => {
  const Icon = item.icon;
  const isExpanded = expanded || inlineAdding;
  const [selectedLang, setSelectedLang] = useState<string | null>(null);
  const [showCustomLang, setShowCustomLang] = useState(false);
  const [customLang, setCustomLang] = useState("");

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
              {formType === "language" && (
                <div className="space-y-2">
                  <Label>Idioma</Label>
                  <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
                    {PREDEFINED_LANGUAGES.map((lang) => (
                      <Button
                        key={lang}
                        type="button"
                        variant={selectedLang === lang ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setSelectedLang(lang);
                          setShowCustomLang(false);
                          onInlineTitleChange?.(lang);
                        }}
                      >
                        {lang}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant={showCustomLang ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setShowCustomLang(true);
                        setSelectedLang(null);
                      }}
                    >
                      + Otro
                    </Button>
                  </div>
                  {showCustomLang && (
                    <Input
                      value={customLang}
                      onChange={(e) => {
                        setCustomLang(e.target.value);
                        onInlineTitleChange?.(e.target.value);
                      }}
                      placeholder="Escribe el idioma..."
                      className="max-w-xs"
                    />
                  )}
                </div>
              )}
              {formType !== "language" && (
                <div className="space-y-1.5">
                  <Label>Título / Concepto</Label>
                  <Input
                    value={inlineTitle}
                    onChange={(e) => onInlineTitleChange?.(e.target.value)}
                    placeholder="Ej: Foto personalizada, Videollamada 15min, Pack semanal..."
                  />
                </div>
              )}
              {formType === "pricing" ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Precio</Label>
                      <Input
                        type="number"
                        value={inlinePrice}
                        onChange={(e) => onInlinePriceChange?.(e.target.value)}
                        placeholder="Ej: 50"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Moneda</Label>
                      <Input
                        value={inlineCurrency}
                        onChange={(e) => onInlineCurrencyChange?.(e.target.value)}
                        placeholder="USD"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nota (opcional)</Label>
                    <Textarea
                      value={inlineNote}
                      onChange={(e) => onInlineNoteChange?.(e.target.value)}
                      placeholder="Ej: Incluye nombre del fan, entrega en 24h..."
                      rows={3}
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <Label>{formType === "language" ? "Instrucciones del idioma" : "Descripción / Detalle"}</Label>
                  <Textarea
                    value={inlineContent}
                    onChange={(e) => onInlineContentChange?.(e.target.value)}
                    placeholder={formType === "language" ? "Ej: Saludo cálido, usar emojis, tono amigable..." : "Describe el detalle de este lineamiento..."}
                    rows={4}
                  />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onInlineCancel}>
                  Cancelar
                </Button>
                <Button variant="outline" size="sm" onClick={onInlineSubmitAndAnother} disabled={!inlineTitle.trim() || isSaving}>
                  Guardar y agregar otro
                </Button>
                <Button size="sm" onClick={onInlineSubmit} disabled={!inlineTitle.trim() || isSaving}>
                  <Save className="h-4 w-4 mr-1" />
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
