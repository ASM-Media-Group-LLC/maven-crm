import * as XLSX from "xlsx";

export function generateReport(data: any[], reportType: string, formatType: "csv" | "excel") {
  if (data.length === 0) return;

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, reportType);

  if (formatType === "excel") {
    XLSX.writeFile(wb, `reporte-${reportType}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } else {
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-${reportType}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export function exportTableToExcel(data: any[], filename: string) {
  if (data.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Datos");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
