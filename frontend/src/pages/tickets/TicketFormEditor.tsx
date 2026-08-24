import { useEffect, useMemo, useState } from "react";
import { Plus, GripVertical, Trash2, ArrowUp, ArrowDown, Mail, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FORM_COLORS, FORM_ICONS } from "./ticketFormPresentation";
import {
  useTicketForms,
  FIELD_TYPES,
  TYPES_WITH_OPTIONS,
  MAPPABLE_COLUMNS,
  CREATOR_MODES,
  slugifyFieldKey,
  type CreatorMode,
  type FieldType,
  type TicketForm,
  type TicketFormField,
} from "./useTicketForms";

/**
 * El constructor de una plantilla. Vive aparte de la lista para que se pueda
 * abrir desde dos lados: la pestaña Plantillas y el lápiz de cada tarjeta en
 * Nuevo Ticket.
 */

/** Fila del editor de campos (aún sin persistir). */
interface DraftField {
  label: string;
  field_key: string;
  field_type: FieldType;
  help_text: string;
  is_required: boolean;
  /** Se edita como texto: una opción por línea, o "valor|Etiqueta". */
  optionsText: string;
  maps_to: string;
}

const EMPTY_FIELD: DraftField = {
  label: "",
  field_key: "",
  field_type: "text",
  help_text: "",
  is_required: false,
  optionsText: "",
  maps_to: "",
};

function fieldToDraft(f: TicketFormField): DraftField {
  return {
    label: f.label,
    field_key: f.field_key,
    field_type: f.field_type,
    help_text: f.help_text || "",
    is_required: f.is_required,
    optionsText: (f.options || [])
      .map((o) => (typeof o === "string" ? o : `${o.value}|${o.label}`))
      .join("\n"),
    maps_to: f.maps_to || "",
  };
}

/** "low|Baja" → {value,label}; "Chats" → "Chats". */
function parseOptions(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf("|");
      if (i === -1) return l;
      return { value: l.slice(0, i).trim(), label: l.slice(i + 1).trim() };
    });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  /** null = crear una nueva. */
  form: TicketForm | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TicketFormEditor = ({ form, open, onOpenChange }: Props) => {
  const { toast } = useToast();
  const { fieldsByForm, saveForm, saveFields } = useTicketForms({ includeUnpublished: true });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prefix, setPrefix] = useState("");
  const [icon, setIcon] = useState("Ticket");
  const [color, setColor] = useState("slate");
  const [creatorMode, setCreatorMode] = useState<CreatorMode>("optional");
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [emails, setEmails] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState("");
  const [fields, setFields] = useState<DraftField[]>([]);

  useEffect(() => {
    if (!open) return;
    if (form) {
      setName(form.name);
      setDescription(form.description || "");
      setPrefix(form.code_prefix);
      setIcon(form.icon);
      setColor(form.color);
      setCreatorMode(form.creator_mode);
      setNotifyEnabled(form.notify_enabled);
      setEmails(form.notify_emails || []);
      setFields(fieldsByForm(form.id).map(fieldToDraft));
    } else {
      setName("");
      setDescription("");
      setPrefix("");
      setIcon("Ticket");
      setColor("slate");
      setCreatorMode("optional");
      setNotifyEnabled(true);
      setEmails([]);
      setFields([{ ...EMPTY_FIELD }]);
    }
    setEmailDraft("");
    // fieldsByForm se reconstruye con la query; form.id es lo que la cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form?.id]);

  const addEmail = () => {
    const e = emailDraft.trim().toLowerCase();
    if (!e) return;
    if (!EMAIL_RE.test(e)) {
      toast({ title: "Correo inválido", description: e, variant: "destructive" });
      return;
    }
    if (!emails.includes(e)) setEmails([...emails, e]);
    setEmailDraft("");
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    setFields(next);
  };

  const updateField = (i: number, patch: Partial<DraftField>) => {
    setFields((prev) =>
      prev.map((f, x) => {
        if (x !== i) return f;
        const merged = { ...f, ...patch };
        // La clave se deriva de la etiqueta mientras nadie la haya fijado a mano.
        if (patch.label !== undefined && (!f.field_key || f.field_key === slugifyFieldKey(f.label))) {
          merged.field_key = slugifyFieldKey(patch.label);
        }
        return merged;
      }),
    );
  };

  /** Errores que la base rechazaría, detectados antes de mandar. */
  const problems = useMemo(() => {
    const out: string[] = [];
    if (!name.trim()) out.push("La plantilla necesita un nombre.");
    if (!/^[A-Z][A-Z0-9]{0,7}$/.test(prefix.trim().toUpperCase()))
      out.push("El prefijo debe ser de 1 a 8 caracteres, empezando por letra (ej. TK).");

    const keys = new Set<string>();
    const maps = new Set<string>();
    fields.forEach((f, i) => {
      const n = i + 1;
      if (!f.label.trim()) out.push(`El campo ${n} no tiene etiqueta.`);
      const k = f.field_key || slugifyFieldKey(f.label);
      if (!/^[a-z][a-z0-9_]{0,48}$/.test(k))
        out.push(`El campo "${f.label || n}" no produce una clave válida. Usá al menos una letra.`);
      else if (keys.has(k)) out.push(`Hay dos campos con la clave "${k}". Cambiá una etiqueta.`);
      keys.add(k);

      if (TYPES_WITH_OPTIONS.includes(f.field_type) && parseOptions(f.optionsText).length === 0)
        out.push(`La lista "${f.label || n}" necesita al menos una opción.`);

      if (f.maps_to) {
        if (maps.has(f.maps_to)) out.push(`Dos campos apuntan a "${f.maps_to}". Solo uno puede.`);
        maps.add(f.maps_to);

        // Éste es el error que corrompe datos en silencio: guardar la etiqueta
        // visible en una columna con catálogo cerrado.
        const col = MAPPABLE_COLUMNS.find((c) => c.value === f.maps_to);
        if (col && "closedCatalog" in col && col.closedCatalog) {
          const opts = parseOptions(f.optionsText);
          const allPairs = opts.length > 0 && opts.every((o) => typeof o !== "string");
          if (!allPairs)
            out.push(
              `"${f.label || n}" alimenta ${col.label}, que solo acepta valores del catálogo. Usá el formato valor|Etiqueta en cada opción (ej. high|Alta).`,
            );
        }
      }
    });
    return out;
  }, [name, prefix, fields]);

  const handleSave = async () => {
    if (problems.length) {
      toast({ title: "Revisá el formulario", description: problems[0], variant: "destructive" });
      return;
    }
    try {
      const formId = await saveForm.mutateAsync({
        ...(form ? { id: form.id } : {}),
        name: name.trim(),
        description: description.trim() || null,
        code_prefix: prefix.trim().toUpperCase(),
        icon,
        color,
        creator_mode: creatorMode,
        notify_enabled: notifyEnabled,
        notify_emails: emails,
      } as Parameters<typeof saveForm.mutateAsync>[0]);

      await saveFields.mutateAsync({
        formId,
        fields: fields
          .filter((f) => f.label.trim())
          .map((f) => ({
            label: f.label,
            field_key: f.field_key || slugifyFieldKey(f.label),
            field_type: f.field_type,
            help_text: f.help_text,
            is_required: f.is_required,
            options: TYPES_WITH_OPTIONS.includes(f.field_type) ? parseOptions(f.optionsText) : [],
            maps_to: f.maps_to || null,
          })),
      });
      onOpenChange(false);
    } catch {
      // Los toasts de error los emiten los hooks.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{form ? `Editar “${form.name}”` : "Nueva plantilla"}</DialogTitle>
          <DialogDescription>
            Los campos se guardan en el orden en que los ordenes acá.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-4">
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Nombre de la plantilla *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Escalamiento Queja/Solicitud"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Descripción</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Para qué sirve esta plantilla y cuándo usarla."
                />
              </div>

              <div className="space-y-1.5">
                <Label>Prefijo del código *</Label>
                <Input
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                  placeholder="TK"
                  maxLength={8}
                  className="font-mono"
                  disabled={!!form}
                />
                <p className="text-xs text-muted-foreground">
                  {form
                    ? "No se puede cambiar: los tickets ya emitidos lo usan."
                    : `Los tickets saldrán como ${(prefix || "TK").toUpperCase()}-0001, -0002…`}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>¿Es sobre una creadora?</Label>
                <Select value={creatorMode} onValueChange={(v) => setCreatorMode(v as CreatorMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CREATOR_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {CREATOR_MODES.find((m) => m.value === creatorMode)?.hint}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Icono</Label>
                <Select value={icon} onValueChange={setIcon}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(FORM_ICONS).map((k) => {
                      const I = FORM_ICONS[k];
                      return (
                        <SelectItem key={k} value={k}>
                          <span className="flex items-center gap-2">
                            <I className="h-4 w-4" />
                            {k}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Color</Label>
                <Select value={color} onValueChange={setColor}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(FORM_COLORS).map((k) => (
                      <SelectItem key={k} value={k}>
                        <span className="flex items-center gap-2">
                          <span className={`h-3 w-3 rounded-full ${FORM_COLORS[k].wrap}`} />
                          {k}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Destinatarios del correo */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="flex items-center gap-1.5">
                    <Mail className="h-4 w-4" />
                    Destinatarios del correo
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    A quién le llega el aviso al crearse un ticket de esta plantilla.
                  </p>
                </div>
                <Switch checked={notifyEnabled} onCheckedChange={setNotifyEnabled} />
              </div>

              {notifyEnabled && (
                <>
                  <div className="flex gap-2">
                    <Input
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          addEmail();
                        }
                      }}
                      placeholder="persona@unlok.me"
                      type="email"
                    />
                    <Button type="button" variant="outline" onClick={addEmail}>
                      Agregar
                    </Button>
                  </div>

                  {emails.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Sin destinatarios: el ticket se crea igual, pero no se avisa por correo.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {emails.map((e) => (
                        <Badge key={e} variant="secondary" className="gap-1 py-1 pl-2 pr-1">
                          <span className="text-xs">{e}</span>
                          <button
                            type="button"
                            onClick={() => setEmails(emails.filter((x) => x !== e))}
                            className="rounded-full p-0.5 hover:bg-background/60"
                            aria-label={`Quitar ${e}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <Separator />

            {/* Campos */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Campos del formulario</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFields([...fields, { ...EMPTY_FIELD }])}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Agregar campo
                </Button>
              </div>

              {fields.length === 0 && (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Sin campos todavía.
                </p>
              )}

              {fields.map((f, i) => (
                <Card key={i} className="space-y-3 p-3">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Input
                      value={f.label}
                      onChange={(e) => updateField(i, { label: e.target.value })}
                      placeholder="Etiqueta del campo (ej. Tipo de Problema)"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label="Subir"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => move(i, 1)}
                      disabled={i === fields.length - 1}
                      aria-label="Bajar"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setFields(fields.filter((_, x) => x !== i))}
                      aria-label="Quitar campo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-3 pl-6 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Tipo</Label>
                      <Select
                        value={f.field_type}
                        onValueChange={(v) => updateField(i, { field_type: v as FieldType })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Alimenta una columna del ticket</Label>
                      <Select
                        value={f.maps_to || "__none__"}
                        onValueChange={(v) => updateField(i, { maps_to: v === "__none__" ? "" : v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Solo queda en el ticket</SelectItem>
                          {MAPPABLE_COLUMNS.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {TYPES_WITH_OPTIONS.includes(f.field_type) && (
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs">Opciones (una por línea)</Label>
                        <Textarea
                          value={f.optionsText}
                          onChange={(e) => updateField(i, { optionsText: e.target.value })}
                          rows={4}
                          className="font-mono text-xs"
                          placeholder={"Chats\nCobro\nActitud"}
                        />
                        <p className="text-xs text-muted-foreground">
                          Si el valor guardado debe ser distinto al texto visible, usá{" "}
                          <code className="rounded bg-muted px-1">valor|Etiqueta</code> (ej.{" "}
                          <code className="rounded bg-muted px-1">high|Alta</code>). Es obligatorio
                          cuando el campo alimenta Prioridad o Compañía.
                        </p>
                      </div>
                    )}

                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs">Texto de ayuda</Label>
                      <Input
                        value={f.help_text}
                        onChange={(e) => updateField(i, { help_text: e.target.value })}
                        placeholder="Aclaración que ve quien llena el formulario."
                      />
                    </div>

                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={f.is_required}
                        onCheckedChange={(c) => updateField(i, { is_required: !!c })}
                      />
                      Obligatorio
                    </label>

                    <p className="self-center text-right text-xs text-muted-foreground">
                      clave:{" "}
                      <code className="rounded bg-muted px-1">
                        {f.field_key || slugifyFieldKey(f.label) || "—"}
                      </code>
                    </p>
                  </div>
                </Card>
              ))}
            </div>

            {problems.length > 0 && (
              <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3">
                <p className="text-xs font-medium text-destructive">
                  Hay {problems.length} {problems.length === 1 ? "cosa" : "cosas"} por corregir:
                </p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  {problems.map((p, i) => (
                    <li key={i} className="text-xs text-destructive">
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={problems.length > 0 || saveForm.isPending || saveFields.isPending}
          >
            {saveForm.isPending || saveFields.isPending ? "Guardando…" : "Guardar plantilla"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TicketFormEditor;
