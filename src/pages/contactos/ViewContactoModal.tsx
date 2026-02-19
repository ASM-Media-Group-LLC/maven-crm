import { useState, useRef } from "react";
import { ExternalLink, MessageCircle, Pencil, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import InstagramIcon from "@/components/icons/InstagramIcon";
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showForm, setShowForm] = useState(false);
  const [tipoContacto, setTipoContacto] = useState<"nota" | "llamada">("nota");
  const [notas, setNotas] = useState("");
  const [estadoContacto, setEstadoContacto] = useState("Sin cambio");
  const [archivos, setArchivos] = useState<File[]>([]);

  const resetForm = () => {
    setShowForm(false);
    setTipoContacto("nota");
    setNotas("");
    setEstadoContacto("Sin cambio");
    setArchivos([]);
  };

  const handleSave = () => {
    toast({ title: "Interacción registrada", description: "La interacción se ha guardado correctamente." });
    resetForm();
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
                    <span className="font-mono">{contacto.ticket}</span>
                    <span>{flag}</span>
                    <span>· Ingresado por: {contacto.creadoPor}</span>
                  </DialogDescription>
                </div>
                <Badge variant={categoryVariant[contacto.categoria] ?? "secondary-soft"} className="text-base px-3 py-1 shrink-0">
                  {contacto.categoria}
                </Badge>
              </div>
            </DialogHeader>

            {/* Metadata badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Creado: {contacto.creacion}</Badge>
              <Badge variant="outline">0 llamadas</Badge>
              <Badge variant="outline">0 notas</Badge>
              <Badge variant="outline">Compañía</Badge>
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
              <Button variant="outline" size="sm" onClick={() => toast({ title: "Funcionalidad próximamente", description: "La conversión a creador estará disponible pronto." })}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Convertir a Creadora
              </Button>
            </div>

            <Separator />

            {/* Instagram */}
            <div className="flex items-center gap-3">
              <InstagramIcon className="h-5 w-5 text-muted-foreground" />
              <a
                href={`https://instagram.com/${contacto.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                @{contacto.instagram}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* WhatsApp */}
            <div className="flex items-center gap-3">
              <MessageCircle className="h-5 w-5 text-muted-foreground" />
              <a
                href={`https://wa.me/${contacto.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                Abrir chat
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

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

                  {/* Tipo de Contacto */}
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

                  {/* Notas */}
                  <div className="space-y-2">
                    <Label className="text-xs">Notas</Label>
                    <Textarea
                      placeholder="Notas sobre esta interacción"
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                      className="min-h-[80px]"
                    />
                  </div>

                  {/* Estado del Contacto */}
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

                  {/* Adjuntar Archivos */}
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

                  {/* Footer */}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={resetForm}>Cancelar</Button>
                    <Button size="sm" disabled={!notas.trim()} onClick={handleSave}>Guardar</Button>
                  </div>
                </div>
              )}

              {contacto.interacciones === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No hay interacciones registradas para este contacto. Puedes registrar llamadas, mensajes, emails, reuniones o notas.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {contacto.interacciones} interacción(es) registrada(s).
                </p>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default ViewContactoModal;
