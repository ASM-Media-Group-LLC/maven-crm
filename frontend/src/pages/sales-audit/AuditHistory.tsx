import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RotateCcw, CheckCircle, Clock, AlertTriangle } from "lucide-react";

interface AuditLogEntry {
  id: string;
  audit_date: string;
  creator_name: string;
  source_selected: string;
  excel_amount: number;
  system_amount: number;
  difference: number;
  excel_entries: number;
  system_entries: number;
  file_name: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string;
  created_at: string;
}

interface CorrectionEntry {
  id: string;
  audit_log_id: string | null;
  of_earnings_id: string;
  creator_name: string;
  earnings_date: string;
  original_value: number;
  new_value: number;
  applied_at: string;
  reverted_at: string | null;
}

const AuditHistory = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [corrections, setCorrections] = useState<CorrectionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [reverting, setReverting] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fetchData = async () => {
    setLoading(true);
    const [logsRes, correctionsRes] = await Promise.all([
      supabase.from("sales_audit_log").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("sales_audit_corrections").select("*").order("applied_at", { ascending: false }).limit(200),
    ]);
    setLogs((logsRes.data as any[]) || []);
    setCorrections((correctionsRes.data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const revertCorrection = async (correction: CorrectionEntry) => {
    setReverting(correction.id);
    const { data: { user } } = await supabase.auth.getUser();

    // Restore original value
    const { error: updateError } = await supabase
      .from("of_gross_earnings")
      .update({ total_earnings_gross: correction.original_value } as any)
      .eq("id", correction.of_earnings_id);

    if (updateError) {
      toast({ title: "Error al revertir", description: updateError.message, variant: "destructive" });
      setReverting(null);
      return;
    }

    // Mark correction as reverted
    const { error: revertError } = await supabase
      .from("sales_audit_corrections")
      .update({ reverted_at: new Date().toISOString(), reverted_by: user?.id } as any)
      .eq("id", correction.id);

    if (revertError) {
      toast({ title: "Error al marcar reversión", description: revertError.message, variant: "destructive" });
    } else {
      // Invalidate ALL sales caches so all reports reflect the reversion
      queryClient.invalidateQueries({ queryKey: ["of_gross_earnings_performance"] });
      queryClient.invalidateQueries({ queryKey: ["creator-info-dashboard2"] });
      queryClient.invalidateQueries({ queryKey: ["sales-overview"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard2"] });
      toast({ title: "Corrección revertida", description: `Se restauró el valor original de ${correction.creator_name}. Los reportes se actualizarán.` });
      fetchData();
    }
    setReverting(null);
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Cargando historial de auditorías...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Audit Log History */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Auditorías Realizadas</h3>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay auditorías registradas.</p>
        ) : (
          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Creadora</TableHead>
                  <TableHead>Fuente</TableHead>
                  <TableHead className="text-right">Excel</TableHead>
                  <TableHead className="text-right">Sistema</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                  <TableHead className="text-center">Entradas</TableHead>
                  <TableHead>Periodo</TableHead>
                  <TableHead>Archivo</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">
                      {new Date(log.created_at).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell className="font-medium capitalize">{log.creator_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={log.source_selected === "excel" ? "bg-blue-500/10 text-blue-500" : "bg-violet-500/10 text-violet-500"}>
                        {log.source_selected === "excel" ? "Excel" : "Sistema"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">${Number(log.excel_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right text-xs">${Number(log.system_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right text-xs">${Number(log.difference).toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-center text-xs">{log.excel_entries} / {log.system_entries}</TableCell>
                    <TableCell className="text-xs">{log.period_start} → {log.period_end}</TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">{log.file_name}</TableCell>
                    <TableCell className="text-center">
                      {log.status === "applied" ? (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/30 gap-1">
                          <CheckCircle className="h-3 w-3" /> Aplicada
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 gap-1">
                          <Clock className="h-3 w-3" /> Pendiente
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Corrections with revert option */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Correcciones Aplicadas</h3>
        {corrections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay correcciones registradas.</p>
        ) : (
          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha Aplicación</TableHead>
                  <TableHead>Creadora</TableHead>
                  <TableHead>Fecha Registro</TableHead>
                  <TableHead className="text-right">Valor Original</TableHead>
                  <TableHead className="text-right">Valor Nuevo</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-center">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {corrections.map((c) => (
                  <TableRow key={c.id} className={c.reverted_at ? "opacity-50" : ""}>
                    <TableCell className="text-xs">
                      {new Date(c.applied_at).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell className="font-medium capitalize">{c.creator_name}</TableCell>
                    <TableCell className="text-xs">{c.earnings_date?.slice(0, 10)}</TableCell>
                    <TableCell className="text-right text-xs">${Number(c.original_value).toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right text-xs font-medium">${Number(c.new_value).toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-center">
                      {c.reverted_at ? (
                        <Badge variant="outline" className="bg-muted text-muted-foreground gap-1">
                          <RotateCcw className="h-3 w-3" /> Revertida
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/30">Activa</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {!c.reverted_at && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          disabled={reverting === c.id}
                          onClick={() => revertCorrection(c)}
                        >
                          <RotateCcw className="h-3 w-3" />
                          {reverting === c.id ? "Revirtiendo..." : "Revertir"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditHistory;
