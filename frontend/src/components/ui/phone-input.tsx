import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTSiHay } from "@/hooks/useTSiHay";
import { COUNTRY_DIAL_CODES } from "@/lib/country-codes";

// Lista COMPLETA de indicativos compartida (lib/country-codes). Mapeamos `iso`→`country`
// para no tocar el resto del componente. En la fuente USA va antes que Canadá (ambos +1)
// → el parser (primer match) devuelve USA por defecto, correcto para el negocio; si el
// usuario elige Canadá explícitamente, se recuerda en `pickedISO`.
const COUNTRY_CODES = COUNTRY_DIAL_CODES.map((c) => ({
  code: c.code, country: c.iso, flag: c.flag, name: c.name,
}));

// Sort by code length descending so longer codes match first
const SORTED_CODES = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);

function parsePhone(value: string): { countryCode: string; countryISO: string; number: string } {
  const trimmed = value.trim();
  for (const c of SORTED_CODES) {
    if (trimmed.startsWith(c.code)) {
      return { countryCode: c.code, countryISO: c.country, number: trimmed.slice(c.code.length).trim() };
    }
  }
  return { countryCode: "+57", countryISO: "CO", number: trimmed.replace(/^\+?\d{0,3}\s*/, "") };
}

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  placeholder = "300 000 0000",
  className,
  disabled = false,
}: PhoneInputProps) {
  const t = useTSiHay();
  const [open, setOpen] = React.useState(false);
  // Recuerda la selección EXPLÍCITA del usuario (por click en el dropdown).
  // El parser solo mira el string del value y para códigos compartidos
  // como +1 (USA/Canadá) no puede distinguir. Sin este state, elegir
  // Canadá se "perdería" en el siguiente render porque el parser
  // devuelve siempre el primer match (USA).
  const [pickedISO, setPickedISO] = React.useState<string | null>(null);
  const { countryCode, countryISO, number } = parsePhone(value);

  // Si el usuario picó explícitamente un ISO y ese país comparte el
  // countryCode actual (típico +1 → US o CA), respetamos su elección.
  // Si el countryCode cambió (cambió de país), el pickedISO ya no aplica.
  const effectiveISO = pickedISO &&
    COUNTRY_CODES.some((c) => c.country === pickedISO && c.code === countryCode)
    ? pickedISO
    : countryISO;

  const handleSelect = (country: typeof COUNTRY_CODES[0]) => {
    setPickedISO(country.country);
    onChange(`${country.code} ${number}`.trim());
    setOpen(false);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Un teléfono solo lleva dígitos (y espacios para legibilidad). Filtramos
    // letras y símbolos para que no se puedan tipear/pegar en el número.
    const num = e.target.value.replace(/[^\d\s]/g, "");
    onChange(`${countryCode} ${num}`.trim());
  };

  const selected = COUNTRY_CODES.find((c) => c.country === effectiveISO) ||
    COUNTRY_CODES.find((c) => c.code === countryCode) ||
    COUNTRY_CODES.find((c) => c.country === "CO")!;

  return (
    <div className={cn("flex gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-[110px] shrink-0 justify-between px-2 font-normal"
          >
            <span className="truncate">{selected.flag} {selected.code}</span>
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0" side="bottom" align="start">
          <Command>
            <CommandInput placeholder={t("shared.ui.searchCountry")} />
            {/* Wheel: dentro de un <Dialog>, el scroll-lock de Radix bloquea la rueda
                sobre el Popover portaleado → scrolleamos la lista a mano. */}
            <CommandList onWheel={(e) => { e.currentTarget.scrollTop += e.deltaY; }}>
              <CommandEmpty>{t("shared.ui.notFound")}</CommandEmpty>
              <CommandGroup>
                {COUNTRY_CODES.map((c) => (
                  <CommandItem
                    key={c.country}
                    value={`${c.name} ${c.country} ${c.code}`}
                    onSelect={() => handleSelect(c)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        effectiveISO === c.country ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {c.flag} {c.name} <span className="ml-auto text-muted-foreground text-xs">{c.code}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Input
        type="tel"
        value={number}
        onChange={handleNumberChange}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1"
      />
    </div>
  );
}
