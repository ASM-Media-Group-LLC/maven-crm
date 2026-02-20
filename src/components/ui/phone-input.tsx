import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const COUNTRY_CODES = [
  { code: "+57", country: "CO", flag: "🇨🇴" },
  { code: "+52", country: "MX", flag: "🇲🇽" },
  { code: "+54", country: "AR", flag: "🇦🇷" },
  { code: "+56", country: "CL", flag: "🇨🇱" },
  { code: "+51", country: "PE", flag: "🇵🇪" },
  { code: "+593", country: "EC", flag: "🇪🇨" },
  { code: "+58", country: "VE", flag: "🇻🇪" },
  { code: "+1", country: "US", flag: "🇺🇸" },
  { code: "+34", country: "ES", flag: "🇪🇸" },
  { code: "+55", country: "BR", flag: "🇧🇷" },
  { code: "+507", country: "PA", flag: "🇵🇦" },
  { code: "+506", country: "CR", flag: "🇨🇷" },
  { code: "+1809", country: "DO", flag: "🇩🇴" },
  { code: "+502", country: "GT", flag: "🇬🇹" },
  { code: "+504", country: "HN", flag: "🇭🇳" },
  { code: "+503", country: "SV", flag: "🇸🇻" },
  { code: "+505", country: "NI", flag: "🇳🇮" },
  { code: "+598", country: "UY", flag: "🇺🇾" },
  { code: "+591", country: "BO", flag: "🇧🇴" },
  { code: "+595", country: "PY", flag: "🇵🇾" },
];

// Sort by code length descending so longer codes match first
const SORTED_CODES = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);

function parsePhone(value: string): { countryCode: string; number: string } {
  const trimmed = value.trim();
  for (const c of SORTED_CODES) {
    if (trimmed.startsWith(c.code)) {
      return { countryCode: c.code, number: trimmed.slice(c.code.length).trim() };
    }
  }
  return { countryCode: "+57", number: trimmed.replace(/^\+?\d{0,3}\s*/, "") };
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
  const { countryCode, number } = parsePhone(value);

  const handleCodeChange = (newCode: string) => {
    onChange(`${newCode} ${number}`.trim());
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const num = e.target.value;
    onChange(`${countryCode} ${num}`.trim());
  };

  const selected = COUNTRY_CODES.find((c) => c.code === countryCode) || COUNTRY_CODES[0];

  return (
    <div className={cn("flex gap-1", className)}>
      <Select value={countryCode} onValueChange={handleCodeChange} disabled={disabled}>
        <SelectTrigger className="w-[100px] shrink-0">
          <SelectValue>
            {selected.flag} {selected.code}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {COUNTRY_CODES.map((c) => (
            <SelectItem key={c.country} value={c.code}>
              {c.flag} {c.country} {c.code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
