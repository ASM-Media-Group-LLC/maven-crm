import { useState } from "react";
import { Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/hooks/useLanguage";
import DynamicTicketForm from "./DynamicTicketForm";
import TicketFormEditor from "./TicketFormEditor";
import { useTicketForms, type TicketForm } from "./useTicketForms";
import { FORM_COLORS, FORM_ICONS, DEFAULT_FORM_ICON } from "./ticketFormPresentation";

interface Props {
  /** Si es false, las tarjetas se ven pero no abren el formulario. */
  canCreate: boolean;
  /** Muestra el lapiz para editar la plantilla y sus destinatarios. */
  canManageForms?: boolean;
}

/**
 * Las plantillas publicadas, como tarjetas. Es el reemplazo del "abrir el
 * Google Form": el operario elige el tipo de ticket y llena ese formulario.
 */
const NewTicketLauncher = ({ canCreate, canManageForms = false }: Props) => {
  const { t } = useLanguage();
  const { formsQuery, fieldsByForm } = useTicketForms();
  const [active, setActive] = useState<TicketForm | null>(null);
  const [editing, setEditing] = useState<TicketForm | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  if (formsQuery.isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const forms = formsQuery.data || [];

  if (!forms.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm font-medium">{t("tickets.launcher.noPublished")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("tickets.launcher.noPublishedHint")}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {forms.map((f) => {
          const Icon = FORM_ICONS[f.icon] || DEFAULT_FORM_ICON;
          const c = FORM_COLORS[f.color] || FORM_COLORS.slate;
          const count = fieldsByForm(f.id).length;
          return (
            <Card
              key={f.id}
              role={canCreate ? "button" : undefined}
              tabIndex={canCreate ? 0 : -1}
              aria-disabled={!canCreate}
              onClick={() => canCreate && setActive(f)}
              onKeyDown={(e) => {
                if (!canCreate) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActive(f);
                }
              }}
              className={`group relative p-4 transition ${
                canCreate
                  ? "cursor-pointer hover:border-primary/50 hover:shadow-sm"
                  : "cursor-not-allowed opacity-60"
              }`}
            >
              {canManageForms && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("tickets.launcher.editTemplate", { name: f.name })}
                  // stopPropagation: sin esto, el clic tambien abriria el
                  // formulario de ticket de la tarjeta.
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(f);
                    setEditorOpen(true);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="absolute right-1.5 top-1.5 h-7 w-7 opacity-60 transition hover:opacity-100"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}

              <div className="flex items-start gap-3">
                <div className={`rounded-lg p-2 ${c.wrap}`}>
                  <Icon className={`h-5 w-5 ${c.icon}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 pr-7">
                    <p className="truncate font-medium">{f.name}</p>
                    <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                      {f.code_prefix}
                    </Badge>
                  </div>
                  {f.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{f.description}</p>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t(count === 1 ? "tickets.fieldCount.one" : "tickets.fieldCount.other", { count })}
                    {f.creator_mode === "required" && ` · ${t("tickets.launcher.requiresCreator")}`}
                    {canManageForms &&
                      f.notify_enabled &&
                      ` · ${t(
                        (f.notify_emails || []).length === 1
                          ? "tickets.recipientCount.one"
                          : "tickets.recipientCount.other",
                        { count: (f.notify_emails || []).length },
                      )}`}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <DynamicTicketForm
        form={active}
        open={!!active}
        onOpenChange={(o) => !o && setActive(null)}
      />

      {canManageForms && (
        <TicketFormEditor form={editing} open={editorOpen} onOpenChange={setEditorOpen} />
      )}
    </>
  );
};

export default NewTicketLauncher;
