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
import { useQueryClient } from "@tanstack/react-query";

const leadSchema = z.object({
  url_perfil: z.string().min(1, "URL requerida").url("URL inválida"),
  plataforma: z.string().min(1, "Plataforma requerida"),
  categoria: z.string().min(1, "Categoría requerida"),
  compania: z.string().min(1, "Compañía requerida"),
  pais: z.string().optional(),
  notas: z.string().max(500, "Máximo 500 caracteres").optional(),
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
      url_perfil: "",
      plataforma: "",
      categoria: "",
      compania: "",
      pais: "",
      notas: "",
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected) return;
    const newFiles = Array.from(selected);
    setFiles((prev) => {
      const combined = [...prev, ...newFiles];
      return combined.slice(0, MAX_FILES);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const queryClient = useQueryClient();

  const onSubmit = async (data: LeadFormValues) => {
    setIsSubmitting(true);
    try {
      // Duplicate check by url_perfil
      const { normalizeHandle } = await import("@/lib/handle-utils");
      const normalizedUrl = normalizeHandle(data.url_perfil);
      if (normalizedUrl) {
        const { data: existing } = await supabase
          .from("leads")
          .select("id, url_perfil, compania")
          .ilike("url_perfil", `%${normalizedUrl}%`)
          .maybeSingle();
        if (existing) {
          toast({
            title: "Duplicado detectado",
            description: `Ya existe un lead con este perfil en ${existing.compania}: ${existing.url_perfil}`,
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }
      }

      // Upload evidence files if any
      let evidenceUrls: string[] = [];
      if (files.length > 0) {
        for (const file of files) {
          const filePath = `leads/${crypto.randomUUID()}/${file.name}`;
          const { error: uploadError } = await supabase.storage
            .from("creator-files")
            .upload(filePath, file);
          if (uploadError) throw uploadError;
          const { data: urlData } = supabase.storage
            .from("creator-files")
            .getPublicUrl(filePath);
          evidenceUrls.push(urlData.publicUrl);
        }
      }

      const { error } = await supabase.from("leads").insert({
        url_perfil: data.url_perfil,
        plataforma: data.plataforma,
        categoria: data.categoria,
        compania: data.compania,
        pais: data.pais || null,
        notas: data.notas || null,
        evidence_urls: evidenceUrls.length > 0 ? evidenceUrls : null,
      });

      if (error) throw error;

      toast({ title: "Lead agregado exitosamente" });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
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
                name="url_perfil"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL Perfil / Contacto *</FormLabel>
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
                  name="plataforma"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plataforma *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona" />
                          </SelectTrigger>
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
                  name="categoria"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoría *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="a+">A+</SelectItem>
                          <SelectItem value="a">A</SelectItem>
                          <SelectItem value="b+">B+ (Buena)</SelectItem>
                          <SelectItem value="b">B</SelectItem>
                          <SelectItem value="c">C</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="compania"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Compañía / Cuenta de Origen *</FormLabel>
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
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="pais"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>País</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un país" />
                        </SelectTrigger>
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
                          <SelectItem value="bo">🇧🇴 Bolivia</SelectItem>
                          <SelectItem value="py">🇵🇾 Paraguay</SelectItem>
                          <SelectItem value="uy">🇺🇾 Uruguay</SelectItem>
                          <SelectItem value="cr">🇨🇷 Costa Rica</SelectItem>
                          <SelectItem value="pa">🇵🇦 Panamá</SelectItem>
                          <SelectItem value="do">🇩🇴 República Dominicana</SelectItem>
                          <SelectItem value="gt">🇬🇹 Guatemala</SelectItem>
                          <SelectItem value="hn">🇭🇳 Honduras</SelectItem>
                          <SelectItem value="ni">🇳🇮 Nicaragua</SelectItem>
                          <SelectItem value="sv">🇸🇻 El Salvador</SelectItem>
                          <SelectItem value="cu">🇨🇺 Cuba</SelectItem>
                          <SelectItem value="es">🇪🇸 España</SelectItem>
                          <SelectItem value="fr">🇫🇷 Francia</SelectItem>
                          <SelectItem value="de">🇩🇪 Alemania</SelectItem>
                          <SelectItem value="it">🇮🇹 Italia</SelectItem>
                          <SelectItem value="gb">🇬🇧 Reino Unido</SelectItem>
                          <SelectItem value="pt">🇵🇹 Portugal</SelectItem>
                          <SelectItem value="nl">🇳🇱 Países Bajos</SelectItem>
                          <SelectItem value="be">🇧🇪 Bélgica</SelectItem>
                          <SelectItem value="ch">🇨🇭 Suiza</SelectItem>
                          <SelectItem value="at">🇦🇹 Austria</SelectItem>
                          <SelectItem value="se">🇸🇪 Suecia</SelectItem>
                          <SelectItem value="no">🇳🇴 Noruega</SelectItem>
                          <SelectItem value="dk">🇩🇰 Dinamarca</SelectItem>
                          <SelectItem value="fi">🇫🇮 Finlandia</SelectItem>
                          <SelectItem value="pl">🇵🇱 Polonia</SelectItem>
                          <SelectItem value="cz">🇨🇿 República Checa</SelectItem>
                          <SelectItem value="gr">🇬🇷 Grecia</SelectItem>
                          <SelectItem value="ie">🇮🇪 Irlanda</SelectItem>
                          <SelectItem value="ro">🇷🇴 Rumania</SelectItem>
                          <SelectItem value="hu">🇭🇺 Hungría</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

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

              {/* Evidencia */}
              <div className="space-y-2">
                <FormLabel>Evidencia (opcional)</FormLabel>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={files.length >= MAX_FILES}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Subir Evidencia ({files.length}/{MAX_FILES})
                </Button>
                <p className="text-xs text-muted-foreground">
                  Sube hasta 4 imágenes o videos como prueba de contacto
                </p>
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
