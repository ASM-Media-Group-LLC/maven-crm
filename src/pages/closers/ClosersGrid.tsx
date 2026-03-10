import { Deal, STAGES } from "./useDeals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub,
  DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, Pencil, ArrowRightLeft, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface ClosersGridProps {
  deals: Deal[];
  onView: (deal: Deal) => void;
  onEdit: (deal: Deal) => void;
  onDelete: (deal: Deal) => void;
  onStageChange: (id: string, stage: string) => void;
}

const stageColors: Record<string, string> = {
  Nuevo: "bg-primary/10 text-primary",
  Contactado: "bg-accent/10 text-accent-foreground",
  "Llamada Agendada": "bg-[hsl(var(--chart-1))]/10 text-[hsl(var(--chart-1))]",
  "En Llamada": "bg-[hsl(var(--chart-2))]/10 text-[hsl(var(--chart-2))]",
  "No Show": "bg-destructive/10 text-destructive",
  Cerrado: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
  Perdido: "bg-muted text-muted-foreground",
};

const ClosersGrid = ({ deals, onView, onEdit, onDelete, onStageChange }: ClosersGridProps) => {
  if (deals.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/30 p-8 text-center">
        <p className="text-sm text-muted-foreground">No hay deals</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {deals.map((deal) => (
        <Card key={deal.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{deal.prospect_handle}</p>
                <p className="text-sm text-muted-foreground">{deal.source}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(deal)}>
                    <Eye className="h-4 w-4 mr-2" />Ver detalle
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(deal)}>
                    <Pencil className="h-4 w-4 mr-2" />Editar
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <ArrowRightLeft className="h-4 w-4 mr-2" />Cambiar etapa
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent>
                        {STAGES.map((s) => (
                          <DropdownMenuItem
                            key={s}
                            disabled={deal.stage === s}
                            onClick={() => onStageChange(deal.id, s)}
                          >
                            {s}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => onDelete(deal)}>
                    <Trash2 className="h-4 w-4 mr-2" />Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex items-center justify-between mt-3">
              <Badge variant="secondary" className={stageColors[deal.stage] || ""}>{deal.stage}</Badge>
              <span className="text-xs text-muted-foreground">
                {deal.created_at ? format(new Date(deal.created_at), "dd/MM/yyyy") : "—"}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default ClosersGrid;
