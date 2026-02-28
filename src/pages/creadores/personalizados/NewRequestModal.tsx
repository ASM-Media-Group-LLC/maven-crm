import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Zap, Upload, X, FileVideo } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCustomRequests } from "./useCustomRequests";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CONTENT_TYPES = [
  { value: "foto", label: "Foto" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "articulo", label: "Artículo" },
  { value: "prenda", label: "Prenda" },
];

const PRIORITIES = [
  { value: "baja", label: "Baja" },
  { value: "normal", label: "Normal" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
];

const NewRequestModal = ({ open, onOpenChange }: Props) => {
  const { createRequest } = useCustomRequests();
  const [description, setDescription] = useState("");
  const [contentType, setContentType] = useState("foto");
  const [priority, setPriority] = useState("normal");
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [chatterId, setChatterId] = useState<string | null>(null);
  const [chatterOpen, setChatterOpen] = useState(false);
  const [paidAmount, setPaidAmount] = useState("");
  const [requestDate, setRequestDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("solicitado");
  const [fanUsername, setFanUsername] = useState("");
  const [fanSpentAmount, setFanSpentAmount] = useState("");
  const [category, setCategory] = useState("normal");
  const [quantityOrDuration, setQuantityOrDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: creators = [] } = useQuery({
    queryKey: ["creators-list-simple"],
    queryFn: async () => {
      const { data } = await supabase
        .from("creators")
        .select("id, name, artistic_name")
        .order("name");
      return data || [];
    },
  });

  const { data: chatters = [] } = useQuery({
    queryKey: ["profiles-list-simple"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .order("full_name");
      return data || [];
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentFile(file);
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setAttachmentPreview(url);
    } else {
      setAttachmentPreview(null);
    }
  };

  const removeFile = () => {
    setAttachmentFile(null);
    setAttachmentPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    const isBuster = category === "buster";
    const contentLabel = CONTENT_TYPES.find((t) => t.value === contentType)?.label || contentType;
    const creatorName = selectedCreator ? (selectedCreator.artistic_name || selectedCreator.name) : "Sin asignar";
    const autoTitle = `${contentLabel} - ${creatorName}`;

    let attachment_url: string | undefined;
    if (attachmentFile) {
      setUploading(true);
      const ext = attachmentFile.name.split(".").pop();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("custom-request-attachments")
        .upload(path, attachmentFile);
      setUploading(false);
      if (uploadError) {
        return;
      }
      const { data: urlData } = supabase.storage
        .from("custom-request-attachments")
        .getPublicUrl(path);
      attachment_url = urlData.publicUrl;
    }

    createRequest.mutate(
      {
        title: autoTitle,
        description: description.trim() || undefined,
        content_type: contentType,
        creator_id: creatorId,
        priority: isBuster ? "alta" : priority,
        due_date: dueDate || null,
        assigned_chatter_id: chatterId,
        paid_amount: parseFloat(paidAmount) || undefined,
        status,
        request_date: requestDate || null,
        fan_username: fanUsername.trim() || undefined,
        fan_spent_amount: parseFloat(fanSpentAmount) || undefined,
        category,
        quantity_or_duration: quantityOrDuration.trim() || undefined,
        notes: notes.trim() || undefined,
        attachment_url,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setDescription("");
          setContentType("foto");
          setPriority("normal");
          setCreatorId(null);
          setDueDate("");
          setChatterId(null);
          setPaidAmount("");
          setRequestDate(new Date().toISOString().slice(0, 10));
          setStatus("solicitado");
          setFanUsername("");
          setFanSpentAmount("");
          setCategory("normal");
          setQuantityOrDuration("");
          setNotes("");
          removeFile();
        },
      }
    );
  };

  const selectedCreator = creators.find((c) => c.id === creatorId);
  const selectedChatter = chatters.find((c) => c.id === chatterId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg !flex !flex-col gap-0 max-h-[85vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Nueva Solicitud de Contenido</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pt-2 pr-1">
          <div className="space-y-2">
            <Label>Creadora</Label>
            <Popover open={creatorOpen} onOpenChange={setCreatorOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {selectedCreator ? (selectedCreator.artistic_name || selectedCreator.name) : "Seleccionar creadora..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar creadora..." />
                  <CommandList>
                    <CommandEmpty>Sin resultados</CommandEmpty>
                    <CommandGroup>
                      {creators.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.artistic_name || c.name}
                          onSelect={() => { setCreatorId(c.id); setCreatorOpen(false); }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", creatorId === c.id ? "opacity-100" : "opacity-0")} />
                          {c.artistic_name || c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalles adicionales..." rows={3} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Fecha de Solicitud</Label>
              <Input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="solicitado">Solicitado</SelectItem>
                  <SelectItem value="en_proceso">En proceso</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="entregado">Entregado</SelectItem>
                  <SelectItem value="denegado">Denegado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="buster">Buster</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Usuario (Fan)</Label>
              <Input value={fanUsername} onChange={(e) => setFanUsername(e.target.value)} placeholder="Nombre del fan/suscriptor" />
            </div>
            <div className="space-y-2">
              <Label>Cuánto ha Gastado</Label>
              <Input type="number" step="0.01" min="0" value={fanSpentAmount} onChange={(e) => setFanSpentAmount(e.target.value)} placeholder="$0.00" />
              {category === "buster" && (
                <p className="text-xs text-amber-500">Aplicar tarifa Buster (Sugerido: +20% o cuota fija)</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Contenido</Label>
              <Select value={contentType} onValueChange={setContentType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prioridad</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tiempo o Cantidad</Label>
              <Input value={quantityOrDuration} onChange={(e) => setQuantityOrDuration(e.target.value)} placeholder="Ej: 5 min, 3 fotos..." />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones adicionales..." rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Adjuntar Imagen o Video</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileChange}
              className="hidden"
            />
            {!attachmentFile ? (
              <Button
                type="button"
                variant="outline"
                className="w-full border-dashed"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Seleccionar archivo...
              </Button>
            ) : (
              <div className="flex items-center gap-3 rounded-md border p-2">
                {attachmentPreview ? (
                  <img src={attachmentPreview} alt="Preview" className="h-16 w-16 rounded object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded bg-muted">
                    <FileVideo className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <span className="flex-1 truncate text-sm">{attachmentFile.name}</span>
                <Button type="button" variant="ghost" size="icon" onClick={removeFile}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Chatter Asignado</Label>
            <Popover open={chatterOpen} onOpenChange={setChatterOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {selectedChatter ? (selectedChatter.full_name || "Sin nombre") : "Seleccionar chatter..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar chatter..." />
                  <CommandList>
                    <CommandEmpty>Sin resultados</CommandEmpty>
                    <CommandGroup>
                      {chatters.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.full_name || ""}
                          onSelect={() => { setChatterId(c.id); setChatterOpen(false); }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", chatterId === c.id ? "opacity-100" : "opacity-0")} />
                          {c.full_name || "Sin nombre"}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor Pagado</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder="$0.00"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Fecha Límite
                {category === "buster" && <Zap className="h-3.5 w-3.5 text-amber-500" />}
              </Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={category === "buster" ? "border-red-400" : ""} />
            </div>
          </div>
        </div>

        <div className="shrink-0 flex justify-end gap-2 pt-4 border-t mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={createRequest.isPending || uploading}>
            {uploading ? "Subiendo..." : createRequest.isPending ? "Creando..." : "Crear Solicitud"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewRequestModal;
