import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";

/**
 * Plantillas de ticket: el equivalente en Maven al Google Form de la hoja de
 * Quejas. El equipo las arma desde la UI y cada una publicada aparece como una
 * tarjeta en el tab de Tickets.
 */

export const FIELD_TYPES = [
  { value: "text", label: "Texto corto" },
  { value: "textarea", label: "Texto largo" },
  { value: "number", label: "Número" },
  { value: "currency", label: "Monto ($)" },
  { value: "percent", label: "Porcentaje (%)" },
  { value: "date", label: "Fecha" },
  { value: "select", label: "Lista (una opción)" },
  { value: "multiselect", label: "Lista (varias opciones)" },
  { value: "checkbox", label: "Sí / No" },
  { value: "email", label: "Correo" },
  { value: "url", label: "Enlace" },
  { value: "instagram", label: "Instagram" },
  { value: "user", label: "Miembro del equipo" },
  { value: "drive_links", label: "Enlaces de Drive (pruebas)" },
] as const;

export type FieldType = (typeof FIELD_TYPES)[number]["value"];

/** Tipos que aceptan opciones. Sin opciones, la base rechaza el campo. */
export const TYPES_WITH_OPTIONS: FieldType[] = ["select", "multiselect"];

/**
 * Columnas reales de `tickets` que un campo puede alimentar además de quedar en
 * `answers`. Es lo que mantiene vivos los filtros, el kanban y los estados.
 */
export const MAPPABLE_COLUMNS = [
  { value: "title", label: "Título del ticket" },
  { value: "description", label: "Descripción" },
  { value: "priority", label: "Prioridad", closedCatalog: true },
  { value: "assigned_to", label: "Asignado a" },
  { value: "company", label: "Compañía", closedCatalog: true },
  { value: "creator_notes", label: "Notas de la creadora" },
] as const;

export const CREATOR_MODES = [
  { value: "required", label: "Obligatoria", hint: "El ticket no se puede crear sin elegir creadora." },
  { value: "optional", label: "Opcional", hint: "Se puede elegir, pero no es obligatorio." },
  { value: "none", label: "No aplica", hint: "Esta plantilla no es sobre una creadora." },
] as const;

export type CreatorMode = (typeof CREATOR_MODES)[number]["value"];

/** Una opción puede ser texto simple o par valor/etiqueta. */
export type FieldOption = string | { value: string; label: string };

export interface TicketForm {
  id: string;
  name: string;
  description: string | null;
  code_prefix: string;
  icon: string;
  color: string;
  creator_mode: CreatorMode;
  notify_emails: string[];
  notify_enabled: boolean;
  next_number: number;
  is_published: boolean;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface TicketFormField {
  id: string;
  form_id: string;
  label: string;
  field_key: string;
  field_type: FieldType;
  help_text: string | null;
  placeholder: string | null;
  is_required: boolean;
  options: FieldOption[];
  maps_to: string | null;
  position: number;
  created_at: string;
}

export function optionValue(opt: FieldOption): string {
  return typeof opt === "string" ? opt : opt.value;
}

export function optionLabel(opt: FieldOption): string {
  return typeof opt === "string" ? opt : opt.label;
}

/**
 * Deriva una field_key válida a partir de la etiqueta. La base exige
 * `^[a-z][a-z0-9_]{0,48}$`, así que hay que sacar tildes, ñ y símbolos —
 * si no, el insert se rechaza y el usuario no entiende por qué.
 */
export function slugifyFieldKey(label: string): string {
  const base = label
    .normalize("NFD")
    // Diacríticos combinantes por escape, no como caracteres literales en el fuente.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 49);
  // Debe empezar por letra.
  return /^[a-z]/.test(base) ? base : `campo_${base}`.slice(0, 49);
}

export function useTicketForms(options?: { includeUnpublished?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const includeUnpublished = options?.includeUnpublished ?? false;

  const formsQuery = useQuery({
    queryKey: ["ticket-forms", includeUnpublished],
    queryFn: async () => {
      let q = supabase
        .from("ticket_forms")
        .select("*")
        .is("archived_at", null)
        .order("position")
        .order("name");
      if (!includeUnpublished) q = q.eq("is_published", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as TicketForm[];
    },
  });

  const fieldsQuery = useQuery({
    queryKey: ["ticket-form-fields"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_form_fields")
        .select("*")
        .order("position");
      if (error) throw error;
      return (data || []) as unknown as TicketFormField[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["ticket-forms"] });
    queryClient.invalidateQueries({ queryKey: ["ticket-form-fields"] });
  };

  const saveForm = useMutation({
    mutationFn: async (form: Partial<TicketForm> & { name: string; code_prefix: string }) => {
      const payload = { ...form, code_prefix: form.code_prefix.toUpperCase() };
      if (form.id) {
        const { error } = await supabase
          .from("ticket_forms")
          .update(payload as any)
          .eq("id", form.id);
        if (error) throw error;
        return form.id;
      }
      const { data, error } = await supabase
        .from("ticket_forms")
        .insert(payload as any)
        .select("id")
        .single();
      if (error) throw error;
      return (data as any).id as string;
    },
    onSuccess: () => {
      toast({ title: "Plantilla guardada" });
      invalidate();
    },
    onError: (error: Error) => {
      // El índice único del prefijo es la causa más frecuente y el mensaje de
      // Postgres no le dice nada al usuario.
      const msg = /ticket_forms_code_prefix_key/.test(error.message)
        ? "Ese prefijo ya está en uso por otra plantilla. Elegí otro."
        : error.message;
      toast({ title: "Error al guardar la plantilla", description: msg, variant: "destructive" });
    },
  });

  const deleteForm = useMutation({
    mutationFn: async (id: string) => {
      // Archivar, no borrar: los tickets ya creados siguen apuntando acá y su
      // prefijo no se puede reutilizar.
      const { error } = await supabase
        .from("ticket_forms")
        .update({ archived_at: new Date().toISOString(), is_published: false } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Plantilla archivada" });
      invalidate();
    },
    onError: (error: Error) => {
      toast({ title: "Error al archivar", description: error.message, variant: "destructive" });
    },
  });

  const togglePublished = useMutation({
    mutationFn: async ({ id, is_published }: { id: string; is_published: boolean }) => {
      const { error } = await supabase
        .from("ticket_forms")
        .update({ is_published } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast({ title: v.is_published ? "Plantilla publicada" : "Plantilla despublicada" });
      invalidate();
    },
    onError: (error: Error) => {
      toast({ title: "Error al publicar", description: error.message, variant: "destructive" });
    },
  });

  /**
   * Reemplaza el set completo de campos de una plantilla. Es más simple y
   * predecible que diffear altas/bajas/reordenamientos uno por uno, y la
   * cascada del form_id mantiene la integridad.
   */
  const saveFields = useMutation({
    mutationFn: async ({ formId, fields }: { formId: string; fields: Partial<TicketFormField>[] }) => {
      const { error: delError } = await supabase
        .from("ticket_form_fields")
        .delete()
        .eq("form_id", formId);
      if (delError) throw delError;

      if (!fields.length) return;

      const rows = fields.map((f, i) => ({
        form_id: formId,
        label: (f.label || "").trim(),
        field_key: f.field_key || slugifyFieldKey(f.label || ""),
        field_type: f.field_type || "text",
        help_text: f.help_text?.trim() || null,
        placeholder: f.placeholder?.trim() || null,
        is_required: !!f.is_required,
        options: TYPES_WITH_OPTIONS.includes((f.field_type || "text") as FieldType)
          ? f.options || []
          : [],
        maps_to: f.maps_to || null,
        position: (i + 1) * 10,
      }));

      const { error } = await supabase.from("ticket_form_fields").insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Campos guardados" });
      invalidate();
    },
    onError: (error: Error) => {
      const msg = /ticket_form_fields_options_needed/.test(error.message)
        ? "Las listas necesitan al menos una opción."
        : /ticket_form_fields_form_key_key/.test(error.message)
        ? "Hay dos campos con la misma clave. Cambiá una de las etiquetas."
        : /ticket_form_fields_form_maps_to_key/.test(error.message)
        ? "Dos campos apuntan a la misma columna del ticket. Solo uno puede."
        : /ticket_form_fields_key_format/.test(error.message)
        ? "Una etiqueta no produce una clave válida. Usá al menos una letra."
        : error.message;
      toast({ title: "Error al guardar los campos", description: msg, variant: "destructive" });
    },
  });

  const fieldsByForm = (formId: string) =>
    (fieldsQuery.data || []).filter((f) => f.form_id === formId).sort((a, b) => a.position - b.position);

  return {
    formsQuery,
    fieldsQuery,
    fieldsByForm,
    saveForm,
    saveFields,
    deleteForm,
    togglePublished,
  };
}

/** Crea el ticket vía RPC: código consecutivo + validación + insert, atómico. */
export function useCreateTicketFromForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: { formId: string; answers: Record<string, unknown>; creatorId?: string | null }) => {
      const { data, error } = await supabase.rpc("create_ticket_from_form", {
        p_form_id: args.formId,
        p_answers: args.answers as Json,
        p_creator_id: args.creatorId ?? null,
      });
      if (error) throw error;
      const ticket = data as unknown as { id: string; ticket_code: string };

      // El aviso por correo se dispara aparte y NO bloquea la creación: si el
      // relay falla, el ticket ya quedó guardado y se avisa distinto. Es lo
      // contrario del Apps Script, donde un correo inválido abortaba todo.
      try {
        await supabase.functions.invoke("ticket-notify", {
          body: { ticket_id: ticket.id },
        });
      } catch (e) {
        console.warn("ticket-notify falló; el ticket sí se creó", e);
      }

      return ticket;
    },
    onSuccess: (ticket) => {
      toast({ title: `Ticket ${ticket?.ticket_code || ""} creado` });
      queryClient.invalidateQueries({ queryKey: ["tickets-module"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-forms"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error al crear el ticket", description: error.message, variant: "destructive" });
    },
  });
}
