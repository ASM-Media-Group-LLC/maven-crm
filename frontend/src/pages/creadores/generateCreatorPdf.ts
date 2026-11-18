import { formatUI } from "@/lib/formatoHora";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

const priceLabels: Record<string, string> = {
  cat1: "Contenido X",
  cat2: "Contenido XX",
  cat3: "Contenido XXX",
  cat4: "Backdoor",
  custom: "Contenido Personalizado",
  drating: "D-Rating",
  videocalls: "Videollamadas",
  underwear: "Venta de Ropa Interior",
};

function parseCsv(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function parsePricing(raw: unknown): { service: string; price: number; notes: string }[] {
  if (!raw || typeof raw !== "object") return [];
  const entries = Object.entries(raw as Record<string, { price?: number; notes?: string }>);
  return entries
    .filter(([, v]) => v && typeof v.price === "number" && v.price > 0)
    .map(([key, v]) => ({
      service: priceLabels[key] ?? key,
      price: v.price!,
      notes: v.notes ?? "",
    }));
}

interface CreatorForPdf {
  name: string;
  artistic_name?: string | null;
  tono_voz?: string | null;
  apodos_permitidos?: string | null;
  palabras_prohibidas?: string | null;
  contenido_jamas_haria?: string | null;
  hobbies?: string | null;
  mascotas_nombres?: string | null;
  comida_favorita?: string | null;
  precios_contenido?: unknown;
}

export function generateCreatorPdf(creator: CreatorForPdf) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = 20;

  // --- Header ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Maven CRM", margin, y);

  doc.setFontSize(14);
  doc.text("Ficha Técnica", pw / 2, y, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(formatUI(new Date(), "dd/MM/yyyy HH:mm"), pw - margin, y, { align: "right" });

  y += 4;
  doc.setDrawColor(180);
  doc.line(margin, y, pw - margin, y);
  y += 10;

  // --- Section 1: Perfil ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(creator.artistic_name || creator.name, margin, y);
  y += 7;

  if (creator.artistic_name) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(creator.name, margin, y);
    y += 10;
  } else {
    y += 3;
  }

  // --- Section 2: Estilo de Chat ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Estilo de Chat", margin, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  doc.setFont("helvetica", "bold");
  doc.text("Tono de voz:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(creator.tono_voz || "Sin configurar", margin + 28, y);
  y += 6;

  const apodos = parseCsv(creator.apodos_permitidos);
  doc.setFont("helvetica", "bold");
  doc.text("Apodos permitidos:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(apodos.length > 0 ? apodos.join(", ") : "Sin configurar", margin + 40, y);
  y += 6;

  const prohibidas = parseCsv(creator.palabras_prohibidas);
  doc.setFont("helvetica", "bold");
  doc.text("Palabras prohibidas:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(prohibidas.length > 0 ? prohibidas.join(", ") : "Sin configurar", margin + 42, y);
  y += 10;

  // --- Section 3: Muro de Contención ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Muro de Contención — JAMÁS haría:", margin, y);
  y += 2;

  const muroText = creator.contenido_jamas_haria || "Sin configurar";
  const muroLines = doc.splitTextToSize(muroText, pw - margin * 2 - 8);
  const muroH = muroLines.length * 5 + 8;

  doc.setDrawColor(220, 50, 50);
  doc.setLineWidth(0.8);
  doc.roundedRect(margin, y, pw - margin * 2, muroH, 2, 2);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(muroLines, margin + 4, y);
  y += muroH + 4;

  // --- Section 4: Ganchos de Conversación ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Ganchos de Conversación", margin, y);
  y += 7;

  doc.setFontSize(10);
  const hooks = [
    { label: "Hobbies", value: creator.hobbies },
    { label: "Mascotas", value: creator.mascotas_nombres },
    { label: "Comida favorita", value: creator.comida_favorita },
  ];
  for (const h of hooks) {
    doc.setFont("helvetica", "bold");
    doc.text(`${h.label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(h.value || "Sin configurar", margin + 30, y);
    y += 6;
  }
  y += 4;

  // --- Section 5: Resumen Comercial ---
  const pricing = parsePricing(creator.precios_contenido);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Resumen Comercial", margin, y);
  y += 4;

  if (pricing.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Servicio", "Precio", "Notas"]],
      body: pricing.map((p) => [p.service, `$${p.price}`, p.notes || "—"]),
      theme: "grid",
      headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: { 1: { halign: "right" } },
    });
  } else {
    y += 6;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.text("Sin precios configurados", margin, y);
  }

  // --- Save ---
  const safeName = (creator.artistic_name || creator.name).replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Ficha_Tecnica_${safeName}.pdf`);
}
