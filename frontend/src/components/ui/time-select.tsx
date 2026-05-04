import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));

interface TimeSelectProps {
  value: string; // "HH:mm"
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

const TimeSelect = ({ value, onChange, disabled, className }: TimeSelectProps) => {
  const [hour, minute] = (value || "08:00").split(":");

  const currentMinute = MINUTES.includes(minute) ? minute : "00";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Select value={hour} onValueChange={(h) => onChange(`${h}:${currentMinute}`)} disabled={disabled}>
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="HH" />
        </SelectTrigger>
        <SelectContent>
          {HOURS.map((h) => (
            <SelectItem key={h} value={h}>{h}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground font-medium">:</span>
      <Select value={currentMinute} onValueChange={(m) => onChange(`${hour}:${m}`)} disabled={disabled}>
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="mm" />
        </SelectTrigger>
        <SelectContent>
          {MINUTES.map((m) => (
            <SelectItem key={m} value={m}>{m}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export { TimeSelect };
