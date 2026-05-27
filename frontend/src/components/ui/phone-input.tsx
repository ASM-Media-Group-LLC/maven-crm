import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

// IMPORTANTE: USA va antes que Canadá. Ambos comparten +1 — y como el parser
// devuelve el PRIMER match, el orden importa. La agencia trabaja casi
// exclusivamente con creadoras en USA, así que default a US es correcto.
// Si el usuario explícitamente elige Canadá, el componente recuerda la
// selección en state interno (ver `pickedISO` abajo).
const COUNTRY_CODES = [
  { code: "+1", country: "US", flag: "🇺🇸", name: "Estados Unidos" },
  { code: "+1", country: "CA", flag: "🇨🇦", name: "Canadá" },
  { code: "+54", country: "AR", flag: "🇦🇷", name: "Argentina" },
  { code: "+61", country: "AU", flag: "🇦🇺", name: "Australia" },
  { code: "+501", country: "BZ", flag: "🇧🇿", name: "Belice" },
  { code: "+591", country: "BO", flag: "🇧🇴", name: "Bolivia" },
  { code: "+55", country: "BR", flag: "🇧🇷", name: "Brasil" },
  { code: "+56", country: "CL", flag: "🇨🇱", name: "Chile" },
  { code: "+86", country: "CN", flag: "🇨🇳", name: "China" },
  { code: "+57", country: "CO", flag: "🇨🇴", name: "Colombia" },
  { code: "+82", country: "KR", flag: "🇰🇷", name: "Corea del Sur" },
  { code: "+506", country: "CR", flag: "🇨🇷", name: "Costa Rica" },
  { code: "+53", country: "CU", flag: "🇨🇺", name: "Cuba" },
  { code: "+20", country: "EG", flag: "🇪🇬", name: "Egipto" },
  { code: "+503", country: "SV", flag: "🇸🇻", name: "El Salvador" },
  { code: "+971", country: "AE", flag: "🇦🇪", name: "Emiratos Árabes" },
  { code: "+593", country: "EC", flag: "🇪🇨", name: "Ecuador" },
  { code: "+34", country: "ES", flag: "🇪🇸", name: "España" },
  { code: "+63", country: "PH", flag: "🇵🇭", name: "Filipinas" },
  { code: "+33", country: "FR", flag: "🇫🇷", name: "Francia" },
  { code: "+502", country: "GT", flag: "🇬🇹", name: "Guatemala" },
  { code: "+594", country: "GF", flag: "🇬🇫", name: "Guyana Francesa" },
  { code: "+592", country: "GY", flag: "🇬🇾", name: "Guyana" },
  { code: "+509", country: "HT", flag: "🇭🇹", name: "Haití" },
  { code: "+504", country: "HN", flag: "🇭🇳", name: "Honduras" },
  { code: "+91", country: "IN", flag: "🇮🇳", name: "India" },
  { code: "+972", country: "IL", flag: "🇮🇱", name: "Israel" },
  { code: "+39", country: "IT", flag: "🇮🇹", name: "Italia" },
  { code: "+1876", country: "JM", flag: "🇯🇲", name: "Jamaica" },
  { code: "+81", country: "JP", flag: "🇯🇵", name: "Japón" },
  { code: "+212", country: "MA", flag: "🇲🇦", name: "Marruecos" },
  { code: "+52", country: "MX", flag: "🇲🇽", name: "México" },
  { code: "+505", country: "NI", flag: "🇳🇮", name: "Nicaragua" },
  { code: "+234", country: "NG", flag: "🇳🇬", name: "Nigeria" },
  { code: "+31", country: "NL", flag: "🇳🇱", name: "Países Bajos" },
  { code: "+507", country: "PA", flag: "🇵🇦", name: "Panamá" },
  { code: "+595", country: "PY", flag: "🇵🇾", name: "Paraguay" },
  { code: "+51", country: "PE", flag: "🇵🇪", name: "Perú" },
  { code: "+351", country: "PT", flag: "🇵🇹", name: "Portugal" },
  { code: "+1787", country: "PR", flag: "🇵🇷", name: "Puerto Rico" },
  { code: "+44", country: "GB", flag: "🇬🇧", name: "Reino Unido" },
  { code: "+1809", country: "DO", flag: "🇩🇴", name: "Rep. Dominicana" },
  { code: "+7", country: "RU", flag: "🇷🇺", name: "Rusia" },
  { code: "+966", country: "SA", flag: "🇸🇦", name: "Arabia Saudí" },
  { code: "+27", country: "ZA", flag: "🇿🇦", name: "Sudáfrica" },
  { code: "+597", country: "SR", flag: "🇸🇷", name: "Surinam" },
  { code: "+66", country: "TH", flag: "🇹🇭", name: "Tailandia" },
  { code: "+1868", country: "TT", flag: "🇹🇹", name: "Trinidad y Tobago" },
  { code: "+90", country: "TR", flag: "🇹🇷", name: "Turquía" },
  { code: "+598", country: "UY", flag: "🇺🇾", name: "Uruguay" },
  { code: "+58", country: "VE", flag: "🇻🇪", name: "Venezuela" },
  { code: "+49", country: "DE", flag: "🇩🇪", name: "Alemania" },
];

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
    const num = e.target.value;
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
            <CommandInput placeholder="Buscar país..." />
            <CommandList>
              <CommandEmpty>No encontrado</CommandEmpty>
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
