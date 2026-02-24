import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface PeriodData {
  period_name: string;
  start_date: string;
  end_date: string;
  total_employees: number;
  gross_total: number;
  net_total: number;
  status: string;
  cost_center?: string;
}

export function generatePayrollPdf(period: PeriodData, details: any[] = []) {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("Recibo de Nómina", 14, 22);

  doc.setFontSize(10);
  doc.text(`Periodo: ${period.period_name}`, 14, 32);
  doc.text(`Rango: ${period.start_date} — ${period.end_date}`, 14, 38);
  doc.text(`Empleados: ${period.total_employees}`, 14, 44);
  doc.text(`Centro de Costo: ${period.cost_center || "—"}`, 14, 50);
  doc.text(`Estado: ${period.status}`, 14, 56);

  doc.setFontSize(12);
  doc.text("Resumen", 14, 68);

  autoTable(doc, {
    startY: 72,
    head: [["Concepto", "Monto"]],
    body: [
      ["Total Bruto", `$${Number(period.gross_total || 0).toLocaleString()}`],
      ["Total Neto", `$${Number(period.net_total || 0).toLocaleString()}`],
    ],
    theme: "grid",
    headStyles: { fillColor: [41, 41, 41] },
  });

  if (details.length > 0) {
    const finalY = (doc as any).lastAutoTable?.finalY || 100;
    doc.text("Desglose por Empleado", 14, finalY + 10);
    autoTable(doc, {
      startY: finalY + 14,
      head: [["Empleado", "Base", "Horas Extra", "Comisión", "Deducciones", "Neto"]],
      body: details.map(d => {
        const empName = d.employees ? `${d.employees.first_name} ${d.employees.last_name}` : d.employee_id;
        return [
          empName,
          `$${Number(d.base_amount || 0).toLocaleString()}`,
          `$${Number(d.overtime_amount || 0).toLocaleString()}`,
          `$${Number(d.commission_amount || 0).toLocaleString()}`,
          `$${Number(d.deductions || 0).toLocaleString()}`,
          `$${Number(d.net_amount || 0).toLocaleString()}`,
        ];
      }),
      theme: "grid",
      headStyles: { fillColor: [41, 41, 41] },
      styles: { fontSize: 8 },
    });
  }

  doc.save(`recibo-nomina-${period.period_name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}

export function generateBankFile(period: PeriodData, details: any[]) {
  const rows = details.map(d => {
    const empName = d.employees ? `${d.employees.first_name} ${d.employees.last_name}` : "Empleado";
    return `${empName},${d.bank_account || ""},${Number(d.net_amount || 0)}`;
  });
  const csv = ["Nombre,Cuenta,Monto Neto", ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `archivo-bancario-${period.period_name.replace(/\s+/g, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
