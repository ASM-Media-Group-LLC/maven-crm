import { useEffect, useMemo, useRef, useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import {
  Plus,
  Copy,
  Trash2,
  GripHorizontal,
  X,
  Mail,
  Type,
  AlignLeft,
  Hash,
  DollarSign,
  Percent,
  Calendar,
  CircleDot,
  ListChecks,
  ToggleLeft,
  AtSign,
  Link2,
  Instagram,
  UserRound,
  Paperclip,
  Lock,
  Settings2,
  ListOrdered,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FORM_COLORS, FORM_ICONS, EDITOR_CANVAS } from "./ticketFormPresentation";
import {
  useTicketForms,
  TYPES_WITH_OPTIONS,
  MAPPABLE_COLUMNS,
  slugifyFieldKey,
  type FieldType,
  type TicketForm,
  type TicketFormField,
} from "./useTicketForms";

/**
 * Constructor de plantillas, con la misma anatomia que el editor de Google
 * Forms: tarjeta de encabezado, una tarjeta por pregunta que se expande solo al
 * seleccionarla, el tipo a la derecha, arrastre para reordenar y el pie con
 * duplicar / borrar / Obligatorio. Los ajustes de la plantilla (prefijo,
 * creadora, destinatarios) van en su propia pestana, igual que en Forms.
 */

/** Icono por tipo, como el desplegable de Forms. */
const TYPE_ICONS: Record<FieldType, LucideIcon> = {
  creator: Sparkles,
  text: Type,
  textarea: AlignLeft,
  number: Hash,
  currency: DollarSign,
  percent: Percent,
  date: Calendar,
  select: CircleDot,
  multiselect: ListChecks,
  checkbox: ToggleLeft,
  email: AtSign,
  url: Link2,
  instagram: Instagram,
  user: UserRound,
  drive_links: Paperclip,
};

const TYPE_LABELS: Record<FieldType, string> = {
  creator: "Creadora",
  text: "Respuesta corta",
  textarea: "Parrafo",
  number: "Numero",
  currency: "Monto ($)",
  percent: "Porcentaje (%)",
  date: "Fecha",
  select: "Opcion multiple",
  multiselect: "Casillas",
  checkbox: "Si / No",
  email: "Correo",
  url: "Enlace",
  instagram: "Instagram",
  user: "Empleado de Maven",
  drive_links: "Archivos de Drive",
};

const TYPE_ORDER: FieldType[] = [
  "creator",
  "text", "textarea", "select", "multiselect", "checkbox",
  "date", "number", "currency", "percent",
  "email", "url", "instagram", "user", "drive_links",
];

interface DraftOption {
  /** Vacio = el valor guardado es la etiqueta. */
  value: string;
  label: string;
}

interface DraftField {
  /** Id estable solo para React y el arrastre. */
  uid: string;
  label: string;
  field_key: string;
  field_type: FieldType;
  help_text: string;
  is_required: boolean;
  options: DraftOption[];
  maps_to: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fieldToDraft(f: TicketFormField, uid: string): DraftField {
  return {
    uid,
    label: f.label,
    field_key: f.field_key,
    field_type: f.field_type,
    help_text: f.help_text || "",
    is_required: f.is_required,
    options: (f.options || []).map((o) =>
      typeof o === "string" ? { value: "", label: o } : { value: o.value, label: o.label },
    ),
    maps_to: f.maps_to || "",
  };
}

/** Solo se manda `value` cuando difiere de la etiqueta. */
function serializeOptions(opts: DraftOption[]) {
  return opts
    .filter((o) => o.label.trim())
    .map((o) =>
      o.value.trim() ? { value: o.value.trim(), label: o.label.trim() } : o.label.trim(),
    );
}

interface Props {
  form: TicketForm | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TicketFormEditor = ({ form, open, onOpenChange }: Props) => {
  const { toast } = useToast();
  const { fieldsByForm, saveForm, saveFields } = useTicketForms({ includeUnpublished: true });

  const uidSeq = useRef(0);
  const nextUid = () => `f${++uidSeq.current}`;

  const [tab, setTab] = useState<"questions" | "settings">("questions");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prefix, setPrefix] = useState("");
  const [icon, setIcon] = useState("Ticket");
  const [color, setColor] = useState("slate");
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [emails, setEmails] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState("");
  const [fields, setFields] = useState<DraftField[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  // Forms no te grita con un panel de errores mientras escribis: solo al
  // intentar guardar. Antes estaba siempre visible y era puro ruido.
  const [showProblems, setShowProblems] = useState(false);
  const [askRecipients, setAskRecipients] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab("questions");
    if (form) {
      setName(form.name);
      setDescription(form.description || "");
      setPrefix(form.code_prefix);
      setIcon(form.icon);
      setColor(form.color);
      setNotifyEnabled(form.notify_enabled);
      setEmails(form.notify_emails || []);
      setPublished(form.is_published);
      setFields(fieldsByForm(form.id).map((f) => fieldToDraft(f, nextUid())));
    } else {
      setName("");
      setDescription("");
      setPrefix("");
      setIcon("Ticket");
      setColor("slate");
      setNotifyEnabled(true);
      setEmails([]);
      setPublished(false);
      setFields([
        {
          uid: nextUid(),
          label: "",
          field_key: "",
          field_type: "text",
          help_text: "",
          is_required: false,
          options: [],
          maps_to: "",
        },
      ]);
    }
    setSelected(null);
    setShowProblems(false);
    setAskRecipients(false);
    setEmailDraft("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form?.id]);

  /**
   * Pedido explicito: si la plantilla tiene una pregunta de tipo creadora,
   * SIEMPRE tiene que tener su casilla de Instagram. El formulario la
   * autocompleta con el handle del perfil al elegir la creadora, asi que nadie
   * la escribe a mano.
   */
  const hasCreatorField = fields.some((f) => f.field_type === "creator");

  useEffect(() => {
    if (!open || !hasCreatorField) return;
    setFields((prev) => {
      if (prev.some((f) => f.field_type === "instagram")) return prev;
      return [
        ...prev,
        {
          uid: nextUid(),
          label: "Link de Instagram",
          field_key: "link_instagram",
          field_type: "instagram",
          help_text: "Se completa solo con el perfil de la creadora.",
          is_required: false,
          options: [],
          maps_to: "",
        },
      ];
    });
  }, [hasCreatorField, open]);

  const addEmail = () => {
    const e = emailDraft.trim().toLowerCase();
    if (!e) return;
    if (!EMAIL_RE.test(e)) {
      toast({ title: "Correo invalido", description: e, variant: "destructive" });
      return;
    }
    if (!emails.includes(e)) setEmails([...emails, e]);
    setEmailDraft("");
  };

  const patch = (uid: string, p: Partial<DraftField>) =>
    setFields((prev) =>
      prev.map((f) => {
        if (f.uid !== uid) return f;
        const merged = { ...f, ...p };
        // La clave se deriva de la etiqueta mientras nadie la haya fijado a mano.
        if (p.label !== undefined && (!f.field_key || f.field_key === slugifyFieldKey(f.label))) {
          merged.field_key = slugifyFieldKey(p.label);
        }
        // Al pasar a un tipo con opciones, arrancar con una para que sea usable.
        if (p.field_type && TYPES_WITH_OPTIONS.includes(p.field_type) && !merged.options.length) {
          merged.options = [{ value: "", label: "Opcion 1" }];
        }
        return merged;
      }),
    );

  const addField = () => {
    const uid = nextUid();
    setFields((prev) => [
      ...prev,
      {
        uid,
        label: "",
        field_key: "",
        field_type: "text",
        help_text: "",
        is_required: false,
        options: [],
        maps_to: "",
      },
    ]);
    setSelected(uid);
  };

  const duplicateField = (uid: string) => {
    setFields((prev) => {
      const i = prev.findIndex((f) => f.uid === uid);
      if (i === -1) return prev;
      const copy: DraftField = {
        ...prev[i],
        uid: nextUid(),
        label: `${prev[i].label} (copia)`,
        field_key: "",
        options: prev[i].options.map((o) => ({ ...o })),
        // maps_to no se copia: dos campos no pueden alimentar la misma columna.
        maps_to: "",
      };
      copy.field_key = slugifyFieldKey(copy.label);
      const next = [...prev];
      next.splice(i + 1, 0, copy);
      return next;
    });
  };

  const onDragEnd = (r: DropResult) => {
    if (!r.destination || r.destination.index === r.source.index) return;
    setFields((prev) => {
      const next = [...prev];
      const [moved] = next.splice(r.source.index, 1);
      next.splice(r.destination!.index, 0, moved);
      return next;
    });
  };

  /** Errores que la base rechazaria, detectados antes de mandar. */
  const problems = useMemo(() => {
    const out: string[] = [];
    if (!name.trim()) out.push("La plantilla necesita un nombre.");
    if (!/^[A-Z][A-Z0-9]{0,7}$/.test(prefix.trim().toUpperCase()))
      out.push("El prefijo debe ser de 1 a 8 caracteres, empezando por letra (ej. TK).");

    if (fields.filter((f) => f.field_type === "creator").length > 1)
      out.push("Solo puede haber una pregunta de tipo Creadora por plantilla.");

    const keys = new Set<string>();
    const maps = new Set<string>();
    fields.forEach((f, i) => {
      const n = i + 1;
      if (!f.label.trim()) out.push(`La pregunta ${n} no tiene texto.`);
      const k = f.field_key || slugifyFieldKey(f.label);
      if (!/^[a-z][a-z0-9_]{0,48}$/.test(k))
        out.push(`"${f.label || n}" no produce una clave valida. Usa al menos una letra.`);
      else if (keys.has(k)) out.push(`Hay dos preguntas con la clave "${k}". Cambia una etiqueta.`);
      keys.add(k);

      if (TYPES_WITH_OPTIONS.includes(f.field_type) && serializeOptions(f.options).length === 0)
        out.push(`"${f.label || n}" necesita al menos una opcion.`);

      if (f.maps_to) {
        if (maps.has(f.maps_to)) out.push(`Dos preguntas apuntan a "${f.maps_to}". Solo una puede.`);
        maps.add(f.maps_to);

        // Este es el error que corrompe datos en silencio: guardar la etiqueta
        // visible en una columna con catalogo cerrado.
        const col = MAPPABLE_COLUMNS.find((c) => c.value === f.maps_to);
        if (col && "closedCatalog" in col && col.closedCatalog) {
          const opts = f.options.filter((o) => o.label.trim());
          if (!opts.length || opts.some((o) => !o.value.trim()))
            out.push(
              `"${f.label || n}" alimenta ${col.label}, que solo acepta valores del catalogo. Completa el "valor guardado" de cada opcion.`,
            );
        }
      }
    });
    return out;
  }, [name, prefix, fields]);

  const handleSave = async (alsoPublish?: boolean, skipRecipientCheck?: boolean) => {
    if (problems.length) {
      setShowProblems(true);
      setTab(problems[0].includes("prefijo") ? "settings" : "questions");
      toast({ title: "Revisa el formulario", description: problems[0], variant: "destructive" });
      return;
    }
    // Publicar sin destinatarios deja los tickets sin avisarle a nadie: es el
    // modo de falla silencioso de todo esto, asi que se recuerda antes.
    if (alsoPublish && !skipRecipientCheck && notifyEnabled && emails.length === 0) {
      setAskRecipients(true);
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
        creator_mode: "none",
        notify_enabled: notifyEnabled,
        notify_emails: emails,
        is_published: alsoPublish ?? published,
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
            options: TYPES_WITH_OPTIONS.includes(f.field_type) ? serializeOptions(f.options) : [],
            maps_to: f.maps_to || null,
          })),
      });
      onOpenChange(false);
    } catch {
      // Los toasts de error los emiten los hooks.
    }
  };

  const saving = saveForm.isPending || saveFields.isPending;
  const AccentIcon = FORM_ICONS[icon] || FORM_ICONS.Ticket;
  const accent = FORM_COLORS[color] || FORM_COLORS.slate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-screen max-h-screen w-screen max-w-none flex-col gap-0 rounded-none p-0"
        // El editor es de pantalla completa: cerrar con Esc por accidente
        // perderia todo el borrador.
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">
          {form ? `Editar plantilla ${form.name}` : "Nueva plantilla de ticket"}
        </DialogTitle>

        {/* ── Barra superior ─────────────────────────────────────────────── */}
        {/* pr-12: la X propia del DialogContent va en absolute right-3 top-3 y
            antes se montaba sobre los botones de la barra. */}
        <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2.5 pr-12">
          <div className={`rounded-lg p-1.5 ${accent.wrap}`}>
            <AccentIcon className={`h-4 w-4 ${accent.icon}`} />
          </div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Plantilla sin titulo"
            className="h-8 max-w-xs border-0 bg-transparent px-0 text-base font-medium shadow-none focus-visible:ring-0"
          />
          {prefix && (
            <Badge variant="outline" className="font-mono text-[10px]">
              {prefix.toUpperCase()}
            </Badge>
          )}

          <div className="ml-auto flex items-center gap-1 rounded-lg bg-muted p-0.5">
            <Button
              variant={tab === "questions" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setTab("questions")}
              className="h-7"
            >
              <ListOrdered className="mr-1.5 h-3.5 w-3.5" />
              Preguntas
            </Button>
            <Button
              variant={tab === "settings" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setTab("settings")}
              className="h-7"
            >
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              Ajustes
            </Button>
          </div>

          <Separator orientation="vertical" className="h-6" />

          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleSave()} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
          {!published && (
            <Button size="sm" onClick={() => handleSave(true)} disabled={saving}>
              Publicar
            </Button>
          )}
        </div>

        {/* ── Cuerpo ─────────────────────────────────────────────────────── */}
        <div className={`flex-1 overflow-y-auto px-4 py-8 ${EDITOR_CANVAS}`}>
          <div className="mx-auto flex w-full max-w-[832px] items-start gap-3">
            <div className="min-w-0 flex-1 space-y-3">
            {tab === "questions" ? (
              <>
                {/* Encabezado del formulario */}
                <div className="overflow-hidden rounded-lg border bg-card">
                  <div className={`h-[10px] w-full ${accent.bar}`} />
                  <div className="space-y-1 p-6">
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Plantilla sin titulo"
                      className="h-auto border-0 border-b border-transparent bg-transparent px-0 pb-1 !text-[28px] font-normal leading-tight shadow-none focus-visible:border-b-foreground/40 focus-visible:ring-0"
                    />
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Descripcion del formulario"
                      rows={1}
                      className="min-h-0 resize-none border-0 border-b border-transparent bg-transparent px-0 text-sm shadow-none focus-visible:border-b-primary focus-visible:ring-0"
                    />
                  </div>
                </div>

                {/* Preguntas */}
                <DragDropContext onDragEnd={onDragEnd}>
                  <Droppable droppableId="preguntas">
                    {(dropProvided) => (
                      <div
                        ref={dropProvided.innerRef}
                        {...dropProvided.droppableProps}
                        className="space-y-3"
                      >
                        {fields.map((f, i) => {
                          const isSel = selected === f.uid;
                          const TypeIcon = TYPE_ICONS[f.field_type];
                          const hasOptions = TYPES_WITH_OPTIONS.includes(f.field_type);
                          const mapped = MAPPABLE_COLUMNS.find((c) => c.value === f.maps_to);
                          const closed = mapped && "closedCatalog" in mapped && mapped.closedCatalog;
                          return (
                            <Draggable key={f.uid} draggableId={f.uid} index={i}>
                              {(dragProvided, snapshot) => (
                                <div
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  onClick={() => setSelected(f.uid)}
                                  className={`rounded-lg border bg-card transition-shadow ${
                                    isSel
                                      ? `border-l-[6px] ${accent.ring} shadow-lg`
                                      : "cursor-pointer shadow-sm hover:shadow-md"
                                  } ${snapshot.isDragging ? "shadow-2xl" : ""}`}
                                >
                                  {/* Asa de arrastre */}
                                  <div
                                    {...dragProvided.dragHandleProps}
                                    className="flex cursor-grab justify-center py-1 text-muted-foreground/50 hover:text-muted-foreground"
                                    aria-label="Arrastrar para reordenar"
                                  >
                                    <GripHorizontal className="h-4 w-4" />
                                  </div>

                                  <div className="px-5 pb-4">
                                    {isSel ? (
                                      <>
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                                          <Input
                                            value={f.label}
                                            onChange={(e) => patch(f.uid, { label: e.target.value })}
                                            placeholder="Pregunta sin titulo"
                                            className="flex-1 border-0 border-b bg-muted/50 focus-visible:border-b-primary focus-visible:ring-0"
                                          />
                                          <Select
                                            value={f.field_type}
                                            onValueChange={(v) =>
                                              patch(f.uid, { field_type: v as FieldType })
                                            }
                                          >
                                            <SelectTrigger className="sm:w-56">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {TYPE_ORDER.map((t) => {
                                                const I = TYPE_ICONS[t];
                                                return (
                                                  <SelectItem key={t} value={t}>
                                                    <span className="flex items-center gap-2">
                                                      <I className="h-4 w-4" />
                                                      {TYPE_LABELS[t]}
                                                    </span>
                                                  </SelectItem>
                                                );
                                              })}
                                            </SelectContent>
                                          </Select>
                                        </div>

                                        {/* Opciones */}
                                        {hasOptions && (
                                          <div className="mt-4 space-y-2">
                                            {f.options.map((o, oi) => (
                                              <div key={oi} className="flex items-center gap-2">
                                                {f.field_type === "select" ? (
                                                  <CircleDot className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                ) : (
                                                  <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                )}
                                                <Input
                                                  value={o.label}
                                                  onChange={(e) => {
                                                    const next = [...f.options];
                                                    next[oi] = { ...o, label: e.target.value };
                                                    patch(f.uid, { options: next });
                                                  }}
                                                  placeholder={`Opcion ${oi + 1}`}
                                                  className="flex-1 border-0 border-b bg-transparent px-0 shadow-none focus-visible:border-b-primary focus-visible:ring-0"
                                                />
                                                {closed && (
                                                  <Input
                                                    value={o.value}
                                                    onChange={(e) => {
                                                      const next = [...f.options];
                                                      next[oi] = { ...o, value: e.target.value };
                                                      patch(f.uid, { options: next });
                                                    }}
                                                    placeholder="valor guardado"
                                                    className="w-40 font-mono text-xs"
                                                  />
                                                )}
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-7 w-7 shrink-0"
                                                  aria-label="Quitar opcion"
                                                  onClick={() =>
                                                    patch(f.uid, {
                                                      options: f.options.filter((_, x) => x !== oi),
                                                    })
                                                  }
                                                >
                                                  <X className="h-3.5 w-3.5" />
                                                </Button>
                                              </div>
                                            ))}
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="text-muted-foreground"
                                              onClick={() =>
                                                patch(f.uid, {
                                                  options: [
                                                    ...f.options,
                                                    { value: "", label: "" },
                                                  ],
                                                })
                                              }
                                            >
                                              <Plus className="mr-1 h-3.5 w-3.5" />
                                              Anadir opcion
                                            </Button>
                                            {closed && (
                                              <p className="text-xs text-muted-foreground">
                                                Esta pregunta alimenta {mapped?.label}, que solo
                                                acepta valores de su catalogo. El texto de la
                                                izquierda es lo que se ve; el de la derecha es lo que
                                                se guarda (ej. <code>urgent</code>).
                                              </p>
                                            )}
                                          </div>
                                        )}

                                        <Input
                                          value={f.help_text}
                                          onChange={(e) => patch(f.uid, { help_text: e.target.value })}
                                          placeholder="Texto de ayuda (opcional)"
                                          className="mt-4 border-0 border-b bg-transparent px-0 text-xs shadow-none focus-visible:border-b-primary focus-visible:ring-0"
                                        />

                                        <Separator className="mt-4" />

                                        <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
                                          <Select
                                            value={f.maps_to || "__none__"}
                                            onValueChange={(v) =>
                                              patch(f.uid, { maps_to: v === "__none__" ? "" : v })
                                            }
                                          >
                                            <SelectTrigger className="h-8 w-auto gap-1.5 border-dashed text-xs">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="__none__">
                                                Solo queda en el ticket
                                              </SelectItem>
                                              {MAPPABLE_COLUMNS.map((c) => (
                                                <SelectItem key={c.value} value={c.value}>
                                                  Alimenta: {c.label}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>

                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            aria-label="Duplicar pregunta"
                                            onClick={() => duplicateField(f.uid)}
                                          >
                                            <Copy className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            aria-label="Borrar pregunta"
                                            onClick={() =>
                                              setFields(fields.filter((x) => x.uid !== f.uid))
                                            }
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                          <Separator orientation="vertical" className="h-6" />
                                          <label className="flex cursor-pointer items-center gap-2 text-sm">
                                            Obligatorio
                                            <Switch
                                              checked={f.is_required}
                                              onCheckedChange={(v) => patch(f.uid, { is_required: v })}
                                            />
                                          </label>
                                        </div>
                                      </>
                                    ) : (
                                      /* Colapsada: solo lo esencial, como en Forms */
                                      <div className="flex items-center gap-3">
                                        <TypeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        <span
                                          className={`truncate text-sm ${
                                            f.label ? "" : "text-muted-foreground"
                                          }`}
                                        >
                                          {f.label || "Pregunta sin titulo"}
                                        </span>
                                        {f.is_required && (
                                          <span className="text-destructive">*</span>
                                        )}
                                        {f.maps_to && (
                                          <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                                            {mapped?.label}
                                          </Badge>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {dropProvided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>

                <Button
                  variant="outline"
                  className="w-full justify-center border-dashed bg-card/60 hover:bg-card"
                  onClick={addField}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Anadir pregunta
                </Button>

                {showProblems && problems.length > 0 && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3">
                    <p className="text-xs font-medium text-destructive">
                      Falta corregir {problems.length}{" "}
                      {problems.length === 1 ? "cosa" : "cosas"}:
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
              </>
            ) : (
              /* ── Ajustes ─────────────────────────────────────────────── */
              <div className="space-y-3">
                <div className="space-y-4 rounded-lg border bg-card p-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Prefijo del codigo *</Label>
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
                          : `Los tickets saldran como ${(prefix || "TK").toUpperCase()}-0001, -0002...`}
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
                </div>

                <div className="space-y-3 rounded-lg border bg-card p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="flex items-center gap-1.5">
                        <Mail className="h-4 w-4" />
                        Destinatarios del correo
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        A quien le llega el aviso al crearse un ticket de esta plantilla.
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
              </div>
            )}
            </div>

            {/* Barra flotante de acciones, como la de Forms al costado */}
            {tab === "questions" && (
              <div className="sticky top-0 flex flex-col gap-1 rounded-xl border bg-card p-1 shadow-sm">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={addField}
                  aria-label="Anadir pregunta"
                  title="Anadir pregunta"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTab("settings")}
                  aria-label="Ajustes de la plantilla"
                  title="Ajustes de la plantilla"
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Recordatorio de destinatarios al publicar */}
        <AlertDialog open={askRecipients} onOpenChange={setAskRecipients}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Nadie va a recibir el aviso</AlertDialogTitle>
              <AlertDialogDescription>
                Esta plantilla no tiene destinatarios de correo. Los tickets se van a crear
                igual, pero no se le va a avisar a nadie — y ese es el tipo de falla que no se
                nota hasta que alguien pregunta por un ticket que nadie vio.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setAskRecipients(false);
                  setTab("settings");
                }}
              >
                Agregar destinatarios
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setAskRecipients(false);
                  // skip: si no, el propio aviso se vuelve a disparar en bucle.
                  void handleSave(true, true);
                }}
              >
                Publicar sin correo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
};

export default TicketFormEditor;
