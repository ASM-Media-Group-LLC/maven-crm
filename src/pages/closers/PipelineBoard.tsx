import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Deal, STAGES } from "./useDeals";

interface PipelineBoardProps {
  deals: Deal[];
}

const stageColors: Record<string, string> = {
  Nuevo: "bg-primary",
  Contactado: "bg-accent",
  "Llamada Agendada": "bg-[hsl(var(--chart-1))]",
  "En Llamada": "bg-[hsl(var(--chart-2))]",
  "No Show": "bg-destructive",
  Cerrado: "bg-[hsl(var(--success))]",
  Perdido: "bg-muted-foreground",
};

const PipelineBoard = ({ deals }: PipelineBoardProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {STAGES.map((stage) => {
        const stageDeals = deals.filter((d) => d.stage === stage);
        return (
          <div key={stage} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold truncate">{stage}</span>
              <Badge variant="secondary" className="text-[10px] h-5 min-w-5 justify-center">
                {stageDeals.length}
              </Badge>
            </div>
            <div className={`h-1 rounded-full ${stageColors[stage] || "bg-muted"}`} />
            <div className="flex flex-col gap-2 min-h-[80px]">
              {stageDeals.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-4">
                  Sin deals
                </p>
              ) : (
                stageDeals.map((deal) => (
                  <Card key={deal.id} className="cursor-default">
                    <CardContent className="p-3">
                      <p className="text-sm font-medium truncate">
                        {deal.prospect_handle}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {deal.source}
                      </p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PipelineBoard;
