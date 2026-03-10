import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import CreatorTable from "../components/CreatorTable";
import AssignCloserDialog from "../components/AssignCloserDialog";
import { CloserCreator } from "../useCloserCreators";

interface Props {
  creators: CloserCreator[];
  onAssign: (id: string, assignedTo: string) => void;
}

const AsignacionTab = ({ creators, onAssign }: Props) => {
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const assigningCreator = creators.find((c) => c.id === assigningId);

  const columns = [
    { key: "instagram_handle", label: "Instagram" },
    { key: "category", label: "Categoría" },
    { key: "stage", label: "Estado" },
    { key: "assigned_to", label: "Closer asignado" },
    {
      key: "action",
      label: "",
      render: (c: CloserCreator) => (
        <Button variant="outline" size="sm" onClick={() => setAssigningId(c.id)}>
          <UserPlus className="h-4 w-4 mr-1" /> Asignar
        </Button>
      ),
    },
  ];

  return (
    <>
      <CreatorTable creators={creators} columns={columns} showActions={false} />
      <AssignCloserDialog
        creatorId={assigningId}
        currentAssignee={assigningCreator?.assigned_to || null}
        open={!!assigningId}
        onOpenChange={(o) => !o && setAssigningId(null)}
        onAssign={(id, to) => { onAssign(id, to); setAssigningId(null); }}
      />
    </>
  );
};

export default AsignacionTab;
