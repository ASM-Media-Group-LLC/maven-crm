import type { Expediente } from "@/hooks/useExpedienteEmpleado";

/** Solo exporta el expediente ya autorizado y cargado. No consulta personas adicionales. */
export async function exportarExpediente(expediente: Expediente, mes: string, idioma: string) {
  const [{ jsPDF: JsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const es = idioma === "es";
  const pdf = new JsPDF();
  pdf.setFontSize(18);
  pdf.text("Maven · Argos", 14, 20);
  pdf.setFontSize(11);
  pdf.text(pdf.splitTextToSize(expediente.nombre, 180), 14, 30);
  pdf.text(`${es ? "Expediente mensual" : "Monthly record"}: ${mes}`, 14, 46);
  autoTable(pdf, {
    startY: 54,
    head: [[es ? "Día" : "Day", es ? "Horas" : "Hours", es ? "Nota" : "Score", es ? "Eventos registrados" : "Recorded events", es ? "Pausa excedida (min)" : "Excess break (min)"]],
    body: [...expediente.dias.values()].sort((a,b) => a.fecha.localeCompare(b.fecha)).map(d => [
      d.fecha, d.horas.toFixed(2), d.nota.valor == null ? "—" : String(d.nota.valor), String(d.faltas.length), String(Math.round(d.minutosPausaDeMas)),
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [25, 38, 58] },
    margin: { bottom: 25 },
    didDrawPage: () => {
      pdf.setFontSize(8);
      pdf.text(es ? "Los eventos y las notas requieren revisión humana." : "Events and scores require human review.", 14, 286);
    },
  });
  pdf.save(`Maven-Argos-${mes}.pdf`);
}
