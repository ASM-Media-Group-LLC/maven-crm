import { useState } from "react";
import { Plus, Pencil, Archive } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { FORM_COLORS, FORM_ICONS, DEFAULT_FORM_ICON } from "./ticketFormPresentation";
import TicketFormEditor from "./TicketFormEditor";
import { useTicketForms, type TicketForm } from "./useTicketForms";

/**
 * Lista de plantillas. Es lo que reemplaza "pedirle a alguien que edite el
 * Apps Script": aca se publica, se archiva y se entra al constructor.
 */
const TicketFormsManager = () => {
  const { formsQuery, fieldsByForm, deleteForm, togglePublished } = useTicketForms({
    includeUnpublished: true,
  });

  const [editing, setEditing] = useState<TicketForm | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [toArchive, setToArchive] = useState<TicketForm | null>(null);

  const openEditor = (form: TicketForm | null) => {
    setEditing(form);
    setEditorOpen(true);
  };

  const forms = formsQuery.data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">Plantillas de ticket</h2>
          <p className="text-xs text-muted-foreground">
            Arma los formularios que el equipo va a usar. Publica una para que aparezca en Nuevo Ticket.
          </p>
        </div>
        <Button onClick={() => openEditor(null)}>
          <Plus className="mr-1 h-4 w-4" />
          Nueva plantilla
        </Button>
      </div>

      {formsQuery.isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Cargando plantillas...</p>
      ) : forms.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Todavia no hay plantillas</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea la primera y defini sus campos, su prefijo y a quien le llega el correo.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {forms.map((f) => {
            const Icon = FORM_ICONS[f.icon] || DEFAULT_FORM_ICON;
            const c = FORM_COLORS[f.color] || FORM_COLORS.slate;
            const count = fieldsByForm(f.id).length;
            const recipients = (f.notify_emails || []).length;
            return (
              <Card key={f.id} className="flex items-center gap-3 p-3">
                <div className={`rounded-lg p-2 ${c.wrap}`}>
                  <Icon className={`h-4 w-4 ${c.icon}`} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{f.name}</span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {f.code_prefix}-{String(f.next_number).padStart(4, "0")}
                    </Badge>
                    {f.is_published ? (
                      <Badge className="text-[10px]">Publicada</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        Borrador
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {count} {count === 1 ? "campo" : "campos"} ·{" "}
                    {f.notify_enabled
                      ? `${recipients} destinatario${recipients === 1 ? "" : "s"}`
                      : "sin correo"}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={f.is_published}
                      onCheckedChange={(v) => togglePublished.mutate({ id: f.id, is_published: v })}
                      aria-label="Publicar plantilla"
                    />
                    <span className="hidden text-xs text-muted-foreground sm:inline">Publicada</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => openEditor(f)} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setToArchive(f)} aria-label="Archivar">
                    <Archive className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <TicketFormEditor form={editing} open={editorOpen} onOpenChange={setEditorOpen} />

      <AlertDialog open={!!toArchive} onOpenChange={(o) => !o && setToArchive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archivar "{toArchive?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Deja de aparecer en Nuevo Ticket. Los tickets ya creados con esta plantilla se
              conservan intactos, y su prefijo <code>{toArchive?.code_prefix}</code> queda reservado
              para que los codigos historicos nunca se repitan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toArchive) deleteForm.mutate(toArchive.id);
                setToArchive(null);
              }}
            >
              Archivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TicketFormsManager;
