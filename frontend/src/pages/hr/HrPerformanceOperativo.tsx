import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, Headphones, Megaphone, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHubstaffSyncStatus } from "@/pages/agency-qa/chatters-qa/useHubstaffEffort";
import { useHrRoster } from "./useHrPeople";
import { useChatterPerf, useCloserPerf, useLlgPerf, useManagerPerf } from "./useHrPerformance";

// Performance OPERATIVO de RRHH: leaderboard por rol con resultado real (ventas/ROI, cierres,
// leads, esfuerzo) desde las vistas de Hubstaff/BLU. Distinto del QA por rol: acá es la vista
// consolidada de RRHH. Filas linkean a la ficha de la persona.

type RoleTab = "chatters" | "closers" | "llg" | "managers";
const TABS: { key: RoleTab; label: string; icon: any }[] = [
  { key: "chatters", label: "Chatters", icon: MessageCircle },
  { key: "closers", label: "Closers", icon: Headphones },
  { key: "llg", label: "LLG", icon: Megaphone },
  { key: "managers", label: "Managers", icon: Briefcase },
];

const usd = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(n).toLocaleString("es-CO")}`);
const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n)}%`);

const relativeTime = (iso: string | null): string => {
  if (!iso) return "sin sincronizar";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h}h` : `hace ${Math.floor(h / 24)}d`;
};

export default function HrPerformanceOperativo() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<RoleTab>("chatters");
  const { data: sync } = useHubstaffSyncStatus();
  const { data: roster = [] } = useHrRoster();

  const chatter = useChatterPerf();
  const closer = useCloserPerf();
  const llg = useLlgPerf();
  const manager = useManagerPerf();

  // name (lower) → profile_id para linkear a la ficha.
  const idByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roster) if (r.name) m.set(r.name.toLowerCase(), r.profile_id);
    return m;
  }, [roster]);
  const goTo = (name: string, profileId?: string | null) => {
    const pid = profileId ?? idByName.get(name.toLowerCase());
    if (pid) navigate(`/hr/persona/${pid}`);
  };

  const loading = chatter.isLoading || closer.isLoading || llg.isLoading || manager.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60"}`}>
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-muted-foreground">Sincronizado {relativeTime(sync?.last_sync_at ?? null)}</span>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              {tab === "chatters" && (
                <table className="w-full min-w-[720px] text-sm">
                  <Thead cols={["Chatter", "Horas", "Activ.", "Ventas", "Ingreso ag.", "Costo", "Margen", "ROI", ""]} />
                  <tbody>
                    {chatter.data?.map((r) => (
                      <Row key={r.blu_employee_id} onClick={() => goTo(r.name)}>
                        <Td className="font-medium pl-4">{r.name}</Td>
                        <Td num>{r.total_hours}h</Td>
                        <Td num>{pct(r.avg_activity_pct)}</Td>
                        <Td num>{usd(r.sales)}</Td>
                        <Td num>{usd(r.agency_revenue_usd)}</Td>
                        <Td num>{usd(r.cost_usd)}</Td>
                        <Td num cls={(r.margin_usd ?? 0) >= 0 ? "text-success" : "text-destructive"}>{usd(r.margin_usd)}</Td>
                        <Td num cls={(r.roi_x ?? 0) >= 1 ? "text-success" : "text-destructive"}>{r.roi_x != null ? `${r.roi_x}x` : "—"}</Td>
                        <Td>{r.no_rentable ? <Pill tone="bad">no rentable</Pill> : r.sin_venta_blu ? <Pill tone="muted">sin venta BLU</Pill> : <Pill tone="ok">rentable</Pill>}</Td>
                      </Row>
                    ))}
                    {!chatter.data?.length && <Empty cols={9} />}
                  </tbody>
                </table>
              )}

              {tab === "closers" && (
                <table className="w-full min-w-[680px] text-sm">
                  <Thead cols={["Closer", "Horas", "Activ.", "Leads", "Cerradas", "Monetización", "USD/h", "QA", ""]} />
                  <tbody>
                    {closer.data?.map((r) => (
                      <Row key={r.name} onClick={() => goTo(r.name)}>
                        <Td className="font-medium pl-4">{r.name}</Td>
                        <Td num>{r.total_hours}h</Td>
                        <Td num>{pct(r.avg_activity_pct)}</Td>
                        <Td num>{r.leads}</Td>
                        <Td num>{r.cerradas}</Td>
                        <Td num>{usd(r.monetizacion_usd)}</Td>
                        <Td num>{usd(r.usd_por_hora)}</Td>
                        <Td num>{r.avg_qa_score != null ? `${r.avg_qa_score}` : "—"}</Td>
                        <Td>{r.sin_cierres ? <Pill tone="bad">sin cierres</Pill> : <Pill tone="ok">activo</Pill>}</Td>
                      </Row>
                    ))}
                    {!closer.data?.length && <Empty cols={9} />}
                  </tbody>
                </table>
              )}

              {tab === "llg" && (
                <table className="w-full min-w-[520px] text-sm">
                  <Thead cols={["LLG", "Horas", "Activ.", "Leads", "Leads/h"]} />
                  <tbody>
                    {llg.data?.map((r) => (
                      <Row key={r.name} onClick={() => goTo(r.name)}>
                        <Td className="font-medium pl-4">{r.name}</Td>
                        <Td num>{r.total_hours}h</Td>
                        <Td num>{pct(r.avg_activity_pct)}</Td>
                        <Td num>{r.leads}</Td>
                        <Td num>{r.leads_por_hora != null ? `${r.leads_por_hora}` : "—"}</Td>
                      </Row>
                    ))}
                    {!llg.data?.length && <Empty cols={5} />}
                  </tbody>
                </table>
              )}

              {tab === "managers" && (
                <table className="w-full min-w-[480px] text-sm">
                  <Thead cols={["Manager", "Días", "Horas", "Actividad"]} />
                  <tbody>
                    {manager.data?.map((r) => (
                      <Row key={r.profile_id ?? r.name} onClick={() => goTo(r.name, r.profile_id)}>
                        <Td className="font-medium pl-4">{r.name}</Td>
                        <Td num>{r.dias}</Td>
                        <Td num>{r.total_hours}h</Td>
                        <Td num>{pct(r.avg_activity_pct)}</Td>
                      </Row>
                    ))}
                    {!manager.data?.length && <Empty cols={4} />}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      <p className="px-1 text-[11px] text-muted-foreground">
        Resultado operativo del último período (Hubstaff + BLU). Click en una fila abre la ficha de la persona.
        El costo/ROI de chatters usa el costo modelado (salario base + comisión). Origen de datos = mismas vistas del QA por rol.
      </p>
    </div>
  );
}

function Thead({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="border-b border-border text-xs text-muted-foreground">
        {cols.map((c, i) => (
          <th key={i} className={`px-3 py-3 font-semibold ${i === 0 ? "text-left pl-4" : c === "" ? "text-left" : "text-right"}`}>{c}</th>
        ))}
      </tr>
    </thead>
  );
}
function Row({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return <tr onClick={onClick} className="cursor-pointer border-b border-border/60 hover:bg-muted/40">{children}</tr>;
}
function Td({ children, num, cls, className }: { children: React.ReactNode; num?: boolean; cls?: string; className?: string }) {
  return (
    <td className={cn("px-3 py-2.5", num && "text-right tabular-nums", num && !cls && "text-muted-foreground", cls, className)}>
      {children}
    </td>
  );
}
function Pill({ children, tone }: { children: React.ReactNode; tone: "ok" | "bad" | "muted" }) {
  const cls = tone === "ok" ? "bg-success/15 text-success" : tone === "bad" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}
function Empty({ cols }: { cols: number }) {
  return <tr><td colSpan={cols} className="py-10 text-center text-sm text-muted-foreground">Sin datos para este rol todavía.</td></tr>;
}
