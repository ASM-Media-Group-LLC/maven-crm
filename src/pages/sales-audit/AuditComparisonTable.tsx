import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, FileDown, Save, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AuditSummaryCards from "./AuditSummaryCards";
import AuditEntriesInfo from "./AuditEntriesInfo";
import AuditEntryDetail, { type EntryDetail } from "./AuditEntryDetail";

interface AuditRow {
  creator: string;
  excelGross: number;
  systemGross: number;
  diff: number;
  diffPct: number;
  excelEntries: number;
  systemEntries: number;
}

interface Props {
  file: File;
}

function parseMoney(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const cleaned = val.replace(/[$,]/g, "").trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

/**
 * Deduplicate hourly snapshots: keep only the LAST record per day per creator.
 * This matches Dashboard2's deduplication logic so audit comparisons are accurate.
 */
function deduplicateSystemRecords(
  records: { id: string; date: string; amount: number; pending_creator: string }[]
) {
  const grouped = new Map<string, { id: string; date: string; amount: number; pending_creator: string }>();
  for (const rec of records) {
    const creator = rec.pending_creator.trim().toLowerCase();
    const dateKey = rec.date.slice(0, 10);
    const key = `${creator}__${dateKey}`;
    const existing = grouped.get(key);
    if (!existing || rec.date > existing.date) {
      grouped.set(key, rec);
    }
  }
  return Array.from(grouped.values());
}

const AuditComparisonTable = ({ file }: Props) => {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<{ min: string; max: string } | null>(null);
  const [totalExcelEntries, setTotalExcelEntries] = useState(0);
  const [totalSystemEntries, setTotalSystemEntries] = useState(0);
  const [excelDetails, setExcelDetails] = useState<Map<string, EntryDetail[]>>(new Map());
  const [systemDetails, setSystemDetails] = useState<Map<string, EntryDetail[]>>(new Map());
  const [systemRawRecords, setSystemRawRecords] = useState<Map<string, { id: string; date: string; amount: number }[]>>(new Map());
  const [expanded, setExpanded] = useState<Record<string, "excel" | "system" | null>>({});
  const [applying, setApplying] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const run = async () => {
      setLoading(true);

      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      const excelMap = new Map<string, number>();
      const excelCountMap = new Map<string, number>();
      const excelDetailMap = new Map<string, EntryDetail[]>();
      let minDate = "9999-12-31";
      let maxDate = "0000-01-01";

      for (const row of data) {
        const dateRaw = (row["Date/Time America/New_York"] || row["Date"] || "") as string;
        const dateStr = typeof dateRaw === "string" ? dateRaw.slice(0, 10) : "";
        if (dateStr && dateStr < minDate) minDate = dateStr;
        if (dateStr && dateStr > maxDate) maxDate = dateStr;

        const creator = ((row["Creator"] || "") as string).trim().toLowerCase();
        if (!creator) continue;

        const gross = parseMoney(row["Total earnings Gross"] || row["Total Earnings Gross"]);
        excelMap.set(creator, (excelMap.get(creator) || 0) + gross);
        excelCountMap.set(creator, (excelCountMap.get(creator) || 0) + 1);
        const arr = excelDetailMap.get(creator) || [];
        arr.push({ date: dateStr, amount: gross });
        excelDetailMap.set(creator, arr);
      }

      const { data: dbData } = await supabase
        .from("of_gross_earnings")
        .select("id, pending_creator, total_earnings_gross, date")
        .gte("date", minDate)
        .lte("date", maxDate + "T23:59:59");

      const systemMap = new Map<string, number>();
      const systemCountMap = new Map<string, number>();
      const systemDetailMap = new Map<string, EntryDetail[]>();
      const rawRecordsMap = new Map<string, { id: string; date: string; amount: number }[]>();
      for (const r of dbData || []) {
        const creator = (r.pending_creator || "").trim().toLowerCase();
        if (!creator) continue;
        const amount = Number(r.total_earnings_gross) || 0;
        systemMap.set(creator, (systemMap.get(creator) || 0) + amount);
        systemCountMap.set(creator, (systemCountMap.get(creator) || 0) + 1);
        const dateStr = typeof r.date === "string" ? r.date.slice(0, 10) : "";
        const arr = systemDetailMap.get(creator) || [];
        arr.push({ date: dateStr, amount });
        systemDetailMap.set(creator, arr);
        const rawArr = rawRecordsMap.get(creator) || [];
        rawArr.push({ id: r.id, date: r.date, amount });
        rawRecordsMap.set(creator, rawArr);
      }

      const allCreators = new Set([...excelMap.keys(), ...systemMap.keys()]);
      const result: AuditRow[] = [];
      let totalExcel = 0;
      let totalSystem = 0;

      for (const c of allCreators) {
        const ex = excelMap.get(c) || 0;
        const sys = systemMap.get(c) || 0;
        const diff = ex - sys;
        const diffPct = sys !== 0 ? (diff / sys) * 100 : ex !== 0 ? 100 : 0;
        const exEntries = excelCountMap.get(c) || 0;
        const sysEntries = systemCountMap.get(c) || 0;
        totalExcel += exEntries;
        totalSystem += sysEntries;
        result.push({ creator: c, excelGross: ex, systemGross: sys, diff, diffPct, excelEntries: exEntries, systemEntries: sysEntries });
      }

      result.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
      setRows(result);
      setDateRange({ min: minDate, max: maxDate });
      setTotalExcelEntries(totalExcel);
      setTotalSystemEntries(totalSystem);
      setExcelDetails(excelDetailMap);
      setSystemDetails(systemDetailMap);
      setSystemRawRecords(rawRecordsMap);
      setLoading(false);
    };

    run();
  }, [file]);

  const [validations, setValidations] = useState<Record<string, "excel" | "system">>({});
  const [saving, setSaving] = useState(false);

  const validate = (creator: string, source: "excel" | "system") => {
    setValidations((prev) => ({ ...prev, [creator]: source }));
  };

  const toggleExpand = (creator: string, source: "excel" | "system") => {
    setExpanded((prev) => ({
      ...prev,
      [creator]: prev[creator] === source ? null : source,
    }));
  };

  const saveAuditLog = async () => {
    const entries = Object.entries(validations);
    if (entries.length === 0) {
      toast({ title: "No hay validaciones", description: "Selecciona al menos una fuente antes de guardar.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    const inserts = entries.map(([creator, source]) => {
      const row = rows.find((r) => r.creator === creator);
      return {
        creator_name: creator,
        source_selected: source,
        excel_amount: row?.excelGross || 0,
        system_amount: row?.systemGross || 0,
        difference: row?.diff || 0,
        excel_entries: row?.excelEntries || 0,
        system_entries: row?.systemEntries || 0,
        file_name: file.name,
        period_start: dateRange?.min,
        period_end: dateRange?.max,
        created_by: user?.id,
      };
    });

    const { error } = await supabase.from("sales_audit_log").insert(inserts as any);
    setSaving(false);

    if (error) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Auditoría guardada", description: `${entries.length} validaciones registradas.` });
    }
  };

  const applyCorrections = async () => {
    const excelValidations = Object.entries(validations).filter(([, src]) => src === "excel");
    if (excelValidations.length === 0) {
      toast({ title: "Sin correcciones", description: "Solo se aplican correcciones cuando seleccionas Excel como fuente correcta.", variant: "destructive" });
      return;
    }

    setApplying(true);
    const { data: { user } } = await supabase.auth.getUser();

    // First save the audit log with status 'applied'
    const logInserts = excelValidations.map(([creator]) => {
      const row = rows.find((r) => r.creator === creator);
      return {
        creator_name: creator,
        source_selected: "excel" as const,
        excel_amount: row?.excelGross || 0,
        system_amount: row?.systemGross || 0,
        difference: row?.diff || 0,
        excel_entries: row?.excelEntries || 0,
        system_entries: row?.systemEntries || 0,
        file_name: file.name,
        period_start: dateRange?.min,
        period_end: dateRange?.max,
        created_by: user?.id,
        status: "applied",
      };
    });

    const { data: logData, error: logError } = await supabase
      .from("sales_audit_log")
      .insert(logInserts as any)
      .select("id, creator_name");

    if (logError) {
      toast({ title: "Error al guardar log", description: logError.message, variant: "destructive" });
      setApplying(false);
      return;
    }

    const logMap = new Map((logData || []).map((l: any) => [l.creator_name, l.id]));

    // For each creator validated as "excel", get the excel daily data and match/update system records
    let correctionCount = 0;
    let errorCount = 0;

    for (const [creator] of excelValidations) {
      const excelEntries = excelDetails.get(creator) || [];
      const rawRecords = systemRawRecords.get(creator) || [];
      const auditLogId = logMap.get(creator);

      // Build a map of excel entries by date
      const excelByDate = new Map<string, number>();
      for (const e of excelEntries) {
        excelByDate.set(e.date, (excelByDate.get(e.date) || 0) + e.amount);
      }

      // Update system records that have matching dates
      for (const rec of rawRecords) {
        const dateKey = rec.date.slice(0, 10);
        const excelAmount = excelByDate.get(dateKey);
        if (excelAmount !== undefined && Math.abs(excelAmount - rec.amount) > 0.01) {
          // Backup original value
          const { error: backupErr } = await supabase.from("sales_audit_corrections").insert({
            audit_log_id: auditLogId,
            of_earnings_id: rec.id,
            creator_name: creator,
            earnings_date: rec.date,
            original_value: rec.amount,
            new_value: excelAmount,
            source: "excel",
            applied_by: user?.id,
          } as any);

          if (backupErr) { errorCount++; continue; }

          // Update the actual record
          const { error: updateErr } = await supabase
            .from("of_gross_earnings")
            .update({ total_earnings_gross: excelAmount } as any)
            .eq("id", rec.id);

          if (updateErr) { errorCount++; } else { correctionCount++; }
        }
      }
    }

    setApplying(false);

    // Invalidate all sales-related caches so corrections propagate to all modules
    queryClient.invalidateQueries({ queryKey: ["of_gross_earnings_performance"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard2"] });

    if (errorCount > 0) {
      toast({ title: "Correcciones parciales", description: `${correctionCount} aplicadas, ${errorCount} errores.`, variant: "destructive" });
    } else {
      toast({ title: "Correcciones aplicadas", description: `${correctionCount} registros actualizados. Los cambios se reflejarán en todos los reportes de ventas.` });
    }
  };

  const summary = useMemo(() => {
    const totalExcel = rows.reduce((s, r) => s + r.excelGross, 0);
    const totalSystem = rows.reduce((s, r) => s + r.systemGross, 0);
    const matchCount = rows.filter((r) => Math.abs(r.diff) <= 1).length;
    const diffCount = rows.filter((r) => Math.abs(r.diff) > 1).length;
    return { totalExcel, totalSystem, matchCount, diffCount };
  }, [rows]);

  const exportAudit = () => {
    const exportData = rows.map((r) => ({
      Creadora: r.creator,
      "Entradas Excel": r.excelEntries,
      "Entradas Sistema": r.systemEntries,
      "Total Excel": r.excelGross.toFixed(2),
      "Total Sistema": r.systemGross.toFixed(2),
      "Diferencia ($)": r.diff.toFixed(2),
      "Diferencia (%)": r.diffPct.toFixed(1) + "%",
      Estado: Math.abs(r.diff) <= 1 ? "OK" : "Diferencia",
      "Valor Final": validations[r.creator] === "excel" ? "Excel" : validations[r.creator] === "system" ? "Sistema" : "Sin decidir",
      "Monto Final": validations[r.creator] === "excel" ? r.excelGross.toFixed(2) : validations[r.creator] === "system" ? r.systemGross.toFixed(2) : "",
    }));

    const wbOut = XLSX.utils.book_new();
    const infoData = [
      ["Auditoría de Ventas"],
      ["Período:", dateRange ? `${dateRange.min} al ${dateRange.max}` : "N/A"],
      ["Archivo:", file.name],
      ["Entradas Excel:", totalExcelEntries],
      ["Entradas Sistema:", totalSystemEntries],
      ["Generado:", new Date().toLocaleString("es-MX")],
      [],
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
    XLSX.utils.sheet_add_json(wsInfo, exportData, { origin: "A8" });
    XLSX.utils.book_append_sheet(wbOut, wsInfo, "Auditoría");
    XLSX.writeFile(wbOut, "auditoria_ventas.xlsx");
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Procesando archivo y comparando con base de datos...</div>;
  }

  const dateLabel = dateRange
    ? `${new Date(dateRange.min + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })} — ${new Date(dateRange.max + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}`
    : "";

  return (
    <div className="space-y-6">
      <AuditSummaryCards {...summary} />

      <AuditEntriesInfo
        totalExcelEntries={totalExcelEntries}
        totalSystemEntries={totalSystemEntries}
        dateLabel={dateLabel}
        dateRange={dateRange}
      />

      <div className="flex justify-end gap-2">
        <Button
          variant="default"
          onClick={applyCorrections}
          disabled={applying || Object.values(validations).filter(v => v === "excel").length === 0}
          className="gap-2"
        >
          <Zap className="h-4 w-4" />
          {applying ? "Aplicando..." : "Aplicar Correcciones"}
        </Button>
        <Button variant="outline" onClick={saveAuditLog} disabled={saving || Object.keys(validations).length === 0} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Guardando..." : "Guardar Auditoría"}
        </Button>
        <Button variant="outline" onClick={exportAudit} className="gap-2">
          <FileDown className="h-4 w-4" />
          Exportar Auditoría
        </Button>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Creadora</TableHead>
              <TableHead className="text-center">Entradas Excel</TableHead>
              <TableHead className="text-center">Entradas Sistema</TableHead>
              <TableHead className="text-right">Excel (Gross)</TableHead>
              <TableHead className="text-right">Sistema (Gross)</TableHead>
              <TableHead className="text-right">Diferencia ($)</TableHead>
              <TableHead className="text-right">Diferencia (%)</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-center">Validar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const isOk = Math.abs(r.diff) <= 1;
              const val = validations[r.creator];
              const entriesMismatch = r.excelEntries !== r.systemEntries;
              const expandedSource = expanded[r.creator];
              return (
                <>
                  <TableRow key={r.creator} className={val ? "bg-emerald-500/5" : ""}>
                    <TableCell className="font-medium capitalize">{r.creator}</TableCell>
                    <TableCell className={`text-center ${entriesMismatch ? "text-amber-500 font-medium" : ""}`}>
                      <button
                        className="underline decoration-dotted underline-offset-4 hover:text-primary transition-colors cursor-pointer"
                        onClick={() => toggleExpand(r.creator, "excel")}
                      >
                        {r.excelEntries}
                      </button>
                    </TableCell>
                    <TableCell className={`text-center ${entriesMismatch ? "text-amber-500 font-medium" : ""}`}>
                      <button
                        className="underline decoration-dotted underline-offset-4 hover:text-primary transition-colors cursor-pointer"
                        onClick={() => toggleExpand(r.creator, "system")}
                      >
                        {r.systemEntries}
                      </button>
                    </TableCell>
                    <TableCell className={`text-right ${val === "excel" ? "font-bold text-emerald-500" : ""}`}>
                      ${r.excelGross.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className={`text-right ${val === "system" ? "font-bold text-emerald-500" : ""}`}>
                      ${r.systemGross.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className={`text-right ${!isOk ? "text-destructive font-medium" : ""}`}>
                      ${r.diff.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className={`text-right ${!isOk ? "text-destructive" : ""}`}>
                      {r.diffPct.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-center">
                      {isOk ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">OK</Badge>
                      ) : entriesMismatch ? (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">Faltan datos</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Diferencia</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {val ? (
                        <div className="flex items-center justify-center gap-1">
                          <CheckCircle className="h-4 w-4 text-emerald-500" />
                          <span className="text-xs text-emerald-500 capitalize">{val === "excel" ? "Excel" : "Sistema"}</span>
                        </div>
                      ) : !isOk ? (
                        <div className="flex gap-1 justify-center">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => validate(r.creator, "excel")}>
                            Excel
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => validate(r.creator, "system")}>
                            Sistema
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                  {expandedSource && (
                    <TableRow key={`${r.creator}-detail`}>
                      <TableCell colSpan={9} className="p-0 bg-muted/30">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-x">
                          <AuditEntryDetail
                            creator={r.creator}
                            source="excel"
                            entries={excelDetails.get(r.creator) || []}
                          />
                          <AuditEntryDetail
                            creator={r.creator}
                            source="system"
                            entries={systemDetails.get(r.creator) || []}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AuditComparisonTable;
