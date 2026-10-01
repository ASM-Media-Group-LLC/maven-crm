import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { TIPOS_ANUNCIO, PRIORIDADES_ANUNCIO } from "./opcionesAnuncio";

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  filterType: string;
  onFilterTypeChange: (v: string) => void;
  filterPriority: string;
  onFilterPriorityChange: (v: string) => void;
}

const AnnouncementFilters = ({
  search,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  filterPriority,
  onFilterPriorityChange,
}: Props) => {
  const { t } = useLanguage();
  // En el filtro, "update" se lee corto ("Actualización"); en el alta, entero.
  const tipos = TIPOS_ANUNCIO.map((o) => ({
    value: o.value,
    label: t(o.value === "update" ? "hrg.ann.type.updateShort" : o.clave),
  }));
  // La prioridad, de mayor a menor: así estaba el filtro.
  const prioridades = [...PRIORIDADES_ANUNCIO].reverse();
  return (
  <div className="flex flex-wrap items-center gap-3">
    <div className="relative flex-1 min-w-[200px] max-w-xs">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder={t("hrg.ann.searchPlaceholder")}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="pl-9 h-9"
      />
    </div>
    <Select value={filterType} onValueChange={onFilterTypeChange}>
      <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("common.allTypes")}</SelectItem>
        {tipos.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    <Select value={filterPriority} onValueChange={onFilterPriorityChange}>
      <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("hrg.ann.allPriorities")}</SelectItem>
        {prioridades.map((o) => (
          <SelectItem key={o.value} value={o.value}>{t(o.clave)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
  );
};

export default AnnouncementFilters;
