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
      // OJO: los roles en BD son case-sensitive. Closer Supervisor (con
      // espacio + Mayúsculas) es el role real, no "supervisor". Incluimos
      // todas las variantes que pueden ser asignadas como responsable de
      // un cierre: closer (LLG sin supervisor), Closer Supervisor, y admin.
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["closer", "Closer Supervisor", "admin"]);
      if (error) throw error;
      const userIds = Array.from(new Set(data.map((r) => r.user_id)));
      if (userIds.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds)
        .order("full_name", { ascending: true });
      return profiles || [];
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

  // Mutación: cuando el seleccionado es un contacto, lo convertimos a
  // closer_creator antes de asignar. Hace 3 cosas atómicas (best-effort):
  //   1. Si ya existe row en closer_creators con ese source_contact_id
  //      (caso común: la creó un trigger al insertar el contact, o un
  //      intento previo que sí pasó pero no marcó el contact como
  //      converted), UPDATE assigned_to. Si no existe, INSERT.
  //   2. UPDATE closers_contacts.status = 'converted' para que no
  //      aparezca como pending la próxima vez.
  //   3. Devuelve el creatorId al caller para que el parent siga
  //      con su flow normal de asignación (que ya marca assigned_to).
  const convertContactAndAssign = useMutation({
    mutationFn: async (args: { contactId: string; closerId: string }) => {
      // Traer el contact completo para copiar campos al creator.
      const { data: contact, error: fetchErr } = await supabase
        .from("closers_contacts")
        .select("id, name, handle, phone, country_code, physical_appearance")
        .eq("id", args.contactId)
        .single();
      if (fetchErr || !contact) throw fetchErr ?? new Error("contact_not_found");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not_authenticated");

      // 1) ¿Ya existe una row en closer_creators para este contacto?
      //    source_contact_id tiene UNIQUE, así que un INSERT plano
      //    falla con "duplicate key value violates unique constraint".
      const { data: existing, error: existingErr } = await supabase
        .from("closer_creators")
        .select("id")
        .eq("source_contact_id", contact.id)
        .maybeSingle();
      if (existingErr) throw existingErr;

      let creatorId: string;
      if (existing) {
        // Update — solo asignar el closer. Mantenemos stage / handle /
        // resto de campos como estaban (puede ser que el creator ya
        // tenga progreso del pipeline).
        const { data: updated, error: updateErr } = await supabase
          .from("closer_creators")
          .update({ assigned_to: args.closerId })
          .eq("id", existing.id)
          .select("id")
          .single();
        if (updateErr || !updated) throw updateErr ?? new Error("update_failed");
        creatorId = updated.id;
      } else {
        // Insert nuevo.
        const { data: inserted, error: insertErr } = await supabase
          .from("closer_creators")
          .insert({
            instagram_handle: contact.handle || contact.name || "sin_handle",
            phone: contact.phone,
            category: contact.physical_appearance,
            source_contact_id: contact.id,
            assigned_to: args.closerId,
            stage: "nuevo",
            created_by: user.id,
          })
          .select("id")
          .single();
        if (insertErr || !inserted) throw insertErr ?? new Error("insert_failed");
        creatorId = inserted.id;
      }

      // 2) Marcar el contacto como convertido. Si falla, no rollback —
      // el creator ya existe y queda asignado, lo importante.
      await supabase
        .from("closers_contacts")
        .update({ status: "converted" })
        .eq("id", contact.id);

      return creatorId;
    },
    onError: (e: Error) => {
      toast({
        title: "Error al convertir contacto",
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
      // Convertir + asignar en un solo flow.
      try {
        const newCreatorId = await convertContactAndAssign.mutateAsync({
          contactId: selectedCandidate.id,
          closerId: selected,
        });
        toast({
          title: "Contacto convertido",
          description: `${selectedCandidate.label} ahora es un creator asignado.`,
        });
        queryClient.invalidateQueries({ queryKey: ["closers_contacts"] });
        queryClient.invalidateQueries({ queryKey: ["assignable-candidates"] });
        queryClient.invalidateQueries({ queryKey: ["closer-leads"] });
        onAssign(newCreatorId, selected);
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
                  ⚡ Al asignar, el contacto se convierte automáticamente a creator del pipeline (queda con stage "nuevo" + closer asignado).
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
