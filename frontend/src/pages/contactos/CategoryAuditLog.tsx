import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowRight, Clock, Shield } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import InstagramIcon from "@/components/icons/InstagramIcon";

interface Props {
  open: boolean;
}

const CategoryAuditLog = ({ open }: Props) => {
  const { data: changes = [], isLoading } = useQuery({
    queryKey: ["category-audit-log"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_category_changes")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Resolve agent names
  const agentIds = useMemo(() => {
    const ids = new Set<string>();
    changes.forEach((c) => { if (c.changed_by) ids.add(c.changed_by); });
    return Array.from(ids);
  }, [changes]);

  const { data: profiles = {} } = useQuery({
    queryKey: ["audit-profiles", agentIds],
    enabled: agentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_agent_names", { _user_ids: agentIds });
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => { map[p.id] = p.full_name || "Desconocido"; });
      return map;
    },
  });

  // Split into suspicious (>24h) and all
  const suspicious = useMemo(() =>
    changes.filter((c) => (c.hours_since_creation ?? 0) > 24),
    [changes]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Cargando log de auditoría…</p>
      </div>
    );
  }

  if (changes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Shield className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No se han registrado cambios de categoría aún.</p>
        <p className="text-xs text-muted-foreground">Cuando un agente cambie la categoría de un contacto, aparecerá aquí.</p>
      </div>
    );
  }

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-muted-foreground">Total cambios</p>
            <p className="text-2xl font-bold">{changes.length}</p>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-xs text-amber-500">⚠ Sospechosos (&gt;24h)</p>
            <p className="text-2xl font-bold text-amber-500">{suspicious.length}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-muted-foreground">Agentes involucrados</p>
            <p className="text-2xl font-bold">{agentIds.length}</p>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border max-h-[280px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky top-0 bg-card z-10">Fecha</TableHead>
                <TableHead className="sticky top-0 bg-card z-10">Contacto</TableHead>
                <TableHead className="sticky top-0 bg-card z-10">Cambio</TableHead>
                <TableHead className="sticky top-0 bg-card z-10">Agente</TableHead>
                <TableHead className="sticky top-0 bg-card z-10">Horas después</TableHead>
                <TableHead className="sticky top-0 bg-card z-10">Riesgo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {changes.map((c) => {
                const agentName = profiles[c.changed_by] || "Desconocido";
                const isSuspicious = (c.hours_since_creation ?? 0) > 24;
                const hoursLabel = c.hours_since_creation != null
                  ? c.hours_since_creation < 1
                    ? `${Math.round(c.hours_since_creation * 60)} min`
                    : `${Math.round(c.hours_since_creation)}h`
                  : "—";

                return (
                  <TableRow key={c.id} className={isSuspicious ? "bg-amber-500/5" : ""}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {c.changed_at
                        ? format(new Date(c.changed_at), "dd MMM yy, HH:mm", { locale: es })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <a
                          href={`https://instagram.com/${c.contact_handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                        >
                          <InstagramIcon className="h-3.5 w-3.5" />
                          <span className="font-medium">@{c.contact_handle}</span>
                        </a>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{c.contact_name}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] px-1.5">{c.old_category || "—"}</Badge>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <Badge variant="outline" className="text-[10px] px-1.5 border-primary text-primary">{c.new_category || "—"}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex h-6 w-6 cursor-default items-center justify-center rounded-full border border-border bg-muted text-[10px] font-semibold">
                            {getInitials(agentName)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{agentName}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {hoursLabel}
                      </div>
                    </TableCell>
                    <TableCell>
                      {isSuspicious ? (
                        <Badge variant="destructive" className="text-[10px] gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Sospechoso
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Normal</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <p className="text-[10px] text-muted-foreground">
          Se registra automáticamente cada cambio de categoría. Los cambios realizados más de 24 horas después de la creación del contacto se marcan como sospechosos.
        </p>
      </div>
    </TooltipProvider>
  );
};

export default CategoryAuditLog;
