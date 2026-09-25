import { useState } from "react";
import { Pencil, Archive } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/hooks/useLanguage";
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
  const { t } = useLanguage();
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
      <div>
        <h2 className="text-sm font-medium">{t("tickets.forms.title")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("tickets.forms.intro")}
        </p>
      </div>

      {formsQuery.isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("tickets.forms.loading")}</p>
      ) : forms.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">{t("tickets.forms.empty")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("tickets.forms.emptyHint")}
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
                      <Badge className="text-[10px]">{t("tickets.published")}</Badge>
                    ) : (
                      // Sin esta aclaracion nadie ata "Borrador" con "no me
                      // aparece en Nuevo Ticket".
                      <Badge variant="secondary" className="text-[10px]">
                        {t("tickets.forms.draft")}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t(count === 1 ? "tickets.fieldCount.one" : "tickets.fieldCount.other", { count })} ·{" "}
                    {f.notify_enabled
                      ? t(recipients === 1 ? "tickets.recipientCount.one" : "tickets.recipientCount.other", {
                          count: recipients,
                        })
                      : t("tickets.forms.noEmail")}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={f.is_published}
                      onCheckedChange={(v) => togglePublished.mutate({ id: f.id, is_published: v })}
                      aria-label={t("tickets.forms.publish")}
                    />
                    <span className="hidden text-xs text-muted-foreground sm:inline">{t("tickets.published")}</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => openEditor(f)} aria-label={t("common.edit")}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setToArchive(f)} aria-label={t("tickets.forms.archive")}>
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
            <AlertDialogTitle>{t("tickets.forms.archiveTitle", { name: toArchive?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("tickets.forms.archiveBefore")} <code>{toArchive?.code_prefix}</code>{" "}
              {t("tickets.forms.archiveAfter")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              onClick={() => {
                if (toArchive) deleteForm.mutate(toArchive.id);
                setToArchive(null);
              }}
            >
              {t("tickets.forms.archive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TicketFormsManager;
