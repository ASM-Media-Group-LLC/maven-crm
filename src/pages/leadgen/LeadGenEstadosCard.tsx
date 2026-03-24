import { Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LeadGenEntry } from "./useLeadGen";

interface ActiveFilter {
  type: "categoria" | "status" | null;
  value: string | null;
}

interface Props {
  leads: LeadGenEntry[];
  activeFilter?: ActiveFilter;
  onFilterChange?: (filter: ActiveFilter) => void;
}

const knownStatuses = new Set(["no_response", "contactado", "respondio", "interesado", "no_interesado"]);

const estadoConfig = [
  {
    key: "respondieron",
    label: "Respondieron",
    dotClass: "bg-primary",
    activeClass: "bg-primary/10 border-l-primary",
    hoverClass: "hover:bg-primary/8 hover:border-l-primary/60",
    count: (leads: LeadGenEntry[]) =>
      leads.filter((l) => l.status === "contactado" || l.status === "respondio").length,
  },
  {
    key: "interesadas",
    label: "Interesadas",
    dotClass: "bg-success",
    activeClass: "bg-success/10 border-l-success",
    hoverClass: "hover:bg-success/8 hover:border-l-success/60",
    count: (leads: LeadGenEntry[]) => leads.filter((l) => l.status === "interesado").length,
  },
  {
    key: "no_interesadas",
    label: "No interesadas",
    dotClass: "bg-destructive",
    activeClass: "bg-destructive/10 border-l-destructive",
    hoverClass: "hover:bg-destructive/8 hover:border-l-destructive/60",
    count: (leads: LeadGenEntry[]) => leads.filter((l) => l.status === "no_interesado").length,
  },
  {
    key: "otros",
    label: "Otros",
    dotClass: "bg-muted-foreground/50",
    activeClass: "bg-muted border-l-muted-foreground",
    hoverClass: "hover:bg-muted hover:border-l-muted-foreground/40",
    count: (leads: LeadGenEntry[]) => leads.filter((l) => !knownStatuses.has(l.status)).length,
  },
  {
    key: "con_telefono",
    label: "Con Teléfono",
    dotClass: "bg-warning",
    activeClass: "bg-warning/10 border-l-warning",
    hoverClass: "hover:bg-warning/8 hover:border-l-warning/60",
    isPhone: true,
    count: (leads: LeadGenEntry[]) =>
      leads.filter((l) => !!l.phone_raw || !!l.phone_e164).length,
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
    <Card className="transition-all duration-200 hover:shadow-md hover:border-primary/30">
      <CardHeader className="pb-0.5 px-3 pt-2">
        <CardTitle className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Estados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 px-3 pb-2 pt-0">
        {estadoConfig.map((estado) => {
          const count = estado.count(leads);
          const active = isActive(estado.key);
          return (
            <button
              key={estado.key}
              onClick={() => handleClick(estado.key)}
              className={cn(
                "group w-full flex items-center gap-3 rounded-md px-3 py-1.5 border-l-[3px] transition-all duration-200 cursor-pointer text-left",
                active
                  ? estado.activeClass
                  : cn("border-l-transparent", estado.hoverClass)
              )}
            >
              {estado.isPhone ? (
                <Phone className={cn("h-3.5 w-3.5 shrink-0 transition-colors", active ? "text-warning" : "text-muted-foreground")} />
              ) : (
                <span className={cn("h-2.5 w-2.5 rounded-full shrink-0 transition-transform", estado.dotClass, active && "scale-125")} />
              )}
              <span className={cn("text-sm font-medium flex-1", active ? "text-foreground" : "text-muted-foreground")}>
                {estado.label}
              </span>
              <span className={cn("text-base font-bold tabular-nums", active ? "text-foreground" : "text-foreground/70")}>
                {count}
              </span>
              <span className="opacity-0 group-hover:opacity-60 transition-opacity text-xs text-muted-foreground">→</span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default LeadGenEstadosCard;
