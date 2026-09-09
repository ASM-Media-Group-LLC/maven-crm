import { useEffect, useMemo, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";

export interface PersonaDelEquipo {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
}

// Elegir varias personas del equipo: las elegidas quedan como CHIPS arriba
// (con su × para sacarlas), y abajo la búsqueda y la lista con casillas.
// Pedido de Jhon (09/09/2026) para compartir grabaciones, con la forma de los
// chips de "assigned creators" de Agency QA.
export function SelectorDePersonas({
  value, onChange, excluir = [], placeholder = "Buscar en el equipo…", className,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  /** Ids que no se ofrecen (por ejemplo, uno mismo o quien grabó). */
  excluir?: string[];
  placeholder?: string;
  className?: string;
}) {
  const [personas, setPersonas] = useState<PersonaDelEquipo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, avatar_seed")
        .order("full_name");
      if (!vivo) return;
      setPersonas((data as PersonaDelEquipo[]) ?? []);
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, []);

  const porId = useMemo(() => new Map(personas.map((p) => [p.id, p])), [personas]);
  const excluidos = useMemo(() => new Set(excluir), [excluir]);
  const elegidos = useMemo(() => new Set(value), [value]);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return personas.filter((p) => !excluidos.has(p.id) && (!q || (p.full_name ?? "").toLowerCase().includes(q)));
  }, [personas, excluidos, filtro]);

  const toggle = (id: string) => onChange(elegidos.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className={cn("space-y-3", className)}>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-border/60 bg-muted/30 p-2" data-testid="chips">
          {value.map((id) => {
            const p = porId.get(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-1 pr-1.5 text-xs font-medium text-foreground"
              >
                <UserAvatar name={p?.full_name ?? "?"} src={p?.avatar_url} seed={p?.avatar_seed} size="xs" />
                <span className="max-w-[10rem] truncate">{p?.full_name ?? "…"}</span>
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-primary/20 hover:text-foreground"
                  aria-label={`Quitar a ${p?.full_name ?? "esta persona"}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder={placeholder} className="rounded-full pl-9" />
      </div>

      <div className="max-h-56 divide-y divide-border/40 overflow-y-auto rounded-xl border border-border/60">
        {cargando ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : visibles.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sin resultados</p>
        ) : (
          visibles.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50">
              <Checkbox checked={elegidos.has(p.id)} onCheckedChange={() => toggle(p.id)} />
              <UserAvatar name={p.full_name ?? "?"} src={p.avatar_url} seed={p.avatar_seed} size="xs" />
              <span className="truncate text-sm text-foreground">{p.full_name || "Sin nombre"}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
