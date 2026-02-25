import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIME_OPTIONS } from "./timeOptions";
import { cn } from "@/lib/utils";

interface InlineDateTimeEditProps {
  taskId: string;
  field: "start_at" | "due_at";
  currentValue: string | null;
  onPatch: (taskId: string, fields: Record<string, any>) => void;
  colorClass?: string;
}

const isDefaultTime = (value: string | null, field: "start_at" | "due_at"): boolean => {
  if (!value) return true;
  const d = new Date(value);
  const hh = d.getHours();
  const mm = d.getMinutes();
  if (field === "due_at" && hh === 23 && mm === 59) return true;
  if (field === "start_at" && hh === 0 && mm === 0) return true;
  return false;
};

const InlineDateTimeEdit = ({ taskId, field, currentValue, onPatch, colorClass = "text-muted-foreground" }: InlineDateTimeEditProps) => {
  const [open, setOpen] = useState(false);
  const currentDate = currentValue ? new Date(currentValue) : undefined;
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(currentDate);
  const [selectedTime, setSelectedTime] = useState("");

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      const d = currentValue ? new Date(currentValue) : undefined;
      setSelectedDate(d);
      if (d && !isDefaultTime(currentValue, field)) {
        setSelectedTime(format(d, "HH:mm"));
      } else {
        setSelectedTime("");
      }
    }
    setOpen(isOpen);
  };

  const handleApply = () => {
    if (!selectedDate) {
      if (field === "start_at") {
        onPatch(taskId, { [field]: null });
      }
      setOpen(false);
      return;
    }
    const dt = new Date(selectedDate);
    if (selectedTime) {
      const [h, m] = selectedTime.split(":").map(Number);
      dt.setHours(h, m, 0, 0);
    } else {
      dt.setHours(field === "due_at" ? 23 : 0, field === "due_at" ? 59 : 0, 0, 0);
    }
    onPatch(taskId, { [field]: dt.toISOString() });
    setOpen(false);
  };

  const handleClear = () => {
    if (field === "start_at") {
      onPatch(taskId, { [field]: null });
      setOpen(false);
    }
  };

  const displayText = currentValue
    ? isDefaultTime(currentValue, field)
      ? format(new Date(currentValue), "dd/MM/yy")
      : format(new Date(currentValue), "dd/MM/yy HH:mm")
    : "—";

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={cn("h-auto p-0.5 text-xs", colorClass)}>
          <CalendarIcon className="h-3 w-3 mr-1 shrink-0" />
          {displayText}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          className={cn("p-3 pointer-events-auto")}
        />
        <div className="px-3 pb-2 flex items-center gap-2">
          <div className="relative">
            <Select value={selectedTime || undefined} onValueChange={setSelectedTime}>
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue placeholder="Sin hora" />
              </SelectTrigger>
              <SelectContent className="max-h-48">
                {TIME_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTime && (
              <button type="button" onClick={() => setSelectedTime("")} className="absolute right-7 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="flex gap-1 ml-auto">
            {field === "start_at" && currentValue && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleClear}>
                Quitar
              </Button>
            )}
            <Button size="sm" className="h-8 text-xs" onClick={handleApply}>
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default InlineDateTimeEdit;
