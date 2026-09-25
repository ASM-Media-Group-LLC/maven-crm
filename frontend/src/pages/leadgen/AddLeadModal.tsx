import { useState, useEffect, useMemo } from "react";
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
import { ChevronsUpDown, Check, Plus, X } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import EvidenceUploader from "@/components/leadgen/EvidenceUploader";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { normalizeHandle, detectPlatformFromUrl } from "@/lib/handle-utils";
import { enqueueAvatarFetch } from "@/lib/avatarFetch";
import { checkLeadAvailability, checkDuplicateOnlyFans, type LeadAvailabilityStatus } from "@/lib/lead-validation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Info } from "lucide-react";



// El esquema se arma con el `t` del idioma actual: sus mensajes son lo que
// muestra <FormMessage />. react-hook-form relee el resolver en cada render.
const crearLeadSchema = (t: (key: TranslationKey, params?: Record<string, string | number>) => string) =>
  z.object({
    source_link: z.string().url(t("leadgen.addLead.profileUrlRequired")),
    platform: z.string().min(1, t("leadgen.addLead.platformRequired")),
    quality: z.string().min(1, t("leadgen.form.categoryRequired")),
    company: z.string().min(1, t("leadgen.addLead.companyRequired")),
    onlyfans_url: z.string().optional().refine(
      (val) => !val || val.includes("onlyfans.com") || /^[a-zA-Z0-9._-]+$/.test(val),
      t("leadgen.addLead.onlyFansInvalid")
    ),
    notes: z.string().max(500, t("leadgen.form.maxChars", { max: 500 })).optional(),
  });

type LeadFormValues = z.infer<ReturnType<typeof crearLeadSchema>>;

interface AddLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_FILES = 8;

const AddLeadModal = ({ open, onOpenChange }: AddLeadModalProps) => {
  const { t } = useLanguage();
  const leadSchema = useMemo(() => crearLeadSchema(t), [t]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isAddingCompany, setIsAddingCompany] = useState(false);
  const [customCompany, setCustomCompany] = useState("");
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
    const timer = setTimeout(() => setDebouncedSourceLink(watchedSourceLink || ""), 450);
    return () => clearTimeout(timer);
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

  const queryClient = useQueryClient();

  const onSubmit = async (data: LeadFormValues) => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t("leadgen.notSignedIn"));

      // Extract handle from URL
      const normalizedHandle = normalizeHandle(data.source_link);
      if (!normalizedHandle) {
        toast({ title: t("leadgen.addLead.invalidUrl"), description: t("leadgen.addLead.invalidUrlDesc"), variant: "destructive" });
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
          const where = ofCheck.existsInLeads ? t("leadgen.addLead.whereLeads") : t("leadgen.addLead.whereContacts");
          const forName = ofCheck.matchName ? t("leadgen.addLead.forName", { name: ofCheck.matchName }) : "";
          toast({
            title: t("leadgen.addLead.duplicateOf"),
            description: t("leadgen.addLead.duplicateOfDesc", { where, forName }),
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

      toast({ title: t("leadgen.addLead.added") });
      queryClient.invalidateQueries({ queryKey: ["leadgen-entries"] });
      queryClient.invalidateQueries({ queryKey: ["leadgen-entries-range"] });
      form.reset();
      setFiles([]);
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: t("leadgen.addLead.addError"), description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="pr-8">
          <DialogTitle>{t("leadgen.addLead.title")}</DialogTitle>
          <DialogDescription>{t("leadgen.addLead.description")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <div className="overflow-y-auto max-h-[60vh] space-y-4 pr-1">
              <FormField
                control={form.control}
                name="source_link"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("leadgen.addLead.profileUrl")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("leadgen.addLead.profileUrlPlaceholder")}
                        value={field.value}
                        onChange={(e) => handleUrlChange(e.target.value, field.onChange)}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {t("leadgen.addLead.handleAutodetect")}
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
                      : "border-warning/40 bg-warning/10 text-warning dark:text-warning"
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
                    <FormLabel>{t("leadgen.addLead.onlyFansUrl")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("leadgen.addLead.onlyFansPlaceholder")}
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
                      <FormLabel>{t("leadgen.addLead.platform")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder={t("leadgen.addLead.selectShort")} /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="instagram">Instagram</SelectItem>
                          <SelectItem value="tiktok">TikTok</SelectItem>
                          <SelectItem value="twitter">Twitter/X</SelectItem>
                          <SelectItem value="onlyfans">OnlyFans</SelectItem>
                          <SelectItem value="otra">{t("leadgen.addLead.platformOther")}</SelectItem>
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
                      <FormLabel>{t("leadgen.addLead.category")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder={t("leadgen.addLead.selectShort")} /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="A+">A+</SelectItem>
                          <SelectItem value="A">A</SelectItem>
                          <SelectItem value="B+">{t("leadgen.quality.bPlusGood")}</SelectItem>
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
                    <FormLabel>{t("leadgen.addLead.company")}</FormLabel>
                    {isAddingCompany ? (
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            placeholder={t("leadgen.addLead.newCompanyName")}
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
                              {field.value || t("leadgen.form.selectCompany")}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder={t("leadgen.addLead.searchCompany")} />
                            <CommandList>
                              <CommandEmpty>{t("leadgen.addLead.companyNotFound")}</CommandEmpty>
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
                                  {t("leadgen.addLead.addCompany")}
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
                    <FormLabel>{t("leadgen.form.notes")}</FormLabel>
                    <FormControl>
                      <Textarea placeholder={t("leadgen.form.notesPlaceholder")} className="resize-none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <EvidenceUploader
                files={files}
                onFilesChange={setFiles}
                minFiles={0}
                maxFiles={MAX_FILES}
                label={t("leadgen.addLead.evidenceOptional")}
                description={t("leadgen.addLead.evidenceHint", { max: MAX_FILES })}
              />
            </div>

            <DialogFooter className="pt-4">
              <Button type="submit" className="w-full" disabled={isSubmitting || isBlockedByAvailability}>
                <Plus className="mr-2 h-4 w-4" />
                {isSubmitting ? t("leadgen.saving") : isBlockedByAvailability ? t("leadgen.addLead.cantAdd") : t("leadgen.addLead.save")}
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
