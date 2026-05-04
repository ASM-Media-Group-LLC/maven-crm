import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface Props {
  projection: {
    projected: number;
    dailyAvg: number;
    daysRemaining: number;
    progressPercent: number;
  };
}

const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;

const ProyeccionCard = ({ projection }: Props) => (
  <Card>
    <CardContent className="p-5 space-y-4">
      <p className="text-sm font-medium text-foreground">Proyección Fin de Mes</p>
      <p className="text-3xl font-bold text-foreground">{fmt(projection.projected)}</p>
      <Progress value={projection.progressPercent} className="h-2" />
      <div className="grid grid-cols-2 gap-4 text-xs">
        <div>
          <p className="text-muted-foreground">Promedio Diario</p>
          <p className="font-medium text-foreground">{fmt(projection.dailyAvg)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Días Restantes</p>
          <p className="font-medium text-foreground">{projection.daysRemaining}</p>
        </div>
      </div>
    </CardContent>
  </Card>
);

export default ProyeccionCard;
