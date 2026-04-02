import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarDays, CheckCircle, FileDown } from "lucide-react";
import AuditSummaryCards from "./AuditSummaryCards";

interface AuditRow {
  creator: string;
  excelGross: number;
  systemGross: number;
  diff: number;
  diffPct: number;
  validated?: "excel" | "system";
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

const AuditComparisonTable = ({ file }: Props) => {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<{ min: string; max: string } | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);

      // Parse Excel
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      // Group by creator
      const excelMap = new Map<string, number>();
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
      }

      // Query DB for same date range
      const { data: dbData } = await supabase
        .from("of_gross_earnings")
        .select("pending_creator, total_earnings_gross, date")
        .gte("date", minDate)
        .lte("date", maxDate + "T23:59:59");

      const systemMap = new Map<string, number>();
      for (const r of dbData || []) {
        const creator = (r.pending_creator || "").trim().toLowerCase();
        if (!creator) continue;
        systemMap.set(creator, (systemMap.get(creator) || 0) + (Number(r.total_earnings_gross) || 0));
      }

      // Merge
      const allCreators = new Set([...excelMap.keys(), ...systemMap.keys()]);
      const result: AuditRow[] = [];

      for (const c of allCreators) {
        const ex = excelMap.get(c) || 0;
        const sys = systemMap.get(c) || 0;
        const diff = ex - sys;
        const diffPct = sys !== 0 ? (diff / sys) * 100 : ex !== 0 ? 100 : 0;
        result.push({ creator: c, excelGross: ex, systemGross: sys, diff, diffPct });
      }

      result.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
      setRows(result);
      setDateRange({ min: minDate, max: maxDate });
      setLoading(false);
    };

    run();
  }, [file]);

  const [validations, setValidations] = useState<Record<string, "excel" | "system">>({});

  const validate = (creator: string, source: "excel" | "system") => {
    setValidations((prev) => ({ ...prev, [creator]: source }));
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
      "Total Excel": r.excelGross.toFixed(2),
      "Total Sistema": r.systemGross.toFixed(2),
      "Diferencia ($)": r.diff.toFixed(2),
      "Diferencia (%)": r.diffPct.toFixed(1) + "%",
      Estado: Math.abs(r.diff) <= 1 ? "OK" : "Diferencia",
      "Valor Final": validations[r.creator] === "excel" ? "Excel" : validations[r.creator] === "system" ? "Sistema" : "Sin decidir",
      "Monto Final": validations[r.creator] === "excel" ? r.excelGross.toFixed(2) : validations[r.creator] === "system" ? r.systemGross.toFixed(2) : "",
    }));

    const wb = XLSX.utils.book_new();

    // Header sheet with date info
    const infoData = [
      ["Auditoría de Ventas"],
      ["Período:", dateRange ? `${dateRange.min} al ${dateRange.max}` : "N/A"],
      ["Archivo:", file.name],
      ["Generado:", new Date().toLocaleString("es-MX")],
      [],
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(infoData);

    // Append data below the header
    XLSX.utils.sheet_add_json(wsInfo, exportData, { origin: "A6" });
    XLSX.utils.book_append_sheet(wb, wsInfo, "Auditoría");
    XLSX.writeFile(wb, "auditoria_ventas.xlsx");
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

      {dateRange && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-lg px-4 py-2 bg-card w-fit">
          <CalendarDays className="h-4 w-4" />
          <span>Período comparado: <strong className="text-foreground">{dateLabel}</strong></span>
        </div>
      )}

      <div className="flex justify-end">
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
              return (
                <TableRow key={r.creator} className={val ? "bg-emerald-500/5" : ""}>
                  <TableCell className="font-medium capitalize">{r.creator}</TableCell>
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
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AuditComparisonTable;
