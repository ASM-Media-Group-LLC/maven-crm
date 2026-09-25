import { useState } from "react";
import { Search, List, LayoutGrid, X, Check, ChevronsUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getCountryFlag, getCountryName } from "@/lib/country-utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import { ETIQUETA_PRIORIDAD } from "./etiquetas";

export interface ContactoFilters {
  search: string;
  estado: string;
  pais: string;
  ciudad: string;
  categoria: string;
  dateFrom: string;
  dateTo: string;
  creadoPor: string;
  // Canales de venta seleccionados. Valores = wa_channels.id, más las opciones
  // especiales "__none__" (sin contactar por WhatsApp) y "__multi__" (2+ canales).
  salesChannels?: string[];
  /** Tipo de contacto: "" (todos) | "modelo" | "agencia". Sin esto las 464
   *  agencias quedan perdidas entre ~3.100 contactos de modelos. */
  contactKind?: string;
}

// Opciones especiales del filtro "Canal de venta".
export const SALES_CHANNEL_NONE = "__none__";
export const SALES_CHANNEL_MULTI = "__multi__";

interface CreatorOption {
  value: string;
  label: string;
}

interface SalesChannelOption {
  id: string;
  label: string;
}

interface Props {
  filters: ContactoFilters;
  onChange: (patch: Partial<ContactoFilters>) => void;
  view?: "table" | "grid";
  onViewChange?: (v: "table" | "grid") => void;
  hasActiveFilters?: boolean;
  onClear?: () => void;
  creators?: CreatorOption[];
  cities?: string[];
  // Solo admin: opciones del filtro "Canal de venta" (los 7 canales).
  salesChannelOptions?: SalesChannelOption[];
  // Con permiso de ver teléfonos, el buscador también busca por número (y el
  // placeholder lo dice).
  canSearchPhone?: boolean;
}

const ContactosFilters = ({ filters, onChange, view, onViewChange, hasActiveFilters, onClear, creators = [], cities = [], salesChannelOptions = [], canSearchPhone = false }: Props) => {
  const { t } = useLanguage();
  const [agentOpen, setAgentOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);

  const selectedChannels = filters.salesChannels ?? [];
  const toggleChannel = (id: string) => {
    const set = new Set(selectedChannels);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange({ salesChannels: Array.from(set) });
  };
  const channelButtonLabel = (() => {
    if (selectedChannels.length === 0) return t("contactos.salesChannel");
    if (selectedChannels.length === 1) {
      const only = selectedChannels[0];
      if (only === SALES_CHANNEL_NONE) return t("contactos.notContacted");
      if (only === SALES_CHANNEL_MULTI) return t("contactos.twoPlusChannels");
      return salesChannelOptions.find((o) => o.id === only)?.label ?? t("contactos.oneChannel");
    }
    return t("contactos.nChannels", { count: selectedChannels.length });
  })();

  return (
    <div className="flex flex-wrap items-center gap-3 sm:overflow-x-auto">
      <div className="relative w-full sm:w-64 sm:shrink-0">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={canSearchPhone ? t("contactos.searchPlaceholderPhone") : t("contactos.searchPlaceholder")}
          className="pl-9"
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
        />
      </div>

      <FilterSelect
        placeholder={t("common.country")}
        value={filters.pais}
        options={["AR", "BR", "CL", "CO", "CR", "EC", "ES", "GB", "GT", "HN", "IT", "MX", "PA", "PE", "PY", "SV", "TH", "US", "UY", "VE"]}
        labels={Object.fromEntries(
          ["AR", "BR", "CL", "CO", "CR", "EC", "ES", "GB", "GT", "HN", "IT", "MX", "PA", "PE", "PY", "SV", "TH", "US", "UY", "VE"]
            .map((c) => [c, `${getCountryFlag(c)} ${getCountryName(c)}`])
        )}
        onChange={(v) => onChange({ pais: v })}
      />
      {/* Tipo: separa las agencias (B2B) de los contactos de modelos. */}
      <FilterSelect
        placeholder={t("common.type")}
        value={filters.contactKind ?? ""}
        options={["modelo", "agencia"]}
        labels={{ modelo: t("contactos.kindModels"), agencia: t("contactos.kindAgencies") }}
        onChange={(v) => onChange({ contactKind: v })}
      />
      {/* Alta/Media/Baja es la prioridad de una agencia: el valor se filtra tal
          cual está en la base; solo cambia lo que se lee. */}
      <FilterSelect
        placeholder={t("common.category")}
        value={filters.categoria}
        options={["A+", "A", "B+", "B", "C", "Alta", "Media", "Baja"]}
        labels={Object.fromEntries(Object.entries(ETIQUETA_PRIORIDAD).map(([v, k]) => [v, t(k)]))}
        onChange={(v) => onChange({ categoria: v })}
      />
      <FilterSelect
        placeholder={t("common.city")}
        value={filters.ciudad}
        options={cities}
        onChange={(v) => onChange({ ciudad: v })}
      />

      {/* Searchable Agente selector */}
      <Popover open={agentOpen} onOpenChange={setAgentOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={agentOpen}
            className="w-full sm:w-[180px] justify-between font-normal"
          >
            <span className="truncate">
              {filters.creadoPor || t("contactos.agent")}
            </span>
            <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-0" align="start">
          <Command>
            <CommandInput placeholder={t("contactos.searchAgent")} />
            <CommandList>
              <CommandEmpty />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    onChange({ creadoPor: "" });
                    setAgentOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", !filters.creadoPor ? "opacity-100" : "opacity-0")} />
                  {t("common.all")}
                </CommandItem>
                {creators.map((c) => (
                  <CommandItem
                    key={c.value}
                    onSelect={() => {
                      onChange({ creadoPor: c.label });
                      setAgentOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", filters.creadoPor === c.label ? "opacity-100" : "opacity-0")} />
                    {c.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Canal de venta — solo admin + cuando hay canales. Multi-select. */}
      {salesChannelOptions.length > 0 && (
        <Popover open={channelOpen} onOpenChange={setChannelOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={channelOpen}
              className="w-full sm:w-[180px] justify-between font-normal sm:shrink-0"
            >
              <span className="truncate">{channelButtonLabel}</span>
              <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[240px] p-0" align="start">
            <Command>
              <CommandInput placeholder={t("contactos.searchChannel")} />
              <CommandList>
                <CommandEmpty />
                <CommandGroup>
                  {salesChannelOptions.map((o) => (
                    <CommandItem key={o.id} onSelect={() => toggleChannel(o.id)}>
                      <Check className={cn("mr-2 h-4 w-4", selectedChannels.includes(o.id) ? "opacity-100" : "opacity-0")} />
                      {o.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup heading={t("contactos.special")}>
                  <CommandItem onSelect={() => toggleChannel(SALES_CHANNEL_MULTI)}>
                    <Check className={cn("mr-2 h-4 w-4", selectedChannels.includes(SALES_CHANNEL_MULTI) ? "opacity-100" : "opacity-0")} />
                    {t("contactos.contactedTwoPlus")}
                  </CommandItem>
                  <CommandItem onSelect={() => toggleChannel(SALES_CHANNEL_NONE)}>
                    <Check className={cn("mr-2 h-4 w-4", selectedChannels.includes(SALES_CHANNEL_NONE) ? "opacity-100" : "opacity-0")} />
                    {t("contactos.notContactedWhatsapp")}
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {hasActiveFilters && onClear && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="mr-1.5 h-4 w-4" />
          {t("contactos.clearFilters")}
        </Button>
      )}

      {view !== undefined && onViewChange && (
        <div className="ml-auto flex gap-1 shrink-0">
          <Button
            variant={view === "table" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => onViewChange("table")}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => onViewChange("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

function FilterSelect({
  placeholder,
  value,
  options = [],
  labels,
  onChange,
}: {
  placeholder: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (v: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <Select value={value || undefined} onValueChange={(v) => onChange(v === "__all__" ? "" : v)}>
      <SelectTrigger className="w-full sm:w-[180px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">{t("common.all")}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {labels?.[o] || o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default ContactosFilters;
