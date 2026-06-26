import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle } from "lucide-react";
import EvidenceUploader from "@/components/leadgen/EvidenceUploader";
import { MaskedPhone } from "@/components/MaskedPhone";
import { LeadAutocomplete, type LeadAutocompleteLead } from "@/components/leadgen/LeadAutocomplete";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneInput } from "@/components/ui/phone-input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { normalizeHandle } from "@/lib/handle-utils";
import { enqueueAvatarFetch } from "@/lib/avatarFetch";
import { checkCreatorExists, checkExistingContact } from "@/lib/lead-validation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useScouterCompanies } from "@/hooks/useScouterLeads";

const contactoSchema = z.object({
  nombre: z.string().trim().min(1, "Nombre requerido").max(100, "Máximo 100 caracteres"),
  instagram: z.string().trim().min(1, "Link de Instagram requerido").max(255, "Máximo 255 caracteres"),
  categoriaFisica: z.string().min(1, "Categoría requerida"),
  compania: z.string().optional(),
  paisCodigo: z.string().default("+57"),
  telefono: z.string().max(15, "Máximo 15 dígitos").optional(),
  notas: z.string().max(500, "Máximo 500 caracteres").optional(),
});

type ContactoFormValues = z.infer<typeof contactoSchema>;

// Reglas de evidencia para AddContactoModal:
//   MIN_EVIDENCE = 4 → impuesto por el jefe ("queremos ver pruebas reales
//     del primer contacto antes de pasarlo a closers, mínimo 4 screenshots")
//   MAX_EVIDENCE = 8 → tope técnico para no abusar de storage
//
// El bloque queda como parte del flow: si el LG no adjunta al menos 4,
// el botón "Guardar" queda deshabilitado.
const MIN_EVIDENCE = 4;
const MAX_EVIDENCE = 8;

// Helper: sube cada archivo al bucket creator-files y crea la fila en
// closers_contacts_evidence_files con FK al contacto. Falla loud — si
// un upload falla, el caller debe ver el error y decidir (ya el contacto
// fue creado, así que un retry parcial puede dejar evidencia incompleta).
async function uploadContactEvidence(
  contactId: string,
  files: File[],
  uploadedBy: string,
  // Importar supabase via param para no bindear el módulo afuera de la
  // función (la signature del módulo ya lo importa).
  supabaseClient: typeof import("@/integrations/supabase/client").supabase,
): Promise<void> {
  for (const file of files) {
    const filePath = `contacts/${contactId}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabaseClient.storage
      .from("creator-files")
      .upload(filePath, file);
    if (uploadError) throw uploadError;
    const { data: signed } = await supabaseClient.storage
      .from("creator-files")
      .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 año
    await supabaseClient
      .from("closers_contacts_evidence_files" as never)
      .insert({
        contact_id: contactId,
        file_url: signed?.signedUrl || filePath,
        file_type: file.type,
        uploaded_by: uploadedBy,
      } as never);
  }
}

interface AddContactoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Extrae el handle de Instagram de un input que puede ser:
 *   · "https://www.instagram.com/usuario/?source=..."
 *   · "instagram.com/usuario"
 *   · "@usuario"
 *   · "usuario"
 *
 * Devuelve null si no parece un handle válido (input muy corto, vacío,
 * sólo símbolos, etc.). Usado para el reverse lookup IG → lead en
 * AddContactoModal — necesita disparar SÓLO cuando el user metió algo
 * que parezca un handle real, no en cada tecla.
 */
function extractIgHandle(input: string): string | null {
  if (!input) return null;
  const cleaned = input.trim();
  // URL completo de Instagram
  const url = cleaned.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
  if (url) return url[1].toLowerCase().replace(/\/$/, "");
  // @user o user
  const at = cleaned.match(/^@?([a-zA-Z0-9._]{3,30})$/);
  if (at) return at[1].toLowerCase();
  return null;
}


const AddContactoModal = ({ open, onOpenChange }: AddContactoModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingContactData, setExistingContactData] = useState<{
    id: string; name: string; phone?: string; email?: string; agentName?: string; createdAt?: string;
  } | null>(null);
  const [isUpdatingContact, setIsUpdatingContact] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<ContactoFormValues | null>(null);
  // Lead obligatorio: el contacto debe venir de un lead existente en
  // leadgen_entries. Flujo unificado LG → Contactos: el LLG primero
  // loguea el lead, después acá lo selecciona al conseguir el tel.
  const [selectedLead, setSelectedLead] = useState<LeadAutocompleteLead | null>(null);
  const [leadError, setLeadError] = useState<string | null>(null);
  // Evidencia obligatoria — mínimo 4 screenshots (regla del jefe).
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();
  // Compañías canónicas — lista fija, no se permite texto libre.
  const { data: scouterCompanies = [] } = useScouterCompanies();

  const form = useForm<ContactoFormValues>({
    resolver: zodResolver(contactoSchema),
    defaultValues: {
      nombre: "",
      instagram: "",
      categoriaFisica: "",
      compania: "",
      paisCodigo: "+57",
      telefono: "",
      notas: "",
    },
  });

  const queryClient = useQueryClient();

  // El último IG que escribió el AUTOFILL (no el usuario). El reverse-lookup
  // por IG lo usa para NO re-seleccionar el lead a partir del IG que él mismo
  // dejó: sin esto, al borrar el nombre, el IG residual re-seleccionaba el
  // lead y el nombre "se volvía a poner solo".
  const autofilledIgRef = useRef("");

  // Auto-fill al seleccionar un lead (desde el autocomplete por nombre O
  // desde el reverse lookup por IG link — ambos terminan en setSelectedLead).
  //
  // 2 pasos para que sea INSTANTÁNEO y ROBUSTO:
  //  1) SÍNCRONO: lleno YA todo lo que el autocomplete (RPC) ya trae en
  //     `selectedLead` — nombre, IG (reconstruido del handle), compañía,
  //     notas, país, teléfono. Sin esperar red → feedback inmediato.
  //  2) ASYNC (best-effort): el RPC NO trae `quality` (categoría) ni
  //     `source_link` (link IG real), así que los busco por id y, si llegan,
  //     completo la categoría y mejoro el IG. Va en try/catch: si la red
  //     falla o tarda, los campos del paso 1 ya quedaron cargados igual.
  useEffect(() => {
    if (!selectedLead) return;
    const lead = selectedLead;

    // ── Paso 1: llenado inmediato (sin red) ──────────────────────────────
    if (lead.model_handle) {
      form.setValue("nombre", lead.model_handle);
      const igFromHandle = `https://instagram.com/${String(lead.model_handle).replace(/^@/, "")}`;
      form.setValue("instagram", igFromHandle);
      autofilledIgRef.current = igFromHandle;
    }
    if (lead.company) {
      const canon = scouterCompanies.find(
        (sc) => sc.name.toLowerCase() === String(lead.company).toLowerCase(),
      );
      form.setValue("compania", canon?.name ?? lead.company);
    }
    if (lead.country_code) {
      const cc = String(lead.country_code).startsWith("+") ? lead.country_code : `+${lead.country_code}`;
      form.setValue("paisCodigo", cc);
    }
    if (lead.phone_raw) form.setValue("telefono", lead.phone_raw);
    if (lead.notes) form.setValue("notas", lead.notes);

    // ── Paso 2: enriquecer categoría (quality) + IG real (source_link) ───
    const id = lead.id;
    let cancelled = false;
    (async () => {
      try {
        const { data: full } = await supabase
          .from("leadgen_entries")
          .select("quality, source_link")
          .eq("id", id)
          .maybeSingle();
        if (cancelled || !full) return;
        const q = (full as { quality?: string | null }).quality;
        const src = (full as { source_link?: string | null }).source_link;
        // Categoría canónica en MAYÚSCULA (A+/A/B+/B/C), igual que los demás forms.
        if (q) form.setValue("categoriaFisica", String(q).toUpperCase());
        // Mejorar el IG reconstruido por el link real que cargó el LLG.
        if (src && /instagram\.com/i.test(src)) {
          form.setValue("instagram", src);
          autofilledIgRef.current = src;
        }
      } catch {
        /* red caída — los campos del paso 1 ya están; no rompemos el autofill */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLead?.id]);

  // Reverse lookup: si el user pega un link de IG (o un @user) y todavía
  // no seleccionó un lead, buscamos el lead por handle y lo seteamos.
  // Eso dispara el useEffect de arriba que auto-llena nombre + resto.
  // Mirror simétrico del autocomplete por nombre que llena el IG link.
  const igFieldValue = form.watch("instagram");
  // Reactivos para el PhoneInput: el componente es 100% controlado (deriva el
  // número del prop `value` en cada render). Si le pasáramos `form.getValues`,
  // que NO dispara re-render, el input de teléfono queda "congelado" al tipear.
  // Con watch se recalcula el value en cada cambio y el input acepta input.
  const paisCodigoVal = form.watch("paisCodigo");
  const telefonoVal = form.watch("telefono");
  useEffect(() => {
    if (selectedLead) return; // ya hay lead — no pisar
    if (!igFieldValue) return;
    // Si el IG es el que dejó el AUTOFILL (no algo que tipeó el usuario), NO
    // re-seleccionamos: sin esto, borrar el nombre re-disparaba la selección
    // desde el IG residual y el nombre "se volvía a poner solo".
    if (igFieldValue === autofilledIgRef.current) return;
    const handle = extractIgHandle(igFieldValue);
    if (!handle) return;

    let cancelled = false;
    // Debounce 400ms para no disparar query en cada tecla.
    const t = setTimeout(async () => {
      if (cancelled) return;
      const { data } = await supabase
        .from("leadgen_entries")
        .select(
          "id, model_handle, ticket_number, phone_raw, phone_e164, country_code, city, company, platform, onlyfans_url, notes, lg_user_id",
        )
        .ilike("model_handle", handle)
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      const lead = (data ?? [])[0];
      if (!lead) return;
      // Enriquecer con el nombre del LLG (mismo patrón que LeadAutocomplete).
      let llgName: string | null = null;
      if (lead.lg_user_id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", lead.lg_user_id)
          .maybeSingle();
        llgName = (prof as { full_name?: string } | null)?.full_name ?? null;
      }
      setSelectedLead({ ...lead, llgName } as LeadAutocompleteLead);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [igFieldValue, selectedLead]);

  const onSubmit = async (data: ContactoFormValues) => {
    // Regla nueva del flujo unificado: el contacto debe venir de un
    // lead. Si no aparece en el autocomplete, el LLG debe crear el
    // lead primero en LeadGen.
    if (!selectedLead) {
      setLeadError("Tenés que seleccionar un lead existente. Si no aparece, agregalo primero en LeadGen.");
      return;
    }
    // Evidencia obligatoria — mínimo 4 capturas.
    if (evidenceFiles.length < MIN_EVIDENCE) {
      toast({
        title: "Evidencia insuficiente",
        description: `Necesitás adjuntar al menos ${MIN_EVIDENCE} screenshots del contacto para guardar.`,
        variant: "destructive",
      });
      return;
    }
    setLeadError(null);
    setIsSubmitting(true);
    try {
      // VALIDATION 1: Check if creator exists (status-aware)
      const normalizedIg = normalizeHandle(data.instagram);
      let recordType = "nuevo";

      if (normalizedIg) {
        const creatorCheck = await checkCreatorExists(data.instagram);
        if (creatorCheck.exists) {
          if (creatorCheck.isActive) {
            toast({
              title: "❌ Creadora activa",
              description: `${creatorCheck.creatorName} ya forma parte de la agencia con estado "${creatorCheck.creatorStatus}". No se puede registrar.`,
              variant: "destructive",
            });
            setIsSubmitting(false);
            return;
          }
          // Inactive creator — allow (warning style)
          recordType = "reactivado";
          toast({
            title: "⚠️ Creadora inactiva detectada",
            description: `${creatorCheck.creatorName} tiene estado "${creatorCheck.creatorStatus}". Se registrará como contacto reactivado.`,
          });
        }
      }

      // VALIDATION 2: Check existing contact by handle — show modal
      if (normalizedIg) {
        const existingContact = await checkExistingContact(normalizedIg);
        if (existingContact.exists) {
          setExistingContactData({
            id: existingContact.contactId!,
            name: existingContact.contactName!,
            phone: existingContact.contactPhone,
            email: existingContact.contactEmail,
            agentName: existingContact.contactAgentName,
            createdAt: existingContact.contactCreatedAt,
          });
          setPendingFormData(data);
          setIsSubmitting(false);
          return;
        }
      }

      // Phone duplicate check — WARNING only, does NOT block
      const trimmedPhone = data.telefono?.trim();
      if (trimmedPhone) {
        const fullPhone = `${data.paisCodigo}${trimmedPhone}`;
        // Dedup server-side (phone está revocado para no-admin): el RPC lee el número y
        // devuelve SOLO el nombre del match, sin exponer PII.
        const { data: contactName } = await supabase.rpc("find_contact_name_by_phone", { p_phone: trimmedPhone } as never);
        if (contactName) {
          toast({
            title: "⚠️ Teléfono ya registrado",
            description: `Este número ya está registrado para ${contactName}. El contacto se guardará de todos modos.`,
          });
        }
        const { data: creatorName } = await supabase.rpc("find_creator_name_by_phone", { p_phone: fullPhone } as never);
        if (creatorName) {
          toast({
            title: "⚠️ Teléfono en creators",
            description: `Este número ya existe para la creadora ${creatorName}. El contacto se guardará de todos modos.`,
          });
        }
      }

      const { data: inserted, error } = await supabase.from("closers_contacts").insert({
        name: data.nombre,
        handle: normalizedIg || data.instagram,
        platform: "Instagram",
        physical_appearance: data.categoriaFisica,
        company: data.compania || null,
        // Dual-write: lookup company_id desde el name elegido en la lista.
        company_id: scouterCompanies.find((sc) => sc.name === data.compania)?.id ?? null,
        country_code: data.paisCodigo,
        phone: data.telefono || null,
        notes: data.notas || null,
        created_by: user?.id ?? "",
        record_type: recordType,
        // Flujo unificado: link al lead origen. La attribution del LLG
        // original se lee via JOIN a leadgen_entries.lg_user_id.
        leadgen_entry_id: selectedLead?.id ?? null,
      } as any).select("id").single();

      if (error) throw error;

      // Subir evidencia. Si falla, el contacto ya quedó creado — avisamos
      // pero no rollback (el LG puede retry desde el detalle).
      if (inserted && user?.id) {
        try {
          await uploadContactEvidence(
            (inserted as { id: string }).id,
            evidenceFiles,
            user.id,
            supabase,
          );
        } catch (e: any) {
          toast({
            title: "Contacto creado, pero algunas capturas no subieron",
            description: e?.message ?? "Reintentá desde el detalle del contacto.",
            variant: "destructive",
          });
        }
      }

      // Marcar el lead como contactado — sync espejo del ConvertLeadModal.
      if (selectedLead?.id) {
        await supabase
          .from("leadgen_entries")
          .update({ status: "contactado" } as any)
          .eq("id", selectedLead.id);
        queryClient.invalidateQueries({ queryKey: ["leadgen-entries"] });
        queryClient.invalidateQueries({ queryKey: ["leadgen-entries-range"] });
      }

      // Avatar fetch async — el worker descarga foto IG y la pone en
      // models.avatar_url (idempotente). No bloqueamos el submit.
      void enqueueAvatarFetch(normalizedIg || data.instagram);

      toast({ title: "Contacto guardado exitosamente" });
      queryClient.invalidateQueries({ queryKey: ["closers-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      form.reset();
      setSelectedLead(null);
      setLeadError(null);
      setEvidenceFiles([]);
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error al guardar contacto", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateExistingContact = async () => {
    if (!existingContactData || !pendingFormData) return;
    setIsUpdatingContact(true);
    try {
      const updates: Record<string, any> = {};
      if (pendingFormData.telefono?.trim()) updates.phone = pendingFormData.telefono.trim();
      if (pendingFormData.notas?.trim()) updates.notes = pendingFormData.notas.trim();
      if (pendingFormData.paisCodigo) updates.country_code = pendingFormData.paisCodigo;

      if (Object.keys(updates).length === 0) {
        toast({ title: "No hay datos nuevos para actualizar", variant: "destructive" });
        setIsUpdatingContact(false);
        return;
      }

      const { error } = await supabase
        .from("closers_contacts")
        .update(updates)
        .eq("id", existingContactData.id);

      if (error) throw error;

      toast({ title: "Contacto actualizado exitosamente" });
      setExistingContactData(null);
      setPendingFormData(null);
      queryClient.invalidateQueries({ queryKey: ["closers-contacts"] });
      form.reset(); setSelectedLead(null); setLeadError(null);
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error al actualizar", description: err.message, variant: "destructive" });
    } finally {
      setIsUpdatingContact(false);
    }
  };

  const handleCreateNewAnyway = async () => {
    if (!pendingFormData) return;
    setExistingContactData(null);
    setPendingFormData(null);
    setIsSubmitting(true);
    try {
      const normalizedIg = normalizeHandle(pendingFormData.instagram);
      const { data: inserted, error } = await supabase.from("closers_contacts").insert({
        name: pendingFormData.nombre,
        handle: normalizedIg || pendingFormData.instagram,
        platform: "Instagram",
        physical_appearance: pendingFormData.categoriaFisica,
        company: pendingFormData.compania || null,
        company_id: scouterCompanies.find((sc) => sc.name === pendingFormData.compania)?.id ?? null,
        country_code: pendingFormData.paisCodigo,
        phone: pendingFormData.telefono || null,
        notes: pendingFormData.notas || null,
        created_by: user?.id ?? "",
        record_type: "reactivado",
        leadgen_entry_id: selectedLead?.id ?? null,
      } as any).select("id").single();
      if (error) throw error;

      // Subir evidencia también en el path "crear duplicado de todos modos".
      if (inserted && user?.id && evidenceFiles.length > 0) {
        try {
          await uploadContactEvidence(
            (inserted as { id: string }).id,
            evidenceFiles,
            user.id,
            supabase,
          );
        } catch (e: any) {
          toast({
            title: "Contacto creado, pero algunas capturas no subieron",
            description: e?.message ?? "Reintentá desde el detalle del contacto.",
            variant: "destructive",
          });
        }
      }

      if (selectedLead?.id) {
        await supabase
          .from("leadgen_entries")
          .update({ status: "contactado" } as any)
          .eq("id", selectedLead.id);
      }
      void enqueueAvatarFetch(normalizedIg || pendingFormData.instagram);
      toast({ title: "Contacto guardado exitosamente" });
      queryClient.invalidateQueries({ queryKey: ["closers-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      form.reset();
      setSelectedLead(null);
      setLeadError(null);
      setEvidenceFiles([]);
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error al guardar contacto", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="pr-8">
          <DialogTitle>Nuevo Contacto</DialogTitle>
          <DialogDescription>Agrega un nuevo contacto al sistema.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <div className="overflow-y-auto max-h-[60vh] space-y-4 pr-1">
              <FormField
                control={form.control}
                name="nombre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Lead *</FormLabel>
                    <FormControl>
                      <LeadAutocomplete
                        value={field.value}
                        onTypedChange={(v) => field.onChange(v)}
                        selectedLead={selectedLead}
                        onLeadSelect={(lead) => {
                          setSelectedLead(lead);
                          setLeadError(null);
                          // Auto-fill se maneja en el useEffect arriba
                          // (centralizado para que funcione también
                          // cuando el lead viene del reverse lookup por
                          // IG link, no sólo del autocomplete por nombre).
                        }}
                        error={!!leadError}
                      />
                    </FormControl>
                    {selectedLead && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Desde lead{" "}
                        <code className="rounded bg-muted/40 px-1 py-0.5">
                          {selectedLead.ticket_number || `#${selectedLead.id.slice(0, 6)}`}
                        </code>
                        {selectedLead.llgName && ` · logueado por ${selectedLead.llgName}`}
                      </p>
                    )}
                    {leadError && (
                      <p className="text-xs text-destructive mt-1">{leadError}</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="instagram"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Link de Instagram *</FormLabel>
                    <FormControl>
                      <Input placeholder="@usuario o https://instagram.com/usuario" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="categoriaFisica"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoría Física *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona categoría" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="A+">A+ (Premium)</SelectItem>
                        <SelectItem value="A">A (Alta)</SelectItem>
                        <SelectItem value="B+">B+ (Media Alta)</SelectItem>
                        <SelectItem value="B">B (Media)</SelectItem>
                        <SelectItem value="C">C (Básica)</SelectItem>
                        <SelectItem value="Potencial">Potencial</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="compania"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Compañía</FormLabel>
                    {/* Lista fija desde scouter_companies (canónica).
                        El value que se guarda es el name — se mapea a
                        company_id en el insert vía dual-write. */}
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona la compañía" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {scouterCompanies.map((sc) => (
                          <SelectItem key={sc.id} value={sc.name}>{sc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormLabel>Teléfono</FormLabel>
                <PhoneInput
                  value={`${paisCodigoVal || "+57"} ${telefonoVal || ""}`.trim()}
                  onChange={(val) => {
                    const parts = val.match(/^(\+\d+)\s*(.*)/);
                    if (parts) {
                      form.setValue("paisCodigo", parts[1]);
                      form.setValue("telefono", parts[2]);
                    } else {
                      form.setValue("telefono", val);
                    }
                  }}
                />
              </div>

              <FormField
                control={form.control}
                name="notas"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Notas adicionales..." className="resize-none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Evidencia obligatoria — min 4 screenshots del primer
                  contacto. El submit queda deshabilitado hasta cumplir. */}
              <EvidenceUploader
                files={evidenceFiles}
                onFilesChange={setEvidenceFiles}
                minFiles={MIN_EVIDENCE}
                maxFiles={MAX_EVIDENCE}
                label="Evidencia del contacto"
                description={`Adjuntá al menos ${MIN_EVIDENCE} screenshots del chat con la modelo (conversación, número compartido, etc.). Podés pegar con Cmd/Ctrl+V.`}
              />
            </div>

            <DialogFooter className="pt-4 flex-row gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  isSubmitting ||
                  !selectedLead ||
                  evidenceFiles.length < MIN_EVIDENCE
                }
              >
                {isSubmitting
                  ? "Guardando..."
                  : evidenceFiles.length < MIN_EVIDENCE
                    ? `Faltan ${MIN_EVIDENCE - evidenceFiles.length} screenshots`
                    : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    {/* Existing contact dialog */}
    <Dialog open={!!existingContactData} onOpenChange={(open) => { if (!open) { setExistingContactData(null); setPendingFormData(null); } }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Contacto existente
          </DialogTitle>
          <DialogDescription>
            Esta modelo ya está registrada como contacto. Puedes actualizar sus datos o crear un nuevo registro.
          </DialogDescription>
        </DialogHeader>
        {existingContactData && (
          <div className="space-y-3 py-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1 text-sm">
              <p><span className="text-muted-foreground">Nombre:</span> <strong>{existingContactData.name}</strong></p>
              {existingContactData.agentName && (
                <p><span className="text-muted-foreground">Registrado por:</span> {existingContactData.agentName}</p>
              )}
              {existingContactData.createdAt && (
                <p><span className="text-muted-foreground">Fecha:</span> {new Date(existingContactData.createdAt).toLocaleDateString("es-CO")}</p>
              )}
              {existingContactData.phone && (
                <p><span className="text-muted-foreground">Teléfono actual:</span> <MaskedPhone phone={existingContactData.phone} /></p>
              )}
              {existingContactData.email && (
                <p><span className="text-muted-foreground">Email actual:</span> {existingContactData.email}</p>
              )}
            </div>
          </div>
        )}
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleUpdateExistingContact} disabled={isUpdatingContact} className="w-full">
            {isUpdatingContact ? "Actualizando..." : "Actualizar contacto"}
          </Button>
          {/* Regla: si el dup ya tiene tel, no se puede crear duplicado. */}
          {!existingContactData?.phone && (
            <Button variant="outline" onClick={handleCreateNewAnyway} disabled={isSubmitting} className="w-full">
              Crear nuevo registro
            </Button>
          )}
          {existingContactData?.phone && (
            <p className="text-xs text-muted-foreground text-center px-2">
              Este handle ya tiene un teléfono registrado. No se permite duplicar.
            </p>
          )}
          <Button variant="ghost" onClick={() => { setExistingContactData(null); setPendingFormData(null); }} className="w-full">
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default AddContactoModal;
