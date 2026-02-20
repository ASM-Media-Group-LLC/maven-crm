import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DateInputProps {
  value: string; // yyyy-MM-dd
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  fromYear?: number;
  toYear?: number;
}

export function DateInput({
  value,
  onChange,
  placeholder = "dd/mm/aaaa",
  disabled = false,
  className,
  fromYear = 1940,
  toYear = new Date().getFullYear() + 5,
}: DateInputProps) {
  const [open, setOpen] = React.useState(false);
  const [textValue, setTextValue] = React.useState("");

  // Sync textValue when value prop changes externally
  React.useEffect(() => {
    if (value) {
      const parsed = parse(value, "yyyy-MM-dd", new Date());
      if (isValid(parsed)) {
        setTextValue(format(parsed, "dd/MM/yyyy"));
      }
    } else {
      setTextValue("");
    }
  }, [value]);

  const selectedDate = React.useMemo(() => {
    if (!value) return undefined;
    const d = parse(value, "yyyy-MM-dd", new Date());
    return isValid(d) ? d : undefined;
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^\d/]/g, "");

    // Auto-insert slashes
    const digits = raw.replace(/\//g, "");
    if (digits.length <= 2) {
      raw = digits;
    } else if (digits.length <= 4) {
      raw = digits.slice(0, 2) + "/" + digits.slice(2);
    } else {
      raw = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4, 8);
    }

    setTextValue(raw);

    // Try to parse complete date
    if (raw.length === 10) {
      const parsed = parse(raw, "dd/MM/yyyy", new Date());
      if (isValid(parsed)) {
        onChange(format(parsed, "yyyy-MM-dd"));
      }
    }
  };

  const handleBlur = () => {
    if (!textValue) {
      onChange("");
      return;
    }
    if (textValue.length === 10) {
      const parsed = parse(textValue, "dd/MM/yyyy", new Date());
      if (isValid(parsed)) {
        onChange(format(parsed, "yyyy-MM-dd"));
        return;
      }
    }
    // Reset to current value if invalid
    if (value) {
      const d = parse(value, "yyyy-MM-dd", new Date());
      if (isValid(d)) setTextValue(format(d, "dd/MM/yyyy"));
    } else {
      setTextValue("");
    }
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      onChange(format(date, "yyyy-MM-dd"));
    } else {
      onChange("");
    }
    setOpen(false);
  };

  const defaultMonth = selectedDate || new Date();

  return (
    <div className={cn("flex gap-1", className)}>
      <Input
        value={textValue}
        onChange={handleTextChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={10}
        className="flex-1"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            disabled={disabled}
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleCalendarSelect}
            defaultMonth={defaultMonth}
            captionLayout="dropdown-buttons"
            fromYear={fromYear}
            toYear={toYear}
            locale={es}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
