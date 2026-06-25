import { Users, Sparkles, TrendingUp, Loader, Inbox, TrendingDown } from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";
import type { ContactFunnelStats } from "./useContactFunnelStats";

export type ContactKpiKey = "pipeline" | "creadoras" | "conversion" | "proceso" | "sinTocar" | "churn";

interface Props {
  stats: ContactFunnelStats;
  onClick?: (key: ContactKpiKey) => void;
}

// Dashboard de Contactos — 6 KPIs honestos sobre el PIPELINE VIVO (sin los ~1.7k
// imports muertos de Kash que contaminaban el viejo "Total Contactos"). Cada card
// abre la lista clickeable (popup) con los contactos detrás del número, server-side.
//   1 Pipeline vivo · 2 Creadoras (vía pipeline) · 3 Conversión
//   4 En proceso (WIP) · 5 Sin tocar (pool) · 6 Se están yendo (churn)
const ContactosKPICards = ({ stats, onClick }: Props) => {
  const churn = stats.churnLeaving + stats.churnTerminated;
  const convPct = stats.pipelineVivo > 0
    ? (stats.creadoras / stats.pipelineVivo) * 100
    : 0;

  const cards = [
    {
      key: "pipeline" as const,
      label: "Pipeline vivo",
      value: stats.pipelineVivo.toLocaleString("es"),
      subtitle: `+${stats.importMuerto.toLocaleString("es")} importados históricos (no trabajables)`,
      icon: Users,
      color: "bg-blue-500",
    },
    {
      key: "creadoras" as const,
      label: "Creadoras (vía pipeline)",
      value: stats.creadoras.toLocaleString("es"),
      subtitle: `${stats.activasHoy} activas hoy en el roster`,
      icon: Sparkles,
      color: "bg-emerald-500",
    },
    {
      key: "conversion" as const,
      label: "Tasa de conversión",
      value: `${convPct.toFixed(1)}%`,
      subtitle: `${stats.creadoras} de ${stats.pipelineVivo.toLocaleString("es")} del pipeline`,
      icon: TrendingUp,
      color: "bg-violet-500",
    },
    {
      key: "proceso" as const,
      label: "En proceso",
      value: stats.enProceso.toLocaleString("es"),
      subtitle: "Con closer asignado o ya contactados",
      icon: Loader,
      color: "bg-amber-500",
    },
    {
      key: "sinTocar" as const,
      label: "Sin tocar",
      value: stats.sinTocar.toLocaleString("es"),
      subtitle: "Pool vivo para repartir",
      icon: Inbox,
      color: "bg-sky-500",
    },
    {
      key: "churn" as const,
      label: "Se están yendo",
      value: churn.toLocaleString("es"),
      subtitle: `${stats.churnLeaving} saliendo · ${stats.churnTerminated} baja`,
      icon: TrendingDown,
      color: "bg-rose-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <KpiCard
          key={card.key}
          label={card.label}
          value={card.value}
          subtitle={card.subtitle}
          icon={card.icon}
          color={card.color}
          onClick={onClick ? () => onClick(card.key) : undefined}
        />
      ))}
    </div>
  );
};

export default ContactosKPICards;
