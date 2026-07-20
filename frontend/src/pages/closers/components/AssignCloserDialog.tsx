import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  creatorId: string | null;
  currentAssignee: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssign: (id: string, assignedTo: string) => void;
}

// Unión de candidatos asignables. `kind` distingue de qué tabla viene
// para que al confirmar sepamos si hay que convertir o no.
type Candidate = {
  id: string;
  label: string;
  kind: "creator" | "contact";
  searchKey: string;
};

const AssignCloserDialog = ({ creatorId, currentAssignee, open, onOpenChange, onAssign }: Props) => {
  const [selected, setSelected] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [creatorComboOpen, setCreatorComboOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const needsCreatorSelection = !creatorId;

  useEffect(() => {
    setSelected(currentAssignee || "");
    setSelectedCandidate(null);
  }, [currentAssignee, creatorId]);

  const { data: closers = [] } = useQuery({
    queryKey: ["closers-list-only"],
    queryFn: async () => {
      // RPC SECURITY DEFINER (closer + Closer Supervisor + admin): leer user_roles
      // directo solo funcionaba para admins — la RLS le devolvía 0 filas a un team
      // leader y el diálogo quedaba "No se encontró ningún closer".
      const { data, error } = await (supabase as any).rpc("get_assignable_closers");
      if (error) throw error;
      return (data || []) as { id: string; full_name: string }[];
    },
    enabled: open,
  });

  // Trae candidatos asignables: creators ya en el pipeline + contactos
  // todavía no convertidos. Cuando el usuario elige un contacto, al
  // confirmar se convierte automáticamente (crea row en closer_creators
  // con source_contact_id, marca el contacto como converted, asigna al
  // closer elegido).
  const { data: candidates = [] } = useQuery<Candidate[]>({
    queryKey: ["assignable-candidates"],
    queryFn: async () => {
      const [creatorsRes, contactsRes] = await Promise.all([
        supabase
          .from("closer_creators")
          .select("id, instagram_handle")
          .order("created_at", { ascending: false })
          .limit(200),
        // Contactos NO convertidos todavía. Queremos TODOS menos los
        // con status='converted' — incluyendo los con status=NULL (que
        // son la mayoría histórica: 120 contactos con NULL hoy).
        //
        // CUIDADO: .neq("status", "converted") excluye también los NULL
        // porque en SQL `NULL != 'converted'` evalúa a UNKNOWN (no TRUE).
        // Por eso usamos un OR explícito: status IS NULL OR status != 'converted'.
        supabase
          .from("closers_contacts")
          .select("id, name, handle, status")
          .or("status.is.null,status.neq.converted")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      if (creatorsRes.error) throw creatorsRes.error;
      if (contactsRes.error) throw contactsRes.error;

      const creators: Candidate[] = (creatorsRes.data ?? []).map((c) => ({
        id: c.id,
        label: c.instagram_handle ?? "(sin handle)",
        kind: "creator" as const,
        searchKey: c.instagram_handle ?? "",
      }));
      const contacts: Candidate[] = (contactsRes.data ?? []).map((c) => ({
        id: c.id,
        // handle si está, sino name. Si no hay ninguno, sin handle.
        label: c.handle || c.name || "(sin nombre)",
        kind: "contact" as const,
        searchKey: `${c.handle ?? ""} ${c.name ?? ""}`.trim(),
      }));
      // Contactos primero (lo nuevo a procesar suele estar acá), creators
      // después.
      return [...contacts, ...creators];
    },
    enabled: open && needsCreatorSelection,
  });

  const selectedCloser = closers.find((c) => c.id === selected);

  // Si vinimos con un creatorId set (modo "asignar este creator"), no
  // hace falta convertir nada — el ID ya es de closer_creators.
  // Si vinimos sin creatorId, dependemos de selectedCandidate.
  const targetIsContact = needsCreatorSelection && selectedCandidate?.kind === "contact";

  // Mutación: convertir un contacto a creator + asignarlo. TODA la lógica
  // (chequear-si-existe + convertir-o-reasignar + marcar convertido) vive ahora
  // en el RPC SECURITY DEFINER `assign_closer_to_contact`, que corre server-side:
  //   · Inmune a RLS → el chequeo de existencia ve TODAS las filas, así que
  //     nunca intenta duplicar una fila que el caller no veía (el viejo bug
  //     "duplicate key closer_creators_source_contact_id_key").
  //   · Gateado por el MISMO permiso de la UI (Closers / Asignar Closer) via
  //     has_permission() → si el rol no lo tiene marcado, el RPC devuelve 403.
  //   · Atómico: deja la fila en stage 'Asignada' + passed_date.
  // Devuelve el closer_creators.id.
  const convertContactAndAssign = useMutation({
    mutationFn: async (args: { contactId: string; closerId: string }) => {
      // (supabase as any): el RPC es nuevo y todavía no está en los tipos generados.
      const { data, error } = await (supabase as any).rpc("assign_closer_to_contact", {
        p_contact_id: args.contactId,
        p_closer_id: args.closerId,
      });
      if (error) throw error;
      return data as string; // closer_creators.id
    },
    onError: (e: Error) => {
      toast({
        title: "Error al asignar",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const handleAssign = async () => {
    if (!selected) return;
    if (creatorId) {
      // Modo simple: ya vino un creatorId, solo asignar.
      onAssign(creatorId, selected);
      return;
    }
    if (!selectedCandidate) return;

    if (selectedCandidate.kind === "contact") {
      // El RPC convierte + asigna TODO server-side. NO llamamos onAssign (que
      // dispararía un segundo UPDATE del lado del cliente, gated por RLS, que
      // volvería a fallar para roles no-supervisores): solo refrescamos y cerramos.
      try {
        await convertContactAndAssign.mutateAsync({
          contactId: selectedCandidate.id,
          closerId: selected,
        });
        toast({
          title: "Contacto asignado",
          description: `${selectedCandidate.label} quedó asignada a ${selectedCloser?.full_name ?? "el closer"} (stage Asignada).`,
        });
        queryClient.invalidateQueries({ queryKey: ["closers_contacts"] });
        queryClient.invalidateQueries({ queryKey: ["assignable-candidates"] });
        queryClient.invalidateQueries({ queryKey: ["closer-leads"] });
        onOpenChange(false);
      } catch {
        // toast ya manejado en onError de la mutation.
      }
      return;
    }

    // Creator existente — flow normal.
    onAssign(selectedCandidate.id, selected);
  };

  // Split visual: contactos pendientes arriba, creators del pipeline
  // abajo. Separados con un CommandSeparator + group header para que se
  // entienda qué se está eligiendo.
  const pendingContacts = candidates.filter((c) => c.kind === "contact");
  const existingCreators = candidates.filter((c) => c.kind === "creator");

  const canConfirm = !!selected && (
    !!creatorId || !!selectedCandidate
  ) && !convertContactAndAssign.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Asignar Closer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {needsCreatorSelection && (
            <div className="space-y-2">
              <Label>Creator</Label>
              <Popover open={creatorComboOpen} onOpenChange={setCreatorComboOpen} modal={true}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={creatorComboOpen} className="w-full justify-between font-normal">
                    {selectedCandidate ? (
                      <span className="flex items-center gap-2 truncate">
                        {selectedCandidate.label}
                        {selectedCandidate.kind === "contact" && (
                          <Badge variant="secondary" className="text-[10px]">Contacto</Badge>
                        )}
                      </span>
                    ) : (
                      "Seleccionar creator o contacto..."
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar por handle o nombre..." />
                    <CommandList>
                      <CommandEmpty>Sin resultados.</CommandEmpty>
                      {pendingContacts.length > 0 && (
                        <CommandGroup heading="Contactos pendientes (se convierten al asignar)">
                          {pendingContacts.map((c) => (
                            <CommandItem
                              key={`contact-${c.id}`}
                              value={c.searchKey || c.label}
                              onSelect={() => { setSelectedCandidate(c); setCreatorComboOpen(false); }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", selectedCandidate?.id === c.id && selectedCandidate?.kind === "contact" ? "opacity-100" : "opacity-0")} />
                              <span className="flex-1 truncate">{c.label}</span>
                              <Badge variant="secondary" className="ml-2 text-[10px]">Contacto</Badge>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                      {pendingContacts.length > 0 && existingCreators.length > 0 && (
                        <CommandSeparator />
                      )}
                      {existingCreators.length > 0 && (
                        <CommandGroup heading="Creators en el pipeline">
                          {existingCreators.map((c) => (
                            <CommandItem
                              key={`creator-${c.id}`}
                              value={c.searchKey || c.label}
                              onSelect={() => { setSelectedCandidate(c); setCreatorComboOpen(false); }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", selectedCandidate?.id === c.id && selectedCandidate?.kind === "creator" ? "opacity-100" : "opacity-0")} />
                              <span className="flex-1 truncate">{c.label}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {targetIsContact && (
                <p className="text-[11px] text-muted-foreground">
                  ⚡ Al asignar, el contacto se convierte automáticamente a creator del pipeline (queda con stage "Asignada" + closer asignado).
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Closer responsable</Label>
            <Popover open={comboOpen} onOpenChange={setComboOpen} modal={true}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={comboOpen} className="w-full justify-between font-normal">
                  {selectedCloser ? selectedCloser.full_name || selectedCloser.id : "Seleccionar closer..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar closer..." />
                  <CommandList>
                    <CommandEmpty>No se encontró ningún closer.</CommandEmpty>
                    <CommandGroup>
                      {closers.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.full_name || c.id}
                          onSelect={() => { setSelected(c.id); setComboOpen(false); }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selected === c.id ? "opacity-100" : "opacity-0")} />
                          {c.full_name || c.id}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={convertContactAndAssign.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleAssign} disabled={!canConfirm}>
            {convertContactAndAssign.isPending ? "Asignando..." : "Asignar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AssignCloserDialog;
