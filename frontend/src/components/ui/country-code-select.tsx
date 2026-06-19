import * as React from "react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COUNTRY_DIAL_CODES, findByDialCode } from "@/lib/country-codes";

// Selector de INDICATIVO de país: combobox buscable (se filtra escribiendo el país),
// lista COMPLETA (lib/country-codes), emite SOLO el indicativo (ej. "+593"). Para
// formularios que guardan country_code y phone por separado (ej. editar contacto).
interface CountryCodeSelectProps {
  value: string;                       // indicativo, ej. "+593"
  onChange: (code: string) => void;
  disabled?: boolean;
  className?: string;
}

export function CountryCodeSelect({ value, onChange, disabled = false, className }: CountryCodeSelectProps) {
  const [open, setOpen] = React.useState(false);
  const selected = findByDialCode(value) ?? COUNTRY_DIAL_CODES.find((c) => c.iso === "CO")!;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-[110px] shrink-0 justify-between px-2 font-normal", className)}
        >
          <span className="truncate">{selected.flag} {selected.code}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" side="bottom" align="start">
        <Command>
          <CommandInput placeholder="Buscar país..." />
          <CommandList>
            <CommandEmpty>No encontrado</CommandEmpty>
            <CommandGroup>
              {COUNTRY_DIAL_CODES.map((c) => (
                <CommandItem
                  key={`${c.iso}-${c.code}`}
                  value={`${c.name} ${c.iso} ${c.code}`}
                  onSelect={() => { onChange(c.code); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === c.code ? "opacity-100" : "opacity-0")} />
                  {c.flag} {c.name} <span className="ml-auto text-muted-foreground text-xs">{c.code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
