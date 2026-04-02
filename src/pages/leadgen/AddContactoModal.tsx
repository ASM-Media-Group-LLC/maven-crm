import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle } from "lucide-react";
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
import { checkCreatorExists, checkExistingContact } from "@/lib/lead-validation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

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

const countryCodes = [
  { value: "+1", triggerLabel: "🇺🇸 +1", label: "🇺🇸 Estados Unidos +1" },
  { value: "+57", triggerLabel: "🇨🇴 +57", label: "🇨🇴 Colombia +57" },
  { value: "+56", triggerLabel: "🇨🇱 +56", label: "🇨🇱 Chile +56" },
  { value: "+52", triggerLabel: "🇲🇽 +52", label: "🇲🇽 México +52" },
  { value: "+54", triggerLabel: "🇦🇷 +54", label: "🇦🇷 Argentina +54" },
  { value: "+51", triggerLabel: "🇵🇪 +51", label: "🇵🇪 Perú +51" },
  { value: "+593", triggerLabel: "🇪🇨 +593", label: "🇪🇨 Ecuador +593" },
  { value: "+58", triggerLabel: "🇻🇪 +58", label: "🇻🇪 Venezuela +58" },
  { value: "+55", triggerLabel: "🇧🇷 +55", label: "🇧🇷 Brasil +55" },
  { value: "+34", triggerLabel: "🇪🇸 +34", label: "🇪🇸 España +34" },
  { value: "+44", triggerLabel: "🇬🇧 +44", label: "🇬🇧 Reino Unido +44" },
  { value: "+33", triggerLabel: "🇫🇷 +33", label: "🇫🇷 Francia +33" },
  { value: "+49", triggerLabel: "🇩🇪 +49", label: "🇩🇪 Alemania +49" },
];

const AddContactoModal = ({ open, onOpenChange }: AddContactoModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingContactData, setExistingContactData] = useState<{
    id: string; name: string; phone?: string; email?: string; agentName?: string; createdAt?: string;
  } | null>(null);
  const [isUpdatingContact, setIsUpdatingContact] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<ContactoFormValues | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

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
        country_code: data.paisCodigo,
        phone: data.telefono || null,
        notes: data.notas || null,
        created_by: user?.id ?? "",
        record_type: recordType,
      });

      if (error) throw error;

      toast({ title: "Contacto guardado exitosamente" });
      queryClient.invalidateQueries({ queryKey: ["closers-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      form.reset();
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
      form.reset();
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
        country_code: pendingFormData.paisCodigo,
        phone: pendingFormData.telefono || null,
        notes: pendingFormData.notas || null,
        created_by: user?.id ?? "",
        record_type: "reactivado",
      });
      if (error) throw error;
      toast({ title: "Contacto guardado exitosamente" });
      queryClient.invalidateQueries({ queryKey: ["closers-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      form.reset();
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
                    <FormLabel>Nombre *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre completo" {...field} />
                    </FormControl>
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona la compañía" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="kash-agency">KASH Agency</SelectItem>
                        <SelectItem value="alvaroletshoot">alvaroletshoot</SelectItem>
                        <SelectItem value="blue-app">Blue app</SelectItem>
                        <SelectItem value="piclink">Piclink.me</SelectItem>
                        <SelectItem value="pagomundo">Pagomundo</SelectItem>
                        <SelectItem value="exchange">Exchange</SelectItem>
                        <SelectItem value="unlok">Unlok</SelectItem>
                        <SelectItem value="ora-miami">Ora Miami</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormLabel>Teléfono</FormLabel>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <FormField
                    control={form.control}
                    name="paisCodigo"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue>
                            {countryCodes.find((c) => c.value === field.value)?.triggerLabel}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {countryCodes.map((code) => (
                            <SelectItem key={code.value} value={code.value}>
                              {code.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="telefono"
                    render={({ field }) => (
                      <FormControl>
                        <Input placeholder="Número de teléfono" {...field} />
                      </FormControl>
                    )}
                  />
                </div>
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
              <Button type="submit" disabled={isSubmitting}>
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
            <div className="rounded-md border border-border p-3 space-y-1 text-sm">
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
          <Button variant="outline" onClick={handleCreateNewAnyway} disabled={isSubmitting} className="w-full">
            Crear nuevo registro
          </Button>
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
