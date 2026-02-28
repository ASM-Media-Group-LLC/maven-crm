import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
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
  { value: "texto", label: "Texto" },
  { value: "otro", label: "Otro" },
];

const PRIORITIES = [
  { value: "baja", label: "Baja" },
  { value: "normal", label: "Normal" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
];

const NewRequestModal = ({ open, onOpenChange }: Props) => {
  const { createRequest } = useCustomRequests();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contentType, setContentType] = useState("foto");
  const [priority, setPriority] = useState("normal");
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [chatterId, setChatterId] = useState<string | null>(null);
  const [chatterOpen, setChatterOpen] = useState(false);
  const [paidAmount, setPaidAmount] = useState("");

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

  const handleSubmit = () => {
    if (!title.trim()) return;
    createRequest.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        content_type: contentType,
        creator_id: creatorId,
        priority,
        due_date: dueDate || null,
        assigned_chatter_id: chatterId,
        paid_amount: parseFloat(paidAmount) || undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setTitle("");
          setDescription("");
          setContentType("foto");
          setPriority("normal");
          setCreatorId(null);
          setDueDate("");
          setChatterId(null);
          setPaidAmount("");
        },
      }
    );
  };

  const selectedCreator = creators.find((c) => c.id === creatorId);
  const selectedChatter = chatters.find((c) => c.id === chatterId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva Solicitud de Contenido</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Describe brevemente la solicitud" />
          </div>

          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalles adicionales..." rows={3} />
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
            <Label>Chatter / Usuario Asignado</Label>
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
              <Label>Fecha Límite</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={!title.trim() || createRequest.isPending}>
              {createRequest.isPending ? "Creando..." : "Crear Solicitud"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewRequestModal;
