import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle } from "lucide-react";
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

interface AddContactoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

  const onSubmit = async (data: ContactoFormValues) => {
    // Regla nueva del flujo unificado: el contacto debe venir de un
    // lead. Si no aparece en el autocomplete, el LLG debe crear el
    // lead primero en LeadGen.
    if (!selectedLead) {
      setLeadError("Tenés que seleccionar un lead existente. Si no aparece, agregalo primero en LeadGen.");
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
        const { data: phoneInContacts } = await supabase
          .from("closers_contacts")
          .select("id, name")
          .eq("phone", trimmedPhone)
          .maybeSingle();
        if (phoneInContacts) {
          toast({
            title: "⚠️ Teléfono ya registrado",
            description: `Este número ya está registrado para ${phoneInContacts.name}. El contacto se guardará de todos modos.`,
          });
        }
        const { data: phoneInCreators } = await supabase
          .from("creators")
          .select("id, name, phone")
          .eq("phone", fullPhone)
          .maybeSingle();
        if (phoneInCreators) {
          toast({
            title: "⚠️ Teléfono en creators",
            description: `Este número ya existe para la creadora ${phoneInCreators.name}. El contacto se guardará de todos modos.`,
          });
        }
      }

      const { error } = await supabase.from("closers_contacts").insert({
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
      } as any);

      if (error) throw error;

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
      form.reset(); setSelectedLead(null); setLeadError(null);
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
      const { error } = await supabase.from("closers_contacts").insert({
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
      } as any);
      if (error) throw error;
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
      form.reset(); setSelectedLead(null); setLeadError(null);
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
                          if (!lead) return;
                          // Autollenar del lead seleccionado. LeadGen es
                          // IG-first, así que siempre armamos la URL de
                          // instagram a partir del handle (aunque platform
                          // del lead sea distinto, el campo del form se
                          // llama "Link de Instagram").
                          if (lead.model_handle) {
                            const cleanHandle = lead.model_handle.replace(/^@/, "");
                            field.onChange(lead.model_handle);
                            form.setValue("instagram", `https://instagram.com/${cleanHandle}`);
                          }
                          if (lead.company) form.setValue("compania", lead.company);
                          if (lead.country_code) {
                            const cc = lead.country_code.startsWith("+")
                              ? lead.country_code
                              : `+${lead.country_code}`;
                            form.setValue("paisCodigo", cc);
                          }
                          if (lead.phone_raw) form.setValue("telefono", lead.phone_raw);
                          if (lead.notes) form.setValue("notas", lead.notes);
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
                        <SelectItem value="a+">A+ (Premium)</SelectItem>
                        <SelectItem value="a">A (Alta)</SelectItem>
                        <SelectItem value="b+">B+ (Media Alta)</SelectItem>
                        <SelectItem value="b">B (Media)</SelectItem>
                        <SelectItem value="c">C (Básica)</SelectItem>
                        <SelectItem value="potencial">Potencial</SelectItem>
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
                  value={`${form.getValues("paisCodigo")} ${form.getValues("telefono") || ""}`.trim()}
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
            </div>

            <DialogFooter className="pt-4 flex-row gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || !selectedLead}>
                {isSubmitting ? "Guardando..." : "Guardar"}
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
                <p><span className="text-muted-foreground">Teléfono actual:</span> {existingContactData.phone}</p>
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
