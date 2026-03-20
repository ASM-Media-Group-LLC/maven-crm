import * as React from "react";
import { format, startOfToday, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, parse, isValid } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { DayPicker, type DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buttonVariants } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface DateRangePickerProps {
  from: Date | undefined;
  to: Date | undefined;
  onApply: (from: Date | undefined, to: Date | undefined) => void;
  placeholder?: string;
  className?: string;
}

const presets = [
  {
    label: "Todo",
    getValue: () => ({ from: undefined as Date | undefined, to: undefined as Date | undefined }),
  },
  {
    label: "Hoy",
    getValue: () => {
      const today = startOfToday();
      return { from: today, to: today };
    },
  },
  {
    label: "Ayer",
    getValue: () => {
      const yesterday = subDays(startOfToday(), 1);
      return { from: yesterday, to: yesterday };
    },
  },
  {
    label: "Esta semana",
    getValue: () => ({
      from: startOfWeek(startOfToday(), { weekStartsOn: 1 }),
      to: endOfWeek(startOfToday(), { weekStartsOn: 1 }),
    }),
  },
  {
    label: "Semana pasada",
    getValue: () => {
      const lastWeek = subDays(startOfToday(), 7);
      return {
        from: startOfWeek(lastWeek, { weekStartsOn: 1 }),
        to: endOfWeek(lastWeek, { weekStartsOn: 1 }),
      };
    },
  },
  {
    label: "Este mes",
    getValue: () => ({
      from: startOfMonth(startOfToday()),
      to: endOfMonth(startOfToday()),
    }),
  },
  {
    label: "Mes pasado",
    getValue: () => {
      const lastMonth = subMonths(startOfToday(), 1);
      return {
        from: startOfMonth(lastMonth),
        to: endOfMonth(lastMonth),
      };
    },
  },
];

function DateRangePicker({
  from,
  to,
  onApply,
  placeholder = "Seleccionar fechas",
  className,
}: DateRangePickerProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const [range, setRange] = React.useState<DateRange | undefined>(
    from || to ? { from, to } : undefined
  );
  const [inputFrom, setInputFrom] = React.useState(from ? format(from, "dd/MM/yyyy") : "");
  const [inputTo, setInputTo] = React.useState(to ? format(to, "dd/MM/yyyy") : "");

  // Sync external props when popover opens
  React.useEffect(() => {
    if (open) {
      setRange(from || to ? { from, to } : undefined);
      setInputFrom(from ? format(from, "dd/MM/yyyy") : "");
      setInputTo(to ? format(to, "dd/MM/yyyy") : "");
    }
  }, [open, from, to]);

  const syncInputsFromRange = (r: DateRange | undefined) => {
    setInputFrom(r?.from ? format(r.from, "dd/MM/yyyy") : "");
    setInputTo(r?.to ? format(r.to, "dd/MM/yyyy") : "");
  };

  const handleSelect = (r: DateRange | undefined) => {
    setRange(r);
    syncInputsFromRange(r);
  };

  const handlePreset = (preset: (typeof presets)[number]) => {
    const value = preset.getValue();
    if (!value.from && !value.to) {
      // "Todo" preset — apply immediately
      setRange(undefined);
      syncInputsFromRange(undefined);
      onApply(undefined, undefined);
      setOpen(false);
      return;
    }
    setRange(value as DateRange);
    syncInputsFromRange(value as DateRange);
  };

  const handleInputFromBlur = () => {
    const parsed = parse(inputFrom, "dd/MM/yyyy", new Date());
    if (isValid(parsed)) {
      setRange((prev) => ({ from: parsed, to: prev?.to }));
    }
  };

  const handleInputToBlur = () => {
    const parsed = parse(inputTo, "dd/MM/yyyy", new Date());
    if (isValid(parsed)) {
      setRange((prev) => ({ from: prev?.from, to: parsed }));
    }
  };

  const handleApply = () => {
    onApply(range?.from, range?.to);
    setOpen(false);
  };

  const handleCancel = () => {
    setOpen(false);
  };

  const triggerLabel = from && to
    ? `${format(from, "d MMM", { locale: es })} – ${format(to, "d MMM yyyy", { locale: es })}`
    : from
      ? `${format(from, "d MMM yyyy", { locale: es })}`
      : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal",
            !from && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 max-w-[calc(100vw-32px)]" align="center" sideOffset={4} collisionPadding={16}>
        <div className="flex max-h-[80vh] overflow-auto">
          {/* Presets sidebar */}
          <div className="border-r border-border p-2 space-y-0.5 w-[160px] shrink-0 hidden sm:block">
            <p className="text-xs font-medium text-muted-foreground mb-2">Acceso rápido</p>
            {presets.map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sm"
                onClick={() => handlePreset(preset)}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          {/* Calendar + inputs + footer */}
          <div className="p-3">
            <DayPicker
              mode="range"
              selected={range}
              onSelect={handleSelect}
              numberOfMonths={isMobile ? 1 : 2}
              locale={es}
              showOutsideDays
              className="pointer-events-auto"
              classNames={{
                months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                month: "space-y-4",
                caption: "flex justify-center pt-1 relative items-center",
                caption_label: "text-sm font-medium capitalize",
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
                cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-primary/10 [&:has([aria-selected])]:bg-primary/10 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                day: cn(buttonVariants({ variant: "ghost" }), "h-9 w-9 p-0 font-normal aria-selected:opacity-100"),
                day_range_end: "day-range-end",
                day_selected:
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                day_today: "bg-muted text-foreground font-bold",
                day_outside: "day-outside text-muted-foreground opacity-50 aria-selected:bg-primary/10 aria-selected:text-muted-foreground aria-selected:opacity-30",
                day_disabled: "text-muted-foreground opacity-50",
                day_range_middle: "aria-selected:bg-primary/10 aria-selected:text-foreground",
                day_hidden: "invisible",
              }}
              components={{
                IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                IconRight: () => <ChevronRight className="h-4 w-4" />,
              }}
            />

            {/* Manual date inputs */}
            <div className="flex items-center justify-center gap-2 mt-3 px-1">
              <Input
                placeholder="dd/mm/yyyy"
                value={inputFrom}
                onChange={(e) => setInputFrom(e.target.value)}
                onBlur={handleInputFromBlur}
                className="h-8 text-sm w-[110px]"
              />
              <span className="text-muted-foreground text-sm">–</span>
              <Input
                placeholder="dd/mm/yyyy"
                value={inputTo}
                onChange={(e) => setInputTo(e.target.value)}
                onBlur={handleInputToBlur}
                className="h-8 text-sm w-[110px]"
              />
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-popover z-10 flex justify-end gap-2 mt-3 pt-3 border-t border-border">
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleApply}>
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

DateRangePicker.displayName = "DateRangePicker";

export { DateRangePicker };
export type { DateRangePickerProps };
