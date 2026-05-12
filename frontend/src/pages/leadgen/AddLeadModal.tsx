import { useState, useRef, useEffect } from "react";
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
import { useScouterCompanies, useCreateCompany } from "@/hooks/useScouterLeads";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, ChevronsUpDown, Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { normalizeHandle, detectPlatformFromUrl } from "@/lib/handle-utils";
import { enqueueAvatarFetch } from "@/lib/avatarFetch";
import { checkLeadAvailability, checkDuplicateOnlyFans, type LeadAvailabilityStatus } from "@/lib/lead-validation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Info } from "lucide-react";



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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  // Compañías canónicas — fuente única scouter_companies. Si el user
  // tipea una nueva, la creamos ahí mismo para que también aparezca
  // en /scouter-assist, /creadores y donde sea que la lean.
  const { data: scouterCompanies = [] } = useScouterCompanies();
  const createCompany = useCreateCompany();
  const companyNames = scouterCompanies.map((c) => c.name);
  // Fallback al array hardcodeado por si scouter_companies todavía
  // no cargó — pero la verdad ya está en DB después de la migration.
  const companyList = companyNames.length > 0 ? companyNames : LEADGEN_COMPANIES;

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

  // Disponibilidad del lead — corre debounced cuando el LLG escribe la
  // URL. El resultado se muestra como banner inline arriba del form y
  // bloquea el submit si la modelo no se puede agregar.
  const watchedSourceLink = form.watch("source_link");
  const [debouncedSourceLink, setDebouncedSourceLink] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSourceLink(watchedSourceLink || ""), 450);
    return () => clearTimeout(t);
  }, [watchedSourceLink]);
  const debouncedHandle = debouncedSourceLink ? normalizeHandle(debouncedSourceLink) : "";
  const availability = useQuery<LeadAvailabilityStatus>({
    queryKey: ["lead-availability", debouncedHandle],
    queryFn: () => checkLeadAvailability(debouncedHandle),
    enabled: debouncedHandle.length >= 2,
    staleTime: 30_000,
  });
  const availabilityResult = availability.data;
  const isBlockedByAvailability = availabilityResult?.kind === "blocked";

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

      // VALIDATION: chequeo unificado de disponibilidad del lead. Cubre
      // creators (activa/inactiva), closer_creators (en proceso/no
      // interesada), leadgen_entries (duplicado) y scouter_leads (info).
      // Si el banner inline ya dijo "blocked", el submit ni se intenta;
      // re-chequeamos acá como safety final por si el LLG cambió la URL
      // después del debounce.
      const finalCheck = await checkLeadAvailability(normalizedHandle);
      if (finalCheck.kind === "blocked") {
        toast({
          title: `❌ ${finalCheck.title}`,
          description: finalCheck.message,
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      // VALIDATION: OnlyFans URL duplicada — chequeo separado porque
      // matchea por URL completa, no por handle.
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

      const recordType = finalCheck.kind === "allowed_with_history" ? "reactivado" : "nuevo";

      // Dual-write: derivamos company_id desde el name elegido (puede
      // ser una compañía recién creada via useCreateCompany — la lista
      // ya está fresca en scouterCompanies por la invalidation que ese
      // hook dispara).
      const matchedCompany = scouterCompanies.find((sc) => sc.name === data.company);
      const { data: inserted, error } = await supabase.from("leadgen_entries").insert({
        model_handle: normalizedHandle,
        platform: data.platform,
        quality: data.quality,
        company: data.company,
        company_id: matchedCompany?.id ?? null,
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

              {/* Banner de disponibilidad — corre en vivo cuando el LLG
                  cambia la URL. Rojo si bloquea, amarillo si permite con
                  historial, oculto si es nuevo. */}
              {availabilityResult && availabilityResult.kind !== "new" && (
                <div
                  className={cn(
                    "rounded-lg border p-3 flex items-start gap-2.5",
                    availabilityResult.kind === "blocked"
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  )}
                >
                  {availabilityResult.kind === "blocked" ? (
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-tight">{availabilityResult.title}</p>
                    <p className="text-xs mt-1 leading-snug">{availabilityResult.message}</p>
                  </div>
                </div>
              )}

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
                        <Button
                          type="button"
                          size="sm"
                          disabled={createCompany.isPending}
                          onClick={async () => {
                            const name = customCompany.trim();
                            if (!name) return;
                            // Slug auto-derivado del nombre (lowercase + underscores).
                            const slug = name
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, "_")
                              .replace(/^_|_$/g, "");
                            // Si ya existe (case-insensitive), no la duplicamos —
                            // solo la usamos como valor del form.
                            const existing = scouterCompanies.find(
                              (c) => c.name.toLowerCase() === name.toLowerCase(),
                            );
                            if (existing) {
                              field.onChange(existing.name);
                            } else {
                              try {
                                const created = await createCompany.mutateAsync({
                                  slug,
                                  name,
                                  active: true,
                                });
                                field.onChange(created.name);
                              } catch {
                                // El mutation muestra toast en onError
                                return;
                              }
                            }
                            setIsAddingCompany(false);
                            setCustomCompany("");
                          }}
                        >
                          {createCompany.isPending ? "..." : "OK"}
                        </Button>
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
                                {companyList.map((company) => (
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
              <Button type="submit" className="w-full" disabled={isSubmitting || isBlockedByAvailability}>
                <Plus className="mr-2 h-4 w-4" />
                {isSubmitting ? "Guardando..." : isBlockedByAvailability ? "No se puede agregar" : "Guardar Lead"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default AddLeadModal;
