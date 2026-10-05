import * as React from "react";
import { format, parse, isValid, setMonth, setYear, addMonths, subMonths } from "date-fns";
import { CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFormato } from "@/hooks/useFormato";
import { useTSiHay } from "@/hooks/useTSiHay";

// En español, los de siempre (con mayúscula y sin punto). En inglés salen de
// date-fns con el locale de la interfaz: Jan, Feb…
const MONTH_NAMES_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

interface DateInputProps {
  value: string; // yyyy-MM-dd
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  fromYear?: number;
  toYear?: number;
}

// Un año tipeado fuera del rango del componente es un error de dedo casi
// seguro (una creadora quedó con `71996-02-09` y el perfil decía "-69970
// años"). El calendario ya no deja elegirlo; el texto libre tampoco debe.
export function anioTipeadoEnRango(texto: string, fromYear: number, toYear: number): boolean {
  const m = /^\d{2}\/\d{2}\/(\d{4})$/.exec(texto);
  if (!m) return false;
  const anio = Number(m[1]);
  return anio >= fromYear && anio <= toYear;
}

export function DateInput({
  value,
  onChange,
  placeholder: placeholderProp,
  disabled = false,
  className,
  fromYear = 1940,
  toYear = new Date().getFullYear() + 5,
}: DateInputProps) {
  const f = useFormato();
  const t = useTSiHay();
  const placeholder = placeholderProp ?? t("shared.ui.selectDate");
  const nombresDeMes = React.useMemo(
    () => (f.idioma === "es"
      ? MONTH_NAMES_SHORT
      : MONTH_NAMES_SHORT.map((_, i) => format(new Date(2000, i, 1), "MMM", { locale: f.fechas }))),
    [f],
  );
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Date | undefined>(undefined);
  const [textValue, setTextValue] = React.useState("");
  const [displayMonth, setDisplayMonth] = React.useState(new Date());
  const [monthPickerOpen, setMonthPickerOpen] = React.useState(false);
  const [yearPickerOpen, setYearPickerOpen] = React.useState(false);
  const yearScrollRef = React.useRef<HTMLDivElement>(null);

  // Sync internal state when popover opens
  React.useEffect(() => {
    if (open) {
      if (value) {
        const parsed = parse(value, "yyyy-MM-dd", new Date());
        if (isValid(parsed)) {
          setDraft(parsed);
          setTextValue(format(parsed, "dd/MM/yyyy"));
          setDisplayMonth(parsed);
          return;
        }
      }
      setDraft(undefined);
      setTextValue("");
      setDisplayMonth(new Date());
    }
  }, [open, value]);

  // Scroll to current year when year picker opens
  React.useEffect(() => {
    if (yearPickerOpen && yearScrollRef.current) {
      const activeEl = yearScrollRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: "center" });
      }
    }
  }, [yearPickerOpen]);

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
      if (isValid(parsed) && anioTipeadoEnRango(raw, fromYear, toYear)) {
        setDraft(parsed);
        setDisplayMonth(parsed);
      }
    }
  };

  const handleTextBlur = () => {
    if (textValue.length === 10) {
      const parsed = parse(textValue, "dd/MM/yyyy", new Date());
      if (isValid(parsed) && anioTipeadoEnRango(textValue, fromYear, toYear)) {
        setDraft(parsed);
        return;
      }
    }
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
    ? format(selectedDate, "d MMM yyyy", { locale: f.fechas })
    : placeholder;

  const currentMonthLabel = format(displayMonth, "MMMM", { locale: f.fechas });
  const currentYear = displayMonth.getFullYear();

  const years = React.useMemo(() => {
    const arr: number[] = [];
    for (let y = fromYear; y <= toYear; y++) arr.push(y);
    return arr;
  }, [fromYear, toYear]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selectedDate && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 pointer-events-auto" align="start" side="bottom" sideOffset={4} collisionPadding={16}>
        <div className="p-3">
          {/* Custom navigation header */}
          <div className="flex items-center justify-between mb-3">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setDisplayMonth(prev => subMonths(prev, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-1">
              {/* Month picker */}
              <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-sm font-medium capitalize gap-1">
                    {currentMonthLabel}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-2 pointer-events-auto z-[60]" align="center" sideOffset={4}>
                  <div className="grid grid-cols-4 gap-1">
                    {nombresDeMes.map((name, idx) => (
                      <Button
                        key={idx}
                        variant={displayMonth.getMonth() === idx ? "default" : "ghost"}
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          setDisplayMonth(prev => setMonth(prev, idx));
                          setMonthPickerOpen(false);
                        }}
                      >
                        {name}
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Year picker */}
              <Popover open={yearPickerOpen} onOpenChange={setYearPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-sm font-medium gap-1">
                    {currentYear}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[140px] p-1 pointer-events-auto z-[60]" align="center" sideOffset={4}>
                  <ScrollArea className="h-[200px]">
                    <div ref={yearScrollRef} className="flex flex-col gap-0.5 p-1">
                      {years.map(y => (
                        <Button
                          key={y}
                          variant={currentYear === y ? "default" : "ghost"}
                          size="sm"
                          className="h-8 text-sm justify-center"
                          data-active={currentYear === y}
                          onClick={() => {
                            setDisplayMonth(prev => setYear(prev, y));
                            setYearPickerOpen(false);
                          }}
                        >
                          {y}
                        </Button>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>

            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setDisplayMonth(prev => addMonths(prev, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Calendar */}
          <DayPicker
            mode="single"
            selected={draft}
            onSelect={handleCalendarSelect}
            month={displayMonth}
            onMonthChange={setDisplayMonth}
            locale={f.fechas}
            showOutsideDays
            className="pointer-events-auto"
            classNames={{
              months: "flex flex-col",
              month: "space-y-2",
              caption: "hidden",
              nav: "hidden",
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
            }}
          />

          {/* Manual date input */}
          <div className="flex items-center justify-center mt-3 px-1">
            <Input
              placeholder={t("shared.ui.dateFormatHint")}
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
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={handleApply}>
              {t("shared.ui.apply")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
