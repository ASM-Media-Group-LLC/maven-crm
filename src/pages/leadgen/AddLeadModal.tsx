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
import { useQueryClient } from "@tanstack/react-query";

const ALL_COUNTRIES = [
  { code: "af", flag: "🇦🇫", name: "Afganistán" }, { code: "al", flag: "🇦🇱", name: "Albania" }, { code: "de", flag: "🇩🇪", name: "Alemania" },
  { code: "ad", flag: "🇦🇩", name: "Andorra" }, { code: "ao", flag: "🇦🇴", name: "Angola" }, { code: "ag", flag: "🇦🇬", name: "Antigua y Barbuda" },
  { code: "sa", flag: "🇸🇦", name: "Arabia Saudita" }, { code: "dz", flag: "🇩🇿", name: "Argelia" }, { code: "ar", flag: "🇦🇷", name: "Argentina" },
  { code: "am", flag: "🇦🇲", name: "Armenia" }, { code: "au", flag: "🇦🇺", name: "Australia" }, { code: "at", flag: "🇦🇹", name: "Austria" },
  { code: "az", flag: "🇦🇿", name: "Azerbaiyán" }, { code: "bs", flag: "🇧🇸", name: "Bahamas" }, { code: "bd", flag: "🇧🇩", name: "Bangladés" },
  { code: "bb", flag: "🇧🇧", name: "Barbados" }, { code: "bh", flag: "🇧🇭", name: "Baréin" }, { code: "be", flag: "🇧🇪", name: "Bélgica" },
  { code: "bz", flag: "🇧🇿", name: "Belice" }, { code: "bj", flag: "🇧🇯", name: "Benín" }, { code: "by", flag: "🇧🇾", name: "Bielorrusia" },
  { code: "mm", flag: "🇲🇲", name: "Birmania" }, { code: "bo", flag: "🇧🇴", name: "Bolivia" }, { code: "ba", flag: "🇧🇦", name: "Bosnia y Herzegovina" },
  { code: "bw", flag: "🇧🇼", name: "Botsuana" }, { code: "br", flag: "🇧🇷", name: "Brasil" }, { code: "bn", flag: "🇧🇳", name: "Brunéi" },
  { code: "bg", flag: "🇧🇬", name: "Bulgaria" }, { code: "bf", flag: "🇧🇫", name: "Burkina Faso" }, { code: "bi", flag: "🇧🇮", name: "Burundi" },
  { code: "bt", flag: "🇧🇹", name: "Bután" }, { code: "cv", flag: "🇨🇻", name: "Cabo Verde" }, { code: "kh", flag: "🇰🇭", name: "Camboya" },
  { code: "cm", flag: "🇨🇲", name: "Camerún" }, { code: "ca", flag: "🇨🇦", name: "Canadá" }, { code: "td", flag: "🇹🇩", name: "Chad" },
  { code: "cl", flag: "🇨🇱", name: "Chile" }, { code: "cn", flag: "🇨🇳", name: "China" }, { code: "cy", flag: "🇨🇾", name: "Chipre" },
  { code: "co", flag: "🇨🇴", name: "Colombia" }, { code: "km", flag: "🇰🇲", name: "Comoras" }, { code: "cg", flag: "🇨🇬", name: "Congo" },
  { code: "kp", flag: "🇰🇵", name: "Corea del Norte" }, { code: "kr", flag: "🇰🇷", name: "Corea del Sur" }, { code: "cr", flag: "🇨🇷", name: "Costa Rica" },
  { code: "ci", flag: "🇨🇮", name: "Costa de Marfil" }, { code: "hr", flag: "🇭🇷", name: "Croacia" }, { code: "cu", flag: "🇨🇺", name: "Cuba" },
  { code: "dk", flag: "🇩🇰", name: "Dinamarca" }, { code: "dm", flag: "🇩🇲", name: "Dominica" }, { code: "ec", flag: "🇪🇨", name: "Ecuador" },
  { code: "eg", flag: "🇪🇬", name: "Egipto" }, { code: "sv", flag: "🇸🇻", name: "El Salvador" }, { code: "ae", flag: "🇦🇪", name: "Emiratos Árabes Unidos" },
  { code: "er", flag: "🇪🇷", name: "Eritrea" }, { code: "sk", flag: "🇸🇰", name: "Eslovaquia" }, { code: "si", flag: "🇸🇮", name: "Eslovenia" },
  { code: "es", flag: "🇪🇸", name: "España" }, { code: "us", flag: "🇺🇸", name: "Estados Unidos" }, { code: "ee", flag: "🇪🇪", name: "Estonia" },
  { code: "et", flag: "🇪🇹", name: "Etiopía" }, { code: "ph", flag: "🇵🇭", name: "Filipinas" }, { code: "fi", flag: "🇫🇮", name: "Finlandia" },
  { code: "fj", flag: "🇫🇯", name: "Fiyi" }, { code: "fr", flag: "🇫🇷", name: "Francia" }, { code: "ga", flag: "🇬🇦", name: "Gabón" },
  { code: "gm", flag: "🇬🇲", name: "Gambia" }, { code: "ge", flag: "🇬🇪", name: "Georgia" }, { code: "gh", flag: "🇬🇭", name: "Ghana" },
  { code: "gd", flag: "🇬🇩", name: "Granada" }, { code: "gr", flag: "🇬🇷", name: "Grecia" }, { code: "gt", flag: "🇬🇹", name: "Guatemala" },
  { code: "gn", flag: "🇬🇳", name: "Guinea" }, { code: "gq", flag: "🇬🇶", name: "Guinea Ecuatorial" }, { code: "gw", flag: "🇬🇼", name: "Guinea-Bisáu" },
  { code: "gy", flag: "🇬🇾", name: "Guyana" }, { code: "ht", flag: "🇭🇹", name: "Haití" }, { code: "hn", flag: "🇭🇳", name: "Honduras" },
  { code: "hu", flag: "🇭🇺", name: "Hungría" }, { code: "in", flag: "🇮🇳", name: "India" }, { code: "id", flag: "🇮🇩", name: "Indonesia" },
  { code: "iq", flag: "🇮🇶", name: "Irak" }, { code: "ir", flag: "🇮🇷", name: "Irán" }, { code: "ie", flag: "🇮🇪", name: "Irlanda" },
  { code: "is", flag: "🇮🇸", name: "Islandia" }, { code: "il", flag: "🇮🇱", name: "Israel" }, { code: "it", flag: "🇮🇹", name: "Italia" },
  { code: "jm", flag: "🇯🇲", name: "Jamaica" }, { code: "jp", flag: "🇯🇵", name: "Japón" }, { code: "jo", flag: "🇯🇴", name: "Jordania" },
  { code: "kz", flag: "🇰🇿", name: "Kazajistán" }, { code: "ke", flag: "🇰🇪", name: "Kenia" }, { code: "kg", flag: "🇰🇬", name: "Kirguistán" },
  { code: "ki", flag: "🇰🇮", name: "Kiribati" }, { code: "kw", flag: "🇰🇼", name: "Kuwait" }, { code: "la", flag: "🇱🇦", name: "Laos" },
  { code: "ls", flag: "🇱🇸", name: "Lesoto" }, { code: "lv", flag: "🇱🇻", name: "Letonia" }, { code: "lb", flag: "🇱🇧", name: "Líbano" },
  { code: "lr", flag: "🇱🇷", name: "Liberia" }, { code: "ly", flag: "🇱🇾", name: "Libia" }, { code: "li", flag: "🇱🇮", name: "Liechtenstein" },
  { code: "lt", flag: "🇱🇹", name: "Lituania" }, { code: "lu", flag: "🇱🇺", name: "Luxemburgo" }, { code: "mk", flag: "🇲🇰", name: "Macedonia del Norte" },
  { code: "mg", flag: "🇲🇬", name: "Madagascar" }, { code: "my", flag: "🇲🇾", name: "Malasia" }, { code: "mw", flag: "🇲🇼", name: "Malaui" },
  { code: "mv", flag: "🇲🇻", name: "Maldivas" }, { code: "ml", flag: "🇲🇱", name: "Malí" }, { code: "mt", flag: "🇲🇹", name: "Malta" },
  { code: "ma", flag: "🇲🇦", name: "Marruecos" }, { code: "mu", flag: "🇲🇺", name: "Mauricio" }, { code: "mr", flag: "🇲🇷", name: "Mauritania" },
  { code: "mx", flag: "🇲🇽", name: "México" }, { code: "fm", flag: "🇫🇲", name: "Micronesia" }, { code: "md", flag: "🇲🇩", name: "Moldavia" },
  { code: "mc", flag: "🇲🇨", name: "Mónaco" }, { code: "mn", flag: "🇲🇳", name: "Mongolia" }, { code: "me", flag: "🇲🇪", name: "Montenegro" },
  { code: "mz", flag: "🇲🇿", name: "Mozambique" }, { code: "na", flag: "🇳🇦", name: "Namibia" }, { code: "nr", flag: "🇳🇷", name: "Nauru" },
  { code: "np", flag: "🇳🇵", name: "Nepal" }, { code: "ni", flag: "🇳🇮", name: "Nicaragua" }, { code: "ne", flag: "🇳🇪", name: "Níger" },
  { code: "ng", flag: "🇳🇬", name: "Nigeria" }, { code: "no", flag: "🇳🇴", name: "Noruega" }, { code: "nz", flag: "🇳🇿", name: "Nueva Zelanda" },
  { code: "om", flag: "🇴🇲", name: "Omán" }, { code: "nl", flag: "🇳🇱", name: "Países Bajos" }, { code: "pk", flag: "🇵🇰", name: "Pakistán" },
  { code: "pw", flag: "🇵🇼", name: "Palaos" }, { code: "pa", flag: "🇵🇦", name: "Panamá" }, { code: "pg", flag: "🇵🇬", name: "Papúa Nueva Guinea" },
  { code: "py", flag: "🇵🇾", name: "Paraguay" }, { code: "pe", flag: "🇵🇪", name: "Perú" }, { code: "pl", flag: "🇵🇱", name: "Polonia" },
  { code: "pt", flag: "🇵🇹", name: "Portugal" }, { code: "gb", flag: "🇬🇧", name: "Reino Unido" }, { code: "cf", flag: "🇨🇫", name: "República Centroafricana" },
  { code: "cz", flag: "🇨🇿", name: "República Checa" }, { code: "cd", flag: "🇨🇩", name: "República Democrática del Congo" },
  { code: "do", flag: "🇩🇴", name: "República Dominicana" }, { code: "rw", flag: "🇷🇼", name: "Ruanda" }, { code: "ro", flag: "🇷🇴", name: "Rumania" },
  { code: "ru", flag: "🇷🇺", name: "Rusia" }, { code: "ws", flag: "🇼🇸", name: "Samoa" }, { code: "kn", flag: "🇰🇳", name: "San Cristóbal y Nieves" },
  { code: "sm", flag: "🇸🇲", name: "San Marino" }, { code: "vc", flag: "🇻🇨", name: "San Vicente y las Granadinas" },
  { code: "lc", flag: "🇱🇨", name: "Santa Lucía" }, { code: "st", flag: "🇸🇹", name: "Santo Tomé y Príncipe" }, { code: "sn", flag: "🇸🇳", name: "Senegal" },
  { code: "rs", flag: "🇷🇸", name: "Serbia" }, { code: "sc", flag: "🇸🇨", name: "Seychelles" }, { code: "sl", flag: "🇸🇱", name: "Sierra Leona" },
  { code: "sg", flag: "🇸🇬", name: "Singapur" }, { code: "sy", flag: "🇸🇾", name: "Siria" }, { code: "so", flag: "🇸🇴", name: "Somalia" },
  { code: "lk", flag: "🇱🇰", name: "Sri Lanka" }, { code: "sz", flag: "🇸🇿", name: "Suazilandia" }, { code: "za", flag: "🇿🇦", name: "Sudáfrica" },
  { code: "sd", flag: "🇸🇩", name: "Sudán" }, { code: "ss", flag: "🇸🇸", name: "Sudán del Sur" }, { code: "se", flag: "🇸🇪", name: "Suecia" },
  { code: "ch", flag: "🇨🇭", name: "Suiza" }, { code: "sr", flag: "🇸🇷", name: "Surinam" }, { code: "th", flag: "🇹🇭", name: "Tailandia" },
  { code: "tz", flag: "🇹🇿", name: "Tanzania" }, { code: "tj", flag: "🇹🇯", name: "Tayikistán" }, { code: "tl", flag: "🇹🇱", name: "Timor Oriental" },
  { code: "tg", flag: "🇹🇬", name: "Togo" }, { code: "to", flag: "🇹🇴", name: "Tonga" }, { code: "tt", flag: "🇹🇹", name: "Trinidad y Tobago" },
  { code: "tn", flag: "🇹🇳", name: "Túnez" }, { code: "tm", flag: "🇹🇲", name: "Turkmenistán" }, { code: "tr", flag: "🇹🇷", name: "Turquía" },
  { code: "tv", flag: "🇹🇻", name: "Tuvalu" }, { code: "ua", flag: "🇺🇦", name: "Ucrania" }, { code: "ug", flag: "🇺🇬", name: "Uganda" },
  { code: "uy", flag: "🇺🇾", name: "Uruguay" }, { code: "uz", flag: "🇺🇿", name: "Uzbekistán" }, { code: "vu", flag: "🇻🇺", name: "Vanuatu" },
  { code: "va", flag: "🇻🇦", name: "Vaticano" }, { code: "ve", flag: "🇻🇪", name: "Venezuela" }, { code: "vn", flag: "🇻🇳", name: "Vietnam" },
  { code: "ye", flag: "🇾🇪", name: "Yemen" }, { code: "dj", flag: "🇩🇯", name: "Yibuti" }, { code: "zm", flag: "🇿🇲", name: "Zambia" },
  { code: "zw", flag: "🇿🇼", name: "Zimbabue" },
];

const leadSchema = z.object({
  source_link: z.string().url("URL de perfil requerida"),
  platform: z.string().min(1, "Plataforma requerida"),
  quality: z.string().min(1, "Categoría requerida"),
  company: z.string().min(1, "Compañía requerida"),
  onlyfans_url: z.string().optional().refine(
    (val) => !val || val.includes("onlyfans.com") || /^[a-zA-Z0-9._-]+$/.test(val),
    "Debe ser una URL de OnlyFans válida o un handle"
  ),
  country_code: z.string().optional(),
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
      
      country_code: "",
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

      const { data: inserted, error } = await supabase.from("leadgen_entries").insert({
        model_handle: normalizedHandle,
        platform: data.platform,
        quality: data.quality,
        company: data.company,
        country_code: data.country_code || null,
        notes: data.notes || null,
        source_link: data.source_link,
        
        lg_user_id: user.id,
        entry_date: getMiamiDateStr(),
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
                name="country_code"
                render={({ field }) => {
                  const selected = ALL_COUNTRIES.find(c => c.code === field.value);
                  return (
                    <FormItem className="flex flex-col">
                      <FormLabel>País</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" role="combobox" className={cn("w-full justify-between font-normal", !field.value && "text-muted-foreground")}>
                              {selected ? `${selected.flag} ${selected.name}` : "Selecciona un país"}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Buscar país..." />
                            <CommandList>
                              <CommandEmpty>No se encontró el país.</CommandEmpty>
                              <CommandGroup className="max-h-60 overflow-y-auto">
                                {ALL_COUNTRIES.map((country) => (
                                  <CommandItem key={country.code} value={`${country.name} ${country.code}`} onSelect={() => field.onChange(country.code)}>
                                    <Check className={cn("mr-2 h-4 w-4", field.value === country.code ? "opacity-100" : "opacity-0")} />
                                    {country.flag} {country.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  );
                }}
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
  );
};

export default AddLeadModal;
