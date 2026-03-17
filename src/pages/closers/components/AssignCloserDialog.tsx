import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  creatorId: string | null;
  currentAssignee: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssign: (id: string, assignedTo: string) => void;
}

const AssignCloserDialog = ({ creatorId, currentAssignee, open, onOpenChange, onAssign }: Props) => {
  const [selected, setSelected] = useState("");
  const [comboOpen, setComboOpen] = useState(false);

  useEffect(() => {
    setSelected(currentAssignee || "");
  }, [currentAssignee]);

  const { data: closers = [] } = useQuery({
    queryKey: ["closers-list-only"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "closer");
      if (error) throw error;
      const userIds = data.map((r) => r.user_id);
      if (userIds.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      return profiles || [];
    },
    enabled: open,
  });

  if (!creatorId) return null;

  const selectedCloser = closers.find((c) => c.id === selected);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Asignar Closer</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Closer responsable</Label>
          <Popover open={comboOpen} onOpenChange={setComboOpen} modal={true}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" aria-expanded={comboOpen} className="w-full justify-between font-normal">
                {selectedCloser ? selectedCloser.full_name || selectedCloser.id : "Seleccionar closer..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => { if (selected && creatorId) onAssign(creatorId, selected); }} disabled={!selected}>
            Asignar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AssignCloserDialog;
