import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import DynamicTicketForm from "./DynamicTicketForm";
import { useTicketForms, type TicketForm } from "./useTicketForms";
import { FORM_COLORS, FORM_ICONS, DEFAULT_FORM_ICON } from "./ticketFormPresentation";

interface Props {
  /** Si es false, las tarjetas se ven pero no abren el formulario. */
  canCreate: boolean;
}

/**
 * Las plantillas publicadas, como tarjetas. Es el reemplazo del "abrir el
 * Google Form": el operario elige el tipo de ticket y llena ese formulario.
 */
const NewTicketLauncher = ({ canCreate }: Props) => {
  const { formsQuery, fieldsByForm } = useTicketForms();
  const [active, setActive] = useState<TicketForm | null>(null);

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
        <p className="text-sm font-medium">Todavía no hay plantillas publicadas</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Creá una desde la pestaña Plantillas y publicala para que aparezca acá.
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
              className={`p-4 transition ${
                canCreate
                  ? "cursor-pointer hover:border-primary/50 hover:shadow-sm"
                  : "cursor-not-allowed opacity-60"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`rounded-lg p-2 ${c.wrap}`}>
                  <Icon className={`h-5 w-5 ${c.icon}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{f.name}</p>
                    <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                      {f.code_prefix}
                    </Badge>
                  </div>
                  {f.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{f.description}</p>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {count} {count === 1 ? "campo" : "campos"}
                    {f.creator_mode === "required" && " · requiere creadora"}
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
    </>
  );
};

export default NewTicketLauncher;
