import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useToast } from "@/hooks/use-toast";
import { useTickets, TEAM_MEMBERS } from "./useTickets";
import {
  useTicketForms,
  useCreateTicketFromForm,
  optionLabel,
  optionValue,
  type TicketForm,
  type TicketFormField,
} from "./useTicketForms";

interface Props {
  form: TicketForm | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type AnswerValue = string | number | boolean | string[] | null;

/**
 * `creators.instagram_handle` no esta normalizado en la base: hay handles
 * limpios, con @, y URLs completas de Instagram. Sin esto la opcion salia como
 * "ILIANA CHACON · @https://www.instagram.com/pandoraletrain__/".
 */
function normalizeHandle(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?instagram\.com\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@+/, "")
    .trim();
}

/** ¿La respuesta cuenta como vacía para un campo obligatorio? */
function isBlank(v: AnswerValue): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "boolean") return false; // "No" es una respuesta válida
  return false;
}

/**
 * Pinta el formulario de una plantilla y crea el ticket.
 *
 * El selector de creadora NO es un campo de la plantilla: lo decide
 * `creator_mode`, y por eso se dibuja aparte y siempre arriba.
 */
const DynamicTicketForm = ({ form, open, onOpenChange }: Props) => {
  const { toast } = useToast();
  const { fieldsByForm, fieldsQuery } = useTicketForms({ includeUnpublished: true });
  const { creatorsQuery } = useTickets();
  const createTicket = useCreateTicketFromForm();

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [creatorId, setCreatorId] = useState("");
  const [touched, setTouched] = useState(false);

  // Memoizado: fieldsByForm filtra y ordena en cada llamada, y `fields` es
  // dependencia del useMemo de abajo. Sin esto se recalcula en cada render.
  const fields = useMemo(
    () => (form ? fieldsByForm(form.id) : []),
    // fieldsByForm se reconstruye con la query; form.id es lo que la cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form?.id, fieldsQuery.data],
  );

  const creatorOptions = useMemo(
    () =>
      (creatorsQuery.data || []).map((c) => ({
        value: c.id,
        // El handle va en la etiqueta, no solo en el texto de busqueda: sin el,
        // la lista parece corta y ambigua (hay 338 creadoras y homonimas).
        label: (() => {
          const nombre = c.artistic_name || c.name;
          const h = normalizeHandle(c.instagram_handle);
          return h ? `${nombre} · @${h}` : nombre;
        })(),
        searchAdditional: [c.name, c.artistic_name, c.instagram_handle]
          .filter(Boolean)
          .join(" "),
      })),
    [creatorsQuery.data],
  );

  const reset = () => {
    setAnswers({});
    setCreatorId("");
    setTouched(false);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const setAnswer = (key: string, v: AnswerValue) =>
    setAnswers((prev) => ({ ...prev, [key]: v }));

  const missing = useMemo(
    () => fields.filter((f) => f.is_required && isBlank(answers[f.field_key] ?? null)),
    [fields, answers],
  );

  const creatorMissing = form?.creator_mode === "required" && !creatorId;

  const handleSubmit = async () => {
    if (!form) return;
    setTouched(true);

    if (creatorMissing) {
      toast({ title: "Falta la creadora", description: "Esta plantilla la exige.", variant: "destructive" });
      return;
    }
    if (missing.length) {
      toast({
        title: "Faltan campos obligatorios",
        description: missing.map((f) => f.label).join(", "),
        variant: "destructive",
      });
      return;
    }

    // Se limpian las vacías para no guardar ruido en answers.
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const v = answers[f.field_key];
      if (!isBlank(v ?? null)) payload[f.field_key] = v;
    }

    try {
      await createTicket.mutateAsync({
        formId: form.id,
        answers: payload,
        creatorId: form.creator_mode === "none" ? null : creatorId || null,
      });
      close();
    } catch {
      // El toast de error ya lo emite el hook.
    }
  };

  const renderField = (f: TicketFormField) => {
    const v = answers[f.field_key];
    const invalid = touched && f.is_required && isBlank(v ?? null);
    const ring = invalid ? "border-destructive focus-visible:ring-destructive" : "";

    switch (f.field_type) {
      case "textarea":
        return (
          <Textarea
            value={(v as string) || ""}
            onChange={(e) => setAnswer(f.field_key, e.target.value)}
            placeholder={f.placeholder || ""}
            rows={4}
            className={ring}
          />
        );

      case "select":
        return (
          <SearchableSelect
            value={(v as string) || ""}
            onValueChange={(nv) => setAnswer(f.field_key, nv)}
            options={f.options.map((o) => ({ value: optionValue(o), label: optionLabel(o) }))}
            placeholder="Seleccionar…"
            triggerClassName={ring}
          />
        );

      case "multiselect": {
        const selected = (v as string[]) || [];
        return (
          <div className={`space-y-2 rounded-md border p-3 ${invalid ? "border-destructive" : ""}`}>
            {f.options.map((o) => {
              const val = optionValue(o);
              const on = selected.includes(val);
              return (
                <label key={val} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={on}
                    onCheckedChange={(c) =>
                      setAnswer(
                        f.field_key,
                        c ? [...selected, val] : selected.filter((x) => x !== val),
                      )
                    }
                  />
                  <span>{optionLabel(o)}</span>
                </label>
              );
            })}
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {selected.map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs">
                    {optionLabel(f.options.find((o) => optionValue(o) === s) || s)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        );
      }

      case "checkbox":
        return (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={!!v}
              onCheckedChange={(c) => setAnswer(f.field_key, !!c)}
            />
            <span className="text-muted-foreground">Sí</span>
          </label>
        );

      case "user":
        return (
          <SearchableSelect
            value={(v as string) || ""}
            onValueChange={(nv) => setAnswer(f.field_key, nv)}
            options={TEAM_MEMBERS}
            placeholder="Elegir miembro del equipo…"
            triggerClassName={ring}
          />
        );

      case "drive_links": {
        // Varias pruebas por ticket, igual que en la hoja (se guardan como array).
        const links = (v as string[]) || [""];
        const update = (i: number, nv: string) => {
          const next = [...links];
          next[i] = nv;
          setAnswer(f.field_key, next);
        };
        return (
          <div className="space-y-2">
            {links.map((lnk, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={lnk}
                  onChange={(e) => update(i, e.target.value)}
                  placeholder="https://drive.google.com/…"
                  className={ring}
                />
                {links.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setAnswer(f.field_key, links.filter((_, x) => x !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAnswer(f.field_key, [...links, ""])}
            >
              <Plus className="mr-1 h-3 w-3" /> Agregar otra prueba
            </Button>
          </div>
        );
      }

      case "currency":
      case "percent":
      case "number":
        return (
          <div className="relative">
            {f.field_type === "currency" && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            )}
            <Input
              type="number"
              step="any"
              value={(v as string) ?? ""}
              onChange={(e) => setAnswer(f.field_key, e.target.value)}
              placeholder={f.placeholder || ""}
              className={`${f.field_type === "currency" ? "pl-7" : ""} ${
                f.field_type === "percent" ? "pr-7" : ""
              } ${ring}`}
            />
            {f.field_type === "percent" && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            )}
          </div>
        );

      case "date":
        return (
          <Input
            type="date"
            value={(v as string) || ""}
            onChange={(e) => setAnswer(f.field_key, e.target.value)}
            className={ring}
          />
        );

      case "instagram":
        return (
          <Input
            value={(v as string) || ""}
            onChange={(e) => setAnswer(f.field_key, e.target.value)}
            placeholder="https://www.instagram.com/usuario/"
            className={ring}
          />
        );

      default:
        return (
          <Input
            type={f.field_type === "email" ? "email" : f.field_type === "url" ? "url" : "text"}
            value={(v as string) || ""}
            onChange={(e) => setAnswer(f.field_key, e.target.value)}
            placeholder={f.placeholder || ""}
            className={ring}
          />
        );
    }
  };

  if (!form) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {form.name}
            <Badge variant="outline" className="font-mono text-xs">
              {form.code_prefix}-{String(form.next_number).padStart(4, "0")}
            </Badge>
          </DialogTitle>
          {form.description && <DialogDescription>{form.description}</DialogDescription>}
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4">
            {form.creator_mode !== "none" && (
              <div className="space-y-1.5">
                <Label>
                  Creadora
                  {form.creator_mode === "required" && <span className="ml-1 text-destructive">*</span>}
                </Label>
                <SearchableSelect
                  value={creatorId}
                  onValueChange={setCreatorId}
                  options={creatorOptions}
                  placeholder="Buscar creadora…"
                  triggerClassName={touched && creatorMissing ? "border-destructive" : ""}
                />
                <p className="text-xs text-muted-foreground">
                  {creatorOptions.length} creadoras de la base de Maven — escribí para buscar por
                  nombre o handle. Queda vinculada al perfil, no es texto libre.
                </p>
              </div>
            )}

            {fields.length === 0 && (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Esta plantilla todavía no tiene campos. Agregalos desde Plantillas.
              </p>
            )}

            {fields.map((f) => (
              <div key={f.id} className="space-y-1.5">
                <Label>
                  {f.label}
                  {f.is_required && <span className="ml-1 text-destructive">*</span>}
                </Label>
                {renderField(f)}
                {f.help_text && <p className="text-xs text-muted-foreground">{f.help_text}</p>}
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={createTicket.isPending}>
            {createTicket.isPending ? "Creando…" : "Crear ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DynamicTicketForm;
