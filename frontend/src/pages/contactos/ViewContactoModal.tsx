import { useState, useRef } from "react";
import { ExternalLink, MessageCircle, Pencil, Plus, Sparkles, Trash2, Upload, X, Phone, FileText } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { WhatsAppLink } from "@/components/MaskedPhone";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Contacto } from "./ContactosContent";

const categoryVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "secondary-soft" | "destructive-soft"> = {
  "A+": "success-soft",
  A: "primary-soft",
  "B+": "warning-soft",
  B: "secondary-soft",
  C: "destructive-soft",
};

const countryFlags: Record<string, string> = {
  CO: "🇨🇴", MX: "🇲🇽", AR: "🇦🇷", ES: "🇪🇸", CL: "🇨🇱", PE: "🇵🇪", UY: "🇺🇾", BR: "🇧🇷", US: "🇺🇸",
};

const estadoOptions = ["Sin cambio", "Nuevo", "Contactado", "Interesado", "Convertido", "Rechazado"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacto: Contacto | null;
  onEdit: () => void;
  onDelete: () => void;
}

const ViewContactoModal = ({ open, onOpenChange, contacto, onEdit, onDelete }: Props) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showForm, setShowForm] = useState(false);
  const [tipoContacto, setTipoContacto] = useState<"nota" | "llamada">("nota");
  const [notas, setNotas] = useState("");
  const [estadoContacto, setEstadoContacto] = useState("Sin cambio");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch interactions for this contact
  const { data: interactions = [] } = useQuery({
    queryKey: ["contact_interactions", contacto?.id],
    queryFn: async () => {
      if (!contacto?.id) return [];
      const { data, error } = await supabase
        .from("contact_interactions")
        .select("*")
        .eq("contact_id", contacto.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!contacto?.id && open,
  });

  const callCount = interactions.filter((i: any) => i.interaction_type === "llamada").length;
  const noteCount = interactions.filter((i: any) => i.interaction_type === "nota").length;

  const resetForm = () => {
    setShowForm(false);
    setTipoContacto("nota");
    setNotas("");
    setEstadoContacto("Sin cambio");
    setArchivos([]);
  };

  const handleSave = async () => {
    if (!contacto || !user) return;
    setIsSaving(true);
    try {
      // Insert interaction
      const { data: interaction, error: intError } = await supabase
        .from("contact_interactions")
        .insert({
          contact_id: contacto.id,
          user_id: user.id,
          interaction_type: tipoContacto,
          notes: notas.trim() || null,
          call_number: tipoContacto === "llamada" ? callCount + 1 : null,
          resulting_status: estadoContacto !== "Sin cambio" ? estadoContacto : null,
        })
        .select("id")
        .single();
      if (intError) throw intError;

      // Upload files if any.
      //
      // Esto subía al bucket "contact-files", que NO EXISTE en este proyecto, y se
      // tragaba el error con `if (!uploadError)`: todos los adjuntos venían fallando
      // en silencio (contact_interaction_files tiene 1 sola fila en toda su vida) y
      // el usuario veía "Interacción registrada" igual. Además getPublicUrl sobre un
      // bucket privado devuelve una URL que da 400.
      //
      // Ahora usa el mismo camino que el modal hermano (AddContactoModal →
      // uploadContactEvidence): bucket creator-files, uuid en el path para que dos
      // archivos con el mismo nombre no se pisen, URL firmada, y falla fuerte.
      if (archivos.length > 0 && interaction) {
        for (const file of archivos) {
          const path = `interactions/${interaction.id}/${crypto.randomUUID()}-${file.name}`;
          const { error: uploadError } = await supabase.storage
            .from("creator-files")
            .upload(path, file);
          if (uploadError) throw uploadError;
          const { data: signed } = await supabase.storage
            .from("creator-files")
            .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 año, igual que el hermano
          await supabase.from("contact_interaction_files").insert({
            interaction_id: interaction.id,
            file_name: file.name,
            file_type: file.type,
            file_url: signed?.signedUrl || path,
          });
        }
      }

      // Update contact status if changed
      if (estadoContacto !== "Sin cambio") {
        await supabase
          .from("closers_contacts")
          .update({ status: estadoContacto })
          .eq("id", contacto.id);
      }

      queryClient.invalidateQueries({ queryKey: ["contact_interactions", contacto.id] });
      queryClient.invalidateQueries({ queryKey: ["contact_interaction_counts"] });
      queryClient.invalidateQueries({ queryKey: ["closers_contacts"] });
      toast({ title: "Interacción registrada" });
      resetForm();
    } catch (err: any) {
      toast({ title: "Error al guardar", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setArchivos(prev => [...prev, ...newFiles].slice(0, 10));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setArchivos(prev => prev.filter((_, i) => i !== index));
  };

  if (!contacto) return null;

  const flag = countryFlags[contacto.pais] || contacto.pais;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg p-0">
        <ScrollArea className="max-h-[80vh]">
          <div className="p-6 space-y-4">
            <DialogHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <DialogTitle className="text-xl">{contacto.nombre}</DialogTitle>
                  <DialogDescription className="mt-1 space-x-2">
                    {contacto.ticket && <span className="font-mono">{contacto.ticket}</span>}
                    {flag && <span>{flag}</span>}
                    {contacto.creadoPor && <span>· Ingresado por: <span className="text-primary">{contacto.creadoPor}</span></span>}
                  </DialogDescription>
                </div>
                {contacto.categoria && (
                  <Badge variant={categoryVariant[contacto.categoria] ?? "secondary-soft"} className="text-base px-3 py-1 shrink-0">
                    {contacto.categoria}
                  </Badge>
                )}
              </div>
            </DialogHeader>

            {/* Metadata badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Creado: {contacto.creacion}</Badge>
              <Badge variant="outline">{callCount} llamadas</Badge>
              <Badge variant="outline">{noteCount} notas</Badge>
              {contacto.company && <Badge variant="outline">{contacto.company}</Badge>}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); onEdit(); }}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
              </Button>
              <Button variant="destructive" size="sm" onClick={() => { onOpenChange(false); onDelete(); }}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Eliminar
              </Button>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => {
                onOpenChange(false);
                // Trigger convert via parent
              }}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Convertir a Creadora
              </Button>
            </div>

            <Separator />

            {/* Instagram */}
            {contacto.instagram && (
              <div className="flex items-center gap-3 border rounded-xl p-3">
                <InstagramIcon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Instagram / Handle</p>
                  <a
                    href={`https://instagram.com/${contacto.instagram.replace("@", "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
                  >
                    {contacto.instagram}
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </a>
                </div>
              </div>
            )}

            {/* WhatsApp */}
            {contacto.whatsapp && (
              <div className="flex items-center gap-3 border rounded-xl p-3">
                <MessageCircle className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">WhatsApp</p>
                  <WhatsAppLink
                    phone={contacto.whatsapp}
                    className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                    hideForNonAdmin
                  >
                    Abrir chat
                    <ExternalLink className="h-3 w-3" />
                  </WhatsAppLink>
                </div>
              </div>
            )}

            <Separator />

            {/* Historial de Interacciones */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Historial de Interacciones</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowForm(prev => !prev)}
                >
                  {showForm ? (
                    <><X className="mr-1.5 h-3.5 w-3.5" /> Cancelar</>
                  ) : (
                    <><Plus className="mr-1.5 h-3.5 w-3.5" /> Registrar Interacción</>
                  )}
                </Button>
              </div>

              {/* Inline form */}
              {showForm && (
                <div className="border rounded-lg p-4 space-y-4 bg-muted/30 mb-4">
                  <div>
                    <h4 className="text-sm font-semibold">Registrar {tipoContacto === "nota" ? "Nota" : "Llamada"}</h4>
                    <p className="text-xs text-muted-foreground">Contacto: {contacto.nombre}</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Tipo de Contacto</Label>
                    <RadioGroup value={tipoContacto} onValueChange={(v) => setTipoContacto(v as "nota" | "llamada")} className="flex gap-4">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="nota" id="tipo-nota" />
                        <Label htmlFor="tipo-nota" className="text-sm font-normal cursor-pointer">Nota / Mensaje Escrito</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="llamada" id="tipo-llamada" />
                        <Label htmlFor="tipo-llamada" className="text-sm font-normal cursor-pointer">Llamada</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Notas</Label>
                    <Textarea
                      placeholder="Notas sobre esta interacción"
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                      className="min-h-[80px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Estado del Contacto</Label>
                    <Select value={estadoContacto} onValueChange={setEstadoContacto}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {estadoOptions.map(opt => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Adjuntar Archivos (Fotos/Videos - máx. 10)</Label>
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
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={archivos.length >= 10}
                    >
                      <Upload className="mr-1.5 h-3.5 w-3.5" /> Seleccionar archivos
                    </Button>
                    {archivos.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {archivos.map((file, i) => (
                          <Badge key={i} variant="outline" className="gap-1 pr-1">
                            <span className="text-xs truncate max-w-[120px]">{file.name}</span>
                            <button onClick={() => removeFile(i)} className="ml-1 hover:text-destructive">
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={resetForm}>Cancelar</Button>
                    <Button size="sm" disabled={!notas.trim() || isSaving} onClick={handleSave}>
                      {isSaving ? "Guardando..." : "Guardar"}
                    </Button>
                  </div>
                </div>
              )}

              {interactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No hay interacciones registradas para este contacto.<br />
                  Puedes registrar llamadas, mensajes, emails, reuniones o notas.
                </p>
              ) : (
                <div className="space-y-3">
                  {interactions.map((inter: any) => (
                    <div key={inter.id} className="border rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {inter.interaction_type === "llamada" ? (
                            <Phone className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <span className="text-sm font-medium capitalize">{inter.interaction_type}</span>
                          {inter.call_number && (
                            <Badge variant="outline" className="text-[10px]">Llamada #{inter.call_number}</Badge>
                          )}
                          {inter.resulting_status && (
                            <Badge variant="secondary" className="text-[10px]">→ {inter.resulting_status}</Badge>
                          )}
                        </div>
                        {inter.created_at && (
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(inter.created_at), "dd MMM yyyy, HH:mm", { locale: es })}
                          </span>
                        )}
                      </div>
                      {inter.notes && (
                        <p className="text-sm text-muted-foreground mt-1">{inter.notes}</p>
                      )}
                      {inter.call_summary && (
                        <p className="text-sm text-muted-foreground mt-1 italic">{inter.call_summary}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default ViewContactoModal;
