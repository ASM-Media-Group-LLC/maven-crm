import { Users, CheckCircle, Trophy, XCircle, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  statusCounts: Record<string, number>;
  platformRevenue: Record<string, number>;
  ofMonetizationTotal: number;
}

const ClosersKPICards = ({ statusCounts, platformRevenue, ofMonetizationTotal }: Props) => {
  const asignadas = statusCounts["Asignada"] || 0;
  const confirmadas = statusCounts["Confirmada"] || 0;
  const completadas = statusCounts["Completada"] || 0;
  const noInteresadas = statusCounts["No interesada"] || 0;
  const cerradas = confirmadas + completadas;
  const total = asignadas + confirmadas + completadas + noInteresadas;

  const salePlatforms = ["Trafix", "Blu", "Piclink", "LeakHunter", "ORA"];
  const revTrafix = platformRevenue["Trafix"] || 0;
  const revBlu = platformRevenue["Blu"] || 0;
  const revPiclink = platformRevenue["Piclink"] || 0;
  const revLeakHunter = platformRevenue["LeakHunter"] || 0;
  const revORA = platformRevenue["ORA"] || 0;
  const revPlataformas = salePlatforms.reduce((s, p) => s + (platformRevenue[p] || 0), 0);
  const revTotal = ofMonetizationTotal + revPlataformas;

  const pipelineCards = [
    { label: "Total", count: total, icon: Users, colorClass: "text-muted-foreground", bgClass: "bg-muted" },
    { label: "Asignadas", count: asignadas, icon: Users, colorClass: "text-primary", bgClass: "bg-primary/20" },
    { label: "Confirmadas", count: confirmadas, icon: CheckCircle, colorClass: "text-green-600 dark:text-green-400", bgClass: "bg-green-500/20" },
    { label: "Completadas", count: completadas, icon: Trophy, colorClass: "text-green-700 dark:text-green-300", bgClass: "bg-green-600/20" },
    { label: "Cerradas", count: cerradas, icon: CheckCircle, colorClass: "text-accent-foreground", bgClass: "bg-accent/20" },
    { label: "No interesadas", count: noInteresadas, icon: XCircle, colorClass: "text-destructive", bgClass: "bg-destructive/20" },
  ];

  const revenueCards = [
    { label: "LeakHunter", amount: revLeakHunter },
    { label: "Blu", amount: revBlu },
    { label: "Trafix", amount: revTrafix },
    { label: "ORA", amount: revORA },
    { label: "Piclink", amount: revPiclink },
    { label: "Rev. Plataformas", amount: revPlataformas, highlight: true },
    { label: "Rev. OF", amount: ofMonetizationTotal, highlight: true },
    { label: "Rev. Total", amount: revTotal, highlight: true },
  ];

  return (
    <div className="space-y-3">
      {/* Pipeline */}
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        {pipelineCards.map((card) => (
          <Card key={card.label} className="transition-all duration-200 hover:scale-[1.02]">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <div className={`flex h-6 w-6 items-center justify-center rounded-md ${card.bgClass}`}>
                  <card.icon className={`h-3 w-3 ${card.colorClass}`} />
                </div>
              </div>
              <p className={`mt-1 text-xl font-bold ${card.colorClass}`}>{card.count}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue */}
      <div className="grid grid-cols-3 gap-3 md:grid-cols-8">
        {revenueCards.map((card) => (
          <Card key={card.label} className={`transition-all duration-200 hover:scale-[1.02] ${card.highlight ? "border-primary/30" : ""}`}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <DollarSign className={`h-3 w-3 ${card.highlight ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <p className={`mt-1 text-lg font-bold ${card.highlight ? "text-primary" : "text-foreground"}`}>
                ${card.amount.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ClosersKPICards;
