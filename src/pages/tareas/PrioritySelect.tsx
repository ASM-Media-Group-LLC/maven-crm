import { Flag } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface PrioritySelectProps {
  value: string;
  onChange: (value: string) => void;
  showLabel?: boolean;
}

export const priorityConfig: Record<string, { label: string; color: string; badgeClass: string }> = {
  low: { label: "Baja", color: "text-muted-foreground", badgeClass: "bg-secondary text-muted-foreground border-border" },
  medium: { label: "Media", color: "text-primary", badgeClass: "bg-primary/20 text-primary border-primary/30" },
  high: { label: "Alta", color: "text-warning", badgeClass: "bg-warning/20 text-warning border-warning/30" },
  urgent: { label: "Urgente", color: "text-destructive", badgeClass: "bg-destructive/20 text-destructive border-destructive/30" },
};

const PrioritySelect = ({ value, onChange, showLabel = true }: PrioritySelectProps) => {
  return (
    <div>
      {showLabel && <Label>Prioridad</Label>}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Prioridad" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(priorityConfig).map(([key, config]) => (
            <SelectItem key={key} value={key}>
              <span className="flex items-center gap-2">
                <Flag className={`h-3 w-3 ${config.color}`} />
                {config.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default PrioritySelect;
