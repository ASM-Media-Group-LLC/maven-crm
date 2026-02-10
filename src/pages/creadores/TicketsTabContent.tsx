import { Ticket, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Props {
  creatorId: string;
}

const TicketsTabContent = ({ creatorId }: Props) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Ticket className="h-5 w-5" />
            Tickets de Customer Service
          </CardTitle>
          <CardDescription>Tickets relacionados con esta creadora</CardDescription>
        </div>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Nuevo Ticket
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center rounded-lg bg-muted/50 py-16 px-6">
          <Ticket className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h4 className="font-semibold text-muted-foreground">No hay tickets registrados</h4>
          <p className="text-sm text-muted-foreground/70 mt-1">Crea un ticket para comenzar</p>
          <Button variant="outline" className="mt-4">
            Crear Primer Ticket
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default TicketsTabContent;
