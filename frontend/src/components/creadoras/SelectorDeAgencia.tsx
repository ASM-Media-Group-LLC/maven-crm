import { useEffect } from "react";
import { Lock } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useAgenciaDeCreadoras } from "@/hooks/useAgenciaDeCreadoras";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// «Agencia asignada» de una creadora. Si mi agencia tiene líneas (Kash: Kash Plus,
// Kash Massive, Atomick), se elige entre ellas. Si no, es mi agencia: el nombre
// con el que está registrada en Maven, fijo y en gris.
export default function SelectorDeAgencia({
  value, onChange, invalido = false, id,
}: { value: string; onChange: (v: string) => void; invalido?: boolean; id?: string }) {
  const { t } = useLanguage();
  const { lineas, propia, cargando } = useAgenciaDeCreadoras();
  const fija = !cargando && lineas.length === 0;

  // Sin líneas, el valor es siempre el de mi agencia.
  useEffect(() => {
    if (fija && propia && value !== propia) onChange(propia);
  }, [fija, propia, value, onChange]);

  if (fija) {
    return (
      <div className="relative">
        <Input id={id} value={propia} disabled readOnly aria-readonly="true" className="pr-9" />
        <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }
  const elegible = lineas.some((l) => l.nombre === value) ? value : "";
  return (
    <Select value={elegible} onValueChange={onChange} disabled={cargando}>
      <SelectTrigger id={id} className={cn(invalido && "border-destructive")}>
        <SelectValue placeholder={t("creadores.new.selectAgency")} />
      </SelectTrigger>
      <SelectContent>
        {lineas.map((l) => <SelectItem key={l.id} value={l.nombre}>{l.nombre}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
