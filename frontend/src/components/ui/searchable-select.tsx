// SearchableSelect — wrapper sobre Popover + Command que reemplaza a
// Select cuando hay >10 opciones. El user puede tipear para filtrar
// y los resultados se acotan en vivo. Mantiene la misma API que Select
// (value, onValueChange, placeholder) para drop-in replacement.
//
// Uso:
//   <SearchableSelect
//     value={countryFilter}
//     onValueChange={setCountryFilter}
//     placeholder="País"
//     options={[
//       { value: "all", label: "Todos los países" },
//       { value: "México", label: "🇲🇽 México (852)" },
//       ...
//     ]}
//   />

import { useState, useMemo } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  value: string;
  label: string;
  // Texto adicional para que el search matchee. Útil para incluir
  // sinónimos / valores sin acentos / etc. El label siempre se incluye.
  searchAdditional?: string;
}

interface SearchableSelectProps {
  value: string;
  onValueChange: (v: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  triggerClassName?: string;
  popoverWidth?: string;
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Seleccionar…",
  searchPlaceholder = "Buscar…",
  emptyMessage = "Sin resultados.",
  triggerClassName,
  popoverWidth,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between font-normal", triggerClassName)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("p-0", popoverWidth ?? "w-[--radix-popover-trigger-width]")}
        align="start"
      >
        <Command
          filter={(itemValue, search) => {
            // cmdk filter por defecto matchea contra `value` solamente.
            // Acá usamos el label + searchAdditional concatenados para
            // que el typing busque por texto visible, no por el value
            // técnico (slug/id).
            const opt = options.find((o) => o.value === itemValue);
            if (!opt) return 0;
            const hay = (opt.label + " " + (opt.searchAdditional ?? ""))
              .toLowerCase()
              .normalize("NFD")
              .replace(/[̀-ͯ]/g, "");
            const needle = search
              .toLowerCase()
              .normalize("NFD")
              .replace(/[̀-ͯ]/g, "");
            return hay.includes(needle) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} className="h-9 text-xs" />
          <CommandList className="max-h-[280px]">
            <CommandEmpty className="text-xs py-3 text-center text-muted-foreground">
              {emptyMessage}
            </CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.value}
                  onSelect={() => {
                    onValueChange(opt.value);
                    setOpen(false);
                  }}
                  className="text-xs cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5",
                      opt.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{opt.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
