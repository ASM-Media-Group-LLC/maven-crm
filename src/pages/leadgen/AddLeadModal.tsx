import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Phone, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeHandle } from "@/lib/handle-utils";
import { useQueryClient } from "@tanstack/react-query";

const leadSchema = z.object({
  model_handle: z.string().min(1, "Handle requerido"),
  platform: z.string().min(1, "Plataforma requerida"),
  quality: z.string().min(1, "Calidad requerida"),
  company: z.string().min(1, "Compañía requerida"),
  country_code: z.string().optional(),
  notes: z.string().max(500, "Máximo 500 caracteres").optional(),
  source_link: z.string().url("URL inválida").optional().or(z.literal("")),
});

type LeadFormValues = z.infer<typeof leadSchema>;

interface AddLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_FILES = 4;

const AddLeadModal = ({ open, onOpenChange }: AddLeadModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      model_handle: "",
      platform: "",
      quality: "",
      company: "",
      country_code: "",
      notes: "",
      source_link: "",
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected) return;
    const newFiles = Array.from(selected);
    setFiles((prev) => [...prev, ...newFiles].slice(0, MAX_FILES));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const queryClient = useQueryClient();

  const onSubmit = async (data: LeadFormValues) => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      // Normalize handle
      const normalizedHandle = normalizeHandle(data.model_handle);
      if (!normalizedHandle) {
        toast({ title: "Handle inválido", description: "El handle ingresado no es válido.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }

      // Duplicate check in leadgen_entries
      const { data: existing } = await supabase
        .from("leadgen_entries")
        .select("id, model_handle, company")
        .ilike("model_handle", normalizedHandle)
        .eq("platform", data.platform)
        .limit(1)
        .maybeSingle();
      if (existing) {
        toast({
          title: "Duplicado detectado",
          description: `Ya existe un lead con este handle en ${existing.company}: @${existing.model_handle}`,
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      // Cross-table duplicate check: closers_contacts
      const { data: existingCloser } = await supabase
        .from("closers_contacts")
        .select("id, handle, company")
        .ilike("handle", normalizedHandle)
        .limit(1)
        .maybeSingle();
      if (existingCloser) {
        toast({
          title: "Duplicado detectado",
          description: `Este handle ya existe en Closers (${existingCloser.company || "sin compañía"}): @${existingCloser.handle}`,
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      // Cross-table duplicate check: creators
      const { data: existingCreator } = await supabase
        .from("creators")
        .select("id, instagram_handle, name")
        .ilike("instagram_handle", normalizedHandle)
        .limit(1)
        .maybeSingle();
      if (existingCreator) {
        toast({
          title: "Duplicado detectado",
          description: `Este handle ya existe como Creadora: ${existingCreator.name} (@${existingCreator.instagram_handle})`,
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      const { data: inserted, error } = await supabase.from("leadgen_entries").insert({
        model_handle: normalizedHandle,
        platform: data.platform,
        quality: data.quality,
        company: data.company,
        country_code: data.country_code || null,
        notes: data.notes || null,
        source_link: data.source_link || null,
        lg_user_id: user.id,
      } as any).select("id").single();

      if (error) throw error;

      // Upload evidence files
      if (files.length > 0 && inserted) {
        for (const file of files) {
          const filePath = `leads/${crypto.randomUUID()}/${file.name}`;
          const { error: uploadError } = await supabase.storage
            .from("creator-files")
            .upload(filePath, file);
          if (uploadError) throw uploadError;
          const { data: signedData } = await supabase.storage
            .from("creator-files")
            .createSignedUrl(filePath, 86400);
          
          await supabase.from("leadgen_evidence_files" as any).insert({
            leadgen_entry_id: inserted.id,
            file_url: signedData?.signedUrl || filePath,
            file_type: file.type,
            uploaded_by: user.id,
          });
        }
      }

      toast({ title: "Lead agregado exitosamente" });
      queryClient.invalidateQueries({ queryKey: ["leadgen-entries"] });
      form.reset();
      setFiles([]);
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error al agregar lead", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="pr-8">
          <DialogTitle>Nuevo Lead</DialogTitle>
          <DialogDescription>Agrega un nuevo lead al sistema de generación.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <div className="overflow-y-auto max-h-[60vh] space-y-4 pr-1">
              <FormField
                control={form.control}
                name="model_handle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Handle / Usuario *</FormLabel>
                    <FormControl>
                      <Input placeholder="@usuario" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="source_link"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL del Perfil</FormLabel>
                    <FormControl>
                      <Input placeholder="https://instagram.com/..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="platform"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plataforma *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="instagram">Instagram</SelectItem>
                          <SelectItem value="tiktok">TikTok</SelectItem>
                          <SelectItem value="twitter">Twitter/X</SelectItem>
                          <SelectItem value="onlyfans">OnlyFans</SelectItem>
                          <SelectItem value="otra">Otra</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="quality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Calidad *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="A+">A+</SelectItem>
                          <SelectItem value="A">A</SelectItem>
                          <SelectItem value="B+">B+ (Buena)</SelectItem>
                          <SelectItem value="B">B</SelectItem>
                          <SelectItem value="C">C</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Compañía / Cuenta de Origen *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Selecciona la compañía" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="kash-agency">KASH Agency</SelectItem>
                        <SelectItem value="alvaroletshoot">alvaroletshoot</SelectItem>
                        <SelectItem value="blue-app">Blue app</SelectItem>
                        <SelectItem value="piclink">Piclink.me</SelectItem>
                        <SelectItem value="pagomundo">Pagomundo</SelectItem>
                        <SelectItem value="exchange">Exchange</SelectItem>
                        <SelectItem value="unlok">Unlok</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="country_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>País</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Selecciona un país" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="us">🇺🇸 Estados Unidos</SelectItem>
                        <SelectItem value="mx">🇲🇽 México</SelectItem>
                        <SelectItem value="cl">🇨🇱 Chile</SelectItem>
                        <SelectItem value="co">🇨🇴 Colombia</SelectItem>
                        <SelectItem value="ar">🇦🇷 Argentina</SelectItem>
                        <SelectItem value="br">🇧🇷 Brasil</SelectItem>
                        <SelectItem value="pe">🇵🇪 Perú</SelectItem>
                        <SelectItem value="ve">🇻🇪 Venezuela</SelectItem>
                        <SelectItem value="ec">🇪🇨 Ecuador</SelectItem>
                        <SelectItem value="es">🇪🇸 España</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
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

              <div className="space-y-2">
                <FormLabel>Evidencia (opcional)</FormLabel>
                <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileChange} />
                <Button type="button" variant="outline" className="w-full" disabled={files.length >= MAX_FILES} onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" />
                  Subir Evidencia ({files.length}/{MAX_FILES})
                </Button>
                <p className="text-xs text-muted-foreground">Sube hasta 4 imágenes o videos como prueba de contacto</p>
                {files.length > 0 && (
                  <ul className="space-y-1">
                    {files.map((file, i) => (
                      <li key={i} className="flex items-center justify-between text-sm text-muted-foreground bg-muted/50 rounded px-2 py-1">
                        <span className="truncate mr-2">{file.name}</span>
                        <button type="button" onClick={() => removeFile(i)} className="shrink-0 hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                <Phone className="mr-2 h-4 w-4" />
                {isSubmitting ? "Guardando..." : "Guardar Lead"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AddLeadModal;
