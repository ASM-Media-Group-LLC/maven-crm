import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  activePeriod: string;
  onPeriodChange: (p: "Hoy" | "7 días" | "Este mes") => void;
}

const periods: Array<"Hoy" | "7 días" | "Este mes"> = ["Hoy", "7 días", "Este mes"];

const ComparativasHeader = ({ activePeriod, onPeriodChange }: Props) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <button onClick={() => navigate("/sales-overview")} className="hover:text-foreground transition-colors">
          Creator Sales
        </button>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-medium">Comparativas</span>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Comparativas</h1>
          <p className="text-sm text-muted-foreground">Análisis mes vs mes</p>
        </div>
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {periods.map((p) => (
            <Button
              key={p}
              variant={activePeriod === p ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onPeriodChange(p)}
              className="text-xs"
            >
              {p}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ComparativasHeader;
