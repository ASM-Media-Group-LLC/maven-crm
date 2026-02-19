import { Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Lead = { status: string; notas?: string | null };

interface ActiveFilter {
  type: "categoria" | "status" | null;
  value: string | null;
}

interface Props {
  leads: Lead[];
  activeFilter?: ActiveFilter;
  onFilterChange?: (filter: ActiveFilter) => void;
}

const knownStatuses = new Set(["nuevo", "contactado", "respondio", "interesado", "no_interesado"]);

const estadoConfig = [
  {
    key: "respondieron",
    label: "Respondieron",
    dotClass: "bg-primary",
    activeClass: "bg-primary/10 border-l-primary",
    count: (leads: Lead[]) =>
      leads.filter((l) => l.status === "contactado" || l.status === "respondio").length,
  },
  {
    key: "interesadas",
    label: "Interesadas",
    dotClass: "bg-success",
    activeClass: "bg-success/10 border-l-success",
    count: (leads: Lead[]) => leads.filter((l) => l.status === "interesado").length,
  },
  {
    key: "no_interesadas",
    label: "No interesadas",
    dotClass: "bg-destructive",
    activeClass: "bg-destructive/10 border-l-destructive",
    count: (leads: Lead[]) => leads.filter((l) => l.status === "no_interesado").length,
  },
  {
    key: "otros",
    label: "Otros",
    dotClass: "bg-muted-foreground/50",
    activeClass: "bg-muted border-l-muted-foreground",
    count: (leads: Lead[]) => leads.filter((l) => !knownStatuses.has(l.status)).length,
  },
  {
    key: "con_telefono",
    label: "Con Teléfono",
    dotClass: "bg-warning",
    activeClass: "bg-warning/10 border-l-warning",
    isPhone: true,
    count: (leads: Lead[]) =>
      leads.filter((l) => l.notas && /\+?\d[\d\s\-().]{7,}/.test(l.notas)).length,
  },
];

const LeadGenEstadosCard = ({ leads = [], activeFilter, onFilterChange }: Props) => {
  const handleClick = (key: string) => {
    if (!onFilterChange) return;
    if (activeFilter?.type === "status" && activeFilter.value === key) {
      onFilterChange({ type: null, value: null });
    } else {
      onFilterChange({ type: "status", value: key });
    }
  };

  const isActive = (key: string) =>
    activeFilter?.type === "status" && activeFilter.value === key;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Estados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {estadoConfig.map((estado) => {
          const count = estado.count(leads);
          const active = isActive(estado.key);
          return (
            <button
              key={estado.key}
              onClick={() => handleClick(estado.key)}
              className={cn(
                "w-full flex items-center gap-3 rounded-md px-3 py-2.5 border-l-[3px] transition-all",
                "hover:bg-muted/60 cursor-pointer text-left",
                active
                  ? estado.activeClass
                  : "border-l-transparent"
              )}
            >
              {estado.isPhone ? (
                <Phone className={cn("h-3.5 w-3.5 shrink-0", active ? "text-warning" : "text-muted-foreground")} />
              ) : (
                <span className={cn("h-2.5 w-2.5 rounded-full shrink-0 transition-transform", estado.dotClass, active && "scale-125")} />
              )}
              <span className={cn("text-sm font-medium flex-1", active ? "text-foreground" : "text-muted-foreground")}>
                {estado.label}
              </span>
              <span className={cn("text-base font-bold tabular-nums", active ? "text-foreground" : "text-foreground/70")}>
                {count}
              </span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default LeadGenEstadosCard;
