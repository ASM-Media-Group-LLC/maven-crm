import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface SettlementData {
  employeeName: string;
  hireDate: string;
  terminationDate: string;
  baseSalary: number;
  vacationDaysPending: number;
  vacationAmount: number;
  hourBankBalance: number;
  hourValue: number;
  hourBankAmount: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) => {
  if (!d) return "—";
  const date = new Date(d + "T12:00:00");
  return date.toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" });
};

export function generateSettlementPdf(data: SettlementData) {
  const doc = new jsPDF();
  const totalSettlement = data.baseSalary + data.vacationAmount + data.hourBankAmount;

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 35, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Maven CRM", 14, 16);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Liquidación Proyectada", 14, 24);
  doc.setFontSize(8);
  doc.text(`Generado: ${new Date().toLocaleDateString("es-CO")}`, 160, 16);

  // Employee info
  let y = 45;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Información del Empleado", 14, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const infoRows = [
    ["Nombre", data.employeeName],
    ["Fecha de Ingreso", fmtDate(data.hireDate)],
    ["Fecha de Terminación", fmtDate(data.terminationDate)],
    ["Salario Base", fmt(data.baseSalary)],
  ];
  infoRows.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, 70, y);
    y += 7;
  });

  // Settlement table
  y += 8;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Desglose de Liquidación", 14, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [["Concepto", "Detalle", "Monto"]],
    body: [
      ["Salario Base Pendiente", "Último periodo", fmt(data.baseSalary)],
      ["Vacaciones Pendientes", `${data.vacationDaysPending.toFixed(1)} días`, fmt(data.vacationAmount)],
      ["Banco de Horas", `${data.hourBankBalance}h × ${fmt(data.hourValue)}/h`, fmt(data.hourBankAmount)],
    ],
    foot: [["", "TOTAL LIQUIDACIÓN PROYECTADA", fmt(totalSettlement)]],
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold", fontSize: 11 },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: { 2: { halign: "right" } },
  });

  // Disclaimer
  const finalY = (doc as any).lastAutoTable?.finalY || y + 60;
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("* Este documento es una proyección estimada y no constituye un compromiso de pago definitivo.", 14, finalY + 12);
  doc.text("Los montos finales están sujetos a verificación por el departamento de RRHH y Finanzas.", 14, finalY + 18);

  doc.save(`Liquidacion_${data.employeeName.replace(/\s+/g, "_")}.pdf`);
}
