import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
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
  placeholder = "Seleccionar fecha",
  disabled = false,
  className,
  fromYear = 1940,
  toYear = new Date().getFullYear() + 5,
}: DateInputProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Date | undefined>(undefined);
  const [textValue, setTextValue] = React.useState("");

  // Sync internal state when popover opens
  React.useEffect(() => {
    if (open) {
      if (value) {
        const parsed = parse(value, "yyyy-MM-dd", new Date());
        if (isValid(parsed)) {
          setDraft(parsed);
          setTextValue(format(parsed, "dd/MM/yyyy"));
          return;
        }
      }
      setDraft(undefined);
      setTextValue("");
    }
  }, [open, value]);

  const handleCalendarSelect = (date: Date | undefined) => {
    setDraft(date);
    setTextValue(date ? format(date, "dd/MM/yyyy") : "");
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^\d/]/g, "");
    const digits = raw.replace(/\//g, "");
    if (digits.length <= 2) {
      raw = digits;
    } else if (digits.length <= 4) {
      raw = digits.slice(0, 2) + "/" + digits.slice(2);
    } else {
      raw = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4, 8);
    }
    setTextValue(raw);

    if (raw.length === 10) {
      const parsed = parse(raw, "dd/MM/yyyy", new Date());
      if (isValid(parsed)) {
        setDraft(parsed);
      }
    }
  };

  const handleTextBlur = () => {
    if (textValue.length === 10) {
      const parsed = parse(textValue, "dd/MM/yyyy", new Date());
      if (isValid(parsed)) {
        setDraft(parsed);
        return;
      }
    }
    // Reset text to match draft
    setTextValue(draft ? format(draft, "dd/MM/yyyy") : "");
  };

  const handleApply = () => {
    onChange(draft ? format(draft, "yyyy-MM-dd") : "");
    setOpen(false);
  };

  const handleCancel = () => {
    setOpen(false);
  };

  const selectedDate = React.useMemo(() => {
    if (!value) return undefined;
    const d = parse(value, "yyyy-MM-dd", new Date());
    return isValid(d) ? d : undefined;
  }, [value]);

  const triggerLabel = selectedDate
    ? format(selectedDate, "d MMM yyyy", { locale: es })
    : placeholder;

  const defaultMonth = draft || selectedDate || new Date();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "justify-start text-left font-normal",
            !selectedDate && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" sideOffset={4} collisionPadding={16}>
        <div className="p-3">
          <DayPicker
            mode="single"
            selected={draft}
            onSelect={handleCalendarSelect}
            defaultMonth={defaultMonth}
            captionLayout="dropdown-buttons"
            fromYear={fromYear}
            toYear={toYear}
            locale={es}
            showOutsideDays
            className="pointer-events-auto"
            classNames={{
              months: "flex flex-col space-y-4",
              month: "space-y-4",
              caption: "flex justify-center pt-1 relative items-center",
              caption_label: "text-sm font-medium capitalize",
              caption_dropdowns: "flex gap-1",
              nav: "space-x-1 flex items-center",
              nav_button: cn(
                buttonVariants({ variant: "outline" }),
                "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
              ),
              nav_button_previous: "absolute left-1",
              nav_button_next: "absolute right-1",
              table: "w-full border-collapse space-y-1",
              head_row: "flex",
              head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
              row: "flex w-full mt-2",
              cell: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
              day: cn(buttonVariants({ variant: "ghost" }), "h-9 w-9 p-0 font-normal aria-selected:opacity-100"),
              day_selected:
                "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
              day_today: "bg-muted text-foreground font-bold",
              day_outside: "day-outside text-muted-foreground opacity-50",
              day_disabled: "text-muted-foreground opacity-50",
              day_hidden: "invisible",
              vhidden: "sr-only",
              dropdown: "bg-background border border-border rounded-md px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 cursor-pointer hover:bg-muted transition-colors",
              dropdown_month: "mr-1",
              dropdown_year: "",
              dropdown_icon: "hidden",
            }}
            components={{
              IconLeft: () => <ChevronLeft className="h-4 w-4" />,
              IconRight: () => <ChevronRight className="h-4 w-4" />,
            }}
          />

          {/* Manual date input */}
          <div className="flex items-center justify-center mt-3 px-1">
            <Input
              placeholder="dd/mm/aaaa"
              value={textValue}
              onChange={handleTextChange}
              onBlur={handleTextBlur}
              maxLength={10}
              className="h-8 text-sm w-[140px] text-center"
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-border">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleApply}>
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
