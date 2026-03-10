import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
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

  useEffect(() => {
    setSelected(currentAssignee || "");
  }, [currentAssignee]);

  const { data: closers = [] } = useQuery({
    queryKey: ["closers-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["closer", "admin"]);
      if (error) throw error;
      const userIds = data.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      return profiles || [];
    },
    enabled: open,
  });

  if (!creatorId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Asignar Closer</DialogTitle>
        </DialogHeader>
        <div>
          <Label>Closer responsable</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger><SelectValue placeholder="Seleccionar closer" /></SelectTrigger>
            <SelectContent>
              {closers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.full_name || c.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
