import { useMemo, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

// REPORTE DE HORAS mensual en PDF (Alvaro, 06/11). "Un PDF con el desglose de
// horas de todo octubre, lo que la gente cliqueó, ir al baño, todo". Un PDF
// solo con TODA la gente: una sección por persona con tabla resumen arriba
// (totales de estados + breaks) y timeline por día abajo.
//
// Datos: RPC reporte_horas_mes(_desde, _hasta) → jsonb con una entrada por
// persona. El PDF se genera client-side con jspdf + autotable.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { rpc: (f: string, a: unknown) => Promise<{ data: any; error: { message: string } | null }> };

type EstadoSeg = Record<string, number | undefined>;
type DiaData = { dia: string; estados: EstadoSeg | null; breaks: EstadoSeg | null };
interface Persona {
  user_id: string;
  full_name: string | null;
  nivel: string | null;
  role: string | null;
  totales_estado: EstadoSeg | null;
  totales_breaks: EstadoSeg | null;
  dias: DiaData[] | null;
}
interface Reporte {
  desde: string;
  hasta: string;
  generado_at: string;
  tz: string;
  personas: Persona[];
}

const MESES_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const LABEL_ESTADO: Record<string, string> = {
  activo: "Atendiendo",
  pausa: "Pausa",
  sin_camara: "Sin cámara",
  sin_pantalla: "Sin pantalla",
  fuera_de_camara: "Fuera de cámara",
  sin_conexion: "Sin conexión",
  sin_conexion_larga: "Sin conexión (larga)",
};
const LABEL_BREAK: Record<string, string> = {
  bano: "Baño",
  break: "Descanso",
  almuerzo: "Almuerzo",
};
const ORDEN_ESTADOS = ["activo", "pausa", "fuera_de_camara", "sin_camara", "sin_pantalla", "sin_conexion", "sin_conexion_larga"];
const ORDEN_BREAKS = ["bano", "break", "almuerzo"];

function hhmm(seg: number | undefined | null): string {
  const s = Math.max(0, Math.round(Number(seg) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
function diaCorto(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function rangoMes(anio: number, mes: number): { desde: string; hasta: string } {
  const desde = new Date(Date.UTC(anio, mes - 1, 1));
  const hasta = new Date(Date.UTC(anio, mes, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { desde: iso(desde), hasta: iso(hasta) };
}

function generarPdf(rep: Reporte, nombreMes: string, anio: number): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Portada
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Reporte de horas", 14, 20);
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text(`${nombreMes} ${anio}`, 14, 28);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Generado: ${new Date(rep.generado_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}  ·  ${rep.personas.length} persona(s)`, 14, 34);
  doc.setTextColor(0);

  // Resumen general (todas las personas)
  autoTable(doc, {
    startY: 42,
    head: [["Persona", "Rol", ...ORDEN_ESTADOS.map((e) => LABEL_ESTADO[e]), ...ORDEN_BREAKS.map((b) => LABEL_BREAK[b])]],
    body: rep.personas.map((p) => [
      p.full_name ?? "—",
      p.role ?? "—",
      ...ORDEN_ESTADOS.map((e) => hhmm(p.totales_estado?.[e])),
      ...ORDEN_BREAKS.map((b) => hhmm(p.totales_breaks?.[b])),
    ]),
    headStyles: { fillColor: [45, 45, 70], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    styles: { cellPadding: 1.5 },
    margin: { left: 8, right: 8 },
  });

  // Sección por persona
  for (const p of rep.personas) {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(p.full_name ?? "Sin nombre", 14, 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(`${p.role ?? "Sin rol"}  ·  nivel ${p.nivel ?? "—"}`, 14, 24);
    doc.setTextColor(0);

    // Totales del mes
    autoTable(doc, {
      startY: 30,
      head: [["Totales del mes", "Horas"]],
      body: [
        ...ORDEN_ESTADOS.filter((e) => (p.totales_estado?.[e] ?? 0) > 0).map((e) => [LABEL_ESTADO[e], hhmm(p.totales_estado?.[e])]),
        ...ORDEN_BREAKS.filter((b) => (p.totales_breaks?.[b] ?? 0) > 0).map((b) => [LABEL_BREAK[b], hhmm(p.totales_breaks?.[b])]),
      ],
      headStyles: { fillColor: [45, 45, 70], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: 14, right: 14 },
    });

    // Timeline por día
    const dias = (p.dias ?? []).slice();
    if (dias.length === 0) {
      doc.text("Sin actividad registrada.", 14, (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ? ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8) : 60);
      continue;
    }
    autoTable(doc, {
      startY: ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60) + 6,
      head: [["Día", ...ORDEN_ESTADOS.map((e) => LABEL_ESTADO[e]), ...ORDEN_BREAKS.map((b) => LABEL_BREAK[b])]],
      body: dias.map((d) => [
        diaCorto(d.dia),
        ...ORDEN_ESTADOS.map((e) => hhmm(d.estados?.[e])),
        ...ORDEN_BREAKS.map((b) => hhmm(d.breaks?.[b])),
      ]),
      headStyles: { fillColor: [80, 80, 120], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      styles: { cellPadding: 1.2 },
      margin: { left: 8, right: 8 },
    });
  }

  // Pie
  const total = doc.internal.pages.length - 1;
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Maven · ${nombreMes} ${anio} · ${i}/${total}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 6, { align: "right" });
  }

  return doc.output("blob");
}

export default function ReporteHorasPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getMonth() === 0 ? hoy.getFullYear() - 1 : hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() === 0 ? 12 : hoy.getMonth()); // por default, el mes anterior
  const [cargando, setCargando] = useState(false);

  const nombreMes = useMemo(() => MESES_ES[mes - 1] ?? "", [mes]);

  const generar = async () => {
    setCargando(true);
    try {
      const { desde, hasta } = rangoMes(anio, mes);
      const { data, error } = await sinTipar.rpc("reporte_horas_mes", { _desde: desde, _hasta: hasta });
      if (error) throw new Error(error.message);
      const rep = data as Reporte;
      if (!rep?.personas?.length) {
        toast({ title: t("admin.reporte.sinDatos"), description: t("admin.reporte.sinDatosDetalle", { mes: nombreMes, anio }), variant: "destructive" });
        return;
      }
      const blob = generarPdf(rep, nombreMes, anio);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `maven-horas-${anio}-${String(mes).padStart(2, "0")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: t("admin.reporte.listo"), description: t("admin.reporte.listoDetalle", { n: rep.personas.length }) });
    } catch (e) {
      toast({ title: t("admin.reporte.error"), description: (e as Error).message, variant: "destructive" });
    } finally {
      setCargando(false);
    }
  };

  const anios: number[] = [];
  for (let a = hoy.getFullYear(); a >= hoy.getFullYear() - 2; a--) anios.push(a);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-24 md:p-6 space-y-5">
      <PageHeader icon={<FileText className="h-5 w-5" />} title={t("admin.reporte.titulo")} subtitle={t("admin.reporte.sub")} />

      <div className="vidrio p-5">
        <div className="v-cont flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">{t("admin.reporte.mes")}</label>
              <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className="rounded-control border border-border/60 bg-card/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40">
                {MESES_ES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">{t("admin.reporte.anio")}</label>
              <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="rounded-control border border-border/60 bg-card/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40">
                {anios.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <Button size="lg" className="rounded-control gap-2" onClick={() => void generar()} disabled={cargando}>
              {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {t("admin.reporte.bajar")}
            </Button>
          </div>
          <p className="text-[12px] text-muted-foreground">{t("admin.reporte.ayuda")}</p>
        </div>
      </div>
    </div>
  );
}
