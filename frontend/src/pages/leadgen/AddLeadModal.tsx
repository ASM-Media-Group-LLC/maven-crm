import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { getMiamiDateStr } from "./timezoneUtils";
import { LEADGEN_COMPANIES } from "./leadgenConstants";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, ChevronsUpDown, Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { normalizeHandle, detectPlatformFromUrl } from "@/lib/handle-utils";
import { enqueueAvatarFetch } from "@/lib/avatarFetch";
import { checkCreatorExists, checkPreviousLead, checkDuplicateOnlyFans, checkScouterLead } from "@/lib/lead-validation";
import { useQueryClient } from "@tanstack/react-query";



const leadSchema = z.object({
  source_link: z.string().url("URL de perfil requerida"),
  platform: z.string().min(1, "Plataforma requerida"),
  quality: z.string().min(1, "Categoría requerida"),
  company: z.string().min(1, "Compañía requerida"),
  onlyfans_url: z.string().optional().refine(
    (val) => !val || val.includes("onlyfans.com") || /^[a-zA-Z0-9._-]+$/.test(val),
    "Debe ser una URL de OnlyFans válida o un handle"
  ),
  notes: z.string().max(500, "Máximo 500 caracteres").optional(),
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
  const [isAddingCompany, setIsAddingCompany] = useState(false);
  const [customCompany, setCustomCompany] = useState("");
  const [creatorAlert, setCreatorAlert] = useState<{ name: string; id: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      source_link: "",
      platform: "",
      quality: "",
      company: "",
      onlyfans_url: "",
      notes: "",
    },
  });

  // Auto-detect platform when URL changes
  const handleUrlChange = (value: string, onChange: (v: string) => void) => {
    onChange(value);
    const detected = detectPlatformFromUrl(value);
    if (detected) {
      form.setValue("platform", detected);
    }
  };

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

      // Extract handle from URL
      const normalizedHandle = normalizeHandle(data.source_link);
      if (!normalizedHandle) {
        toast({ title: "URL inválida", description: "No se pudo extraer un handle de la URL proporcionada.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }

      // VALIDATION 1: Check if creator exists (status-aware)
      const creatorCheck = await checkCreatorExists(data.source_link, data.onlyfans_url);
      if (creatorCheck.exists) {
        if (creatorCheck.isActive) {
          setCreatorAlert({ name: creatorCheck.creatorName!, id: creatorCheck.creatorId! });
          setIsSubmitting(false);
          return;
        }
        // Inactive creator — allow as reactivated (warning style, not destructive)
        toast({
          title: "⚠️ Creadora inactiva detectada",
          description: `${creatorCheck.creatorName} tiene estado "${creatorCheck.creatorStatus}". Se registrará como lead reactivado.`,
        });
      }

      // VALIDATION 2: Check handle in leads with 24h rule
      const previousCheck = await checkPreviousLead(data.source_link, data.onlyfans_url);
      let recordType = creatorCheck.exists ? "reactivado" : "nuevo";
      if (previousCheck.existed) {
        const lastDate = previousCheck.lastEntryDate ? new Date(previousCheck.lastEntryDate) : null;
        const hoursSince = lastDate ? (Date.now() - lastDate.getTime()) / (1000 * 60 * 60) : Infinity;
        if (hoursSince < 24) {
          const hoursRemaining = Math.ceil(24 - hoursSince);
          const agentInfo = previousCheck.lastAgentName ? ` por ${previousCheck.lastAgentName}` : "";
          const hoursAgo = Math.floor(hoursSince);
          toast({
            title: "❌ Lead duplicado (bloqueo 24h)",
            description: `Este lead fue subido hace ${hoursAgo}h${agentInfo}. Podrás resubirlo en ~${hoursRemaining}h.`,
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }
        recordType = "reactivado";
        toast({
          title: "⚠️ Modelo reactivada",
          description: `Esta modelo ya existía en el sistema (último registro: ${lastDate ? lastDate.toLocaleDateString("es-CO") : "desconocido"}). Se creará como lead reactivado.`,
        });
      }

      // VALIDATION 3: Check duplicate OnlyFans URL
      if (data.onlyfans_url?.trim()) {
        const ofCheck = await checkDuplicateOnlyFans(data.onlyfans_url);
        if (ofCheck.existsInLeads || ofCheck.existsInContacts) {
          const where = ofCheck.existsInLeads ? "leads" : "contactos";
          const nameInfo = ofCheck.matchName ? ` para "${ofCheck.matchName}"` : "";
          toast({
            title: "❌ OnlyFans duplicado",
            description: `Esta URL ya está registrada en ${where}${nameInfo}. No se puede registrar.`,
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }
      }

      // VALIDATION 4: Check handle in Scouter Assist (cross-system dedup).
      // Si el handle ya vive en scouter_leads, bloqueamos — independiente
      // del status (incluso rejected) porque significa que el equipo ya
      // tomó una decisión sobre ese perfil y no queremos duplicarlo.
      const scouterCheck = await checkScouterLead(data.source_link);
      if (scouterCheck.exists) {
        const dateInfo = scouterCheck.createdAt
          ? ` (desde ${new Date(scouterCheck.createdAt).toLocaleDateString("es-CO")})`
          : "";
        toast({
          title: "❌ Lead ya existe en Scouter Assist",
          description: `Este @ ya está en Scouter Assist con status "${scouterCheck.status}"${dateInfo}. No se puede duplicar.`,
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
        notes: data.notes || null,
        source_link: data.source_link,
        onlyfans_url: data.onlyfans_url?.trim() || null,
        lg_user_id: user.id,
        entry_date: getMiamiDateStr(),
        record_type: recordType,
      } as any).select("id").single();

      if (error) throw error;

      // Fire-and-forget: dispara avatar fetch al worker para que el
      // model canónico tenga foto/followers/bio/name del IG. No
      // bloqueamos el submit — el avatar aparece en `models` en 30-60s.
      void enqueueAvatarFetch(normalizedHandle);

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
      queryClient.invalidateQueries({ queryKey: ["leadgen-entries-range"] });
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
    <>
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
                name="source_link"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL del Perfil *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://instagram.com/usuario"
                        value={field.value}
                        onChange={(e) => handleUrlChange(e.target.value, field.onChange)}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      El handle se detectará automáticamente de la URL
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="onlyfans_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>OnlyFans URL (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://onlyfans.com/usuario"
                        {...field}
                      />
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
                      <FormLabel>Categoría *</FormLabel>
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
                  <FormItem className="flex flex-col">
                    <FormLabel>Compañía / Cuenta de Origen *</FormLabel>
                    {isAddingCompany ? (
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            placeholder="Nombre de la nueva compañía"
                            value={customCompany}
                            onChange={(e) => setCustomCompany(e.target.value)}
                            autoFocus
                          />
                        </FormControl>
                        <Button type="button" size="sm" onClick={() => { if (customCompany.trim()) { field.onChange(customCompany.trim()); setIsAddingCompany(false); setCustomCompany(""); } }}>OK</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => { setIsAddingCompany(false); setCustomCompany(""); }}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" role="combobox" className={cn("w-full justify-between font-normal", !field.value && "text-muted-foreground")}>
                              {field.value || "Selecciona la compañía"}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Buscar compañía..." />
                            <CommandList>
                              <CommandEmpty>No se encontró la compañía.</CommandEmpty>
                              <CommandGroup className="max-h-60 overflow-y-auto">
                                {LEADGEN_COMPANIES.map((company) => (
                                  <CommandItem key={company} value={company} onSelect={() => field.onChange(company)}>
                                    <Check className={cn("mr-2 h-4 w-4", field.value === company ? "opacity-100" : "opacity-0")} />
                                    {company}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                              <CommandGroup>
                                <CommandItem onSelect={() => setIsAddingCompany(true)} className="text-primary">
                                  + Agregar nueva compañía
                                </CommandItem>
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    )}
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
                <Plus className="mr-2 h-4 w-4" />
                {isSubmitting ? "Guardando..." : "Guardar Lead"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    {/* Creator exists alert */}
    <Dialog open={!!creatorAlert} onOpenChange={(o) => !o && setCreatorAlert(null)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Creadora existente</DialogTitle>
          <DialogDescription>
            Esta creadora ya forma parte de la agencia: <strong>{creatorAlert?.name}</strong>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => setCreatorAlert(null)}>Cancelar</Button>
          <Button onClick={() => { navigate(`/creadoras/${creatorAlert?.id}`); setCreatorAlert(null); onOpenChange(false); }}>
            Ver perfil
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default AddLeadModal;
