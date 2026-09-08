// Tab "Managers" de Promolog (ex "Agentes", rediseño 08/09/26).
//
// Qué mide a una manager (definido con Jhon): (1) que SUS modelos promocionen y
// la calidad de esas promos, (2) cuánto las contacta por la línea de WhatsApp de
// Managers, (3) cuántos usuarios NUEVOS traen (BLU: fans nuevos y $ de subs
// nuevas). Todo por la manager ASIGNADA en la ficha de cada creadora y siempre
// sobre las activas. El rango es el global del header (Ayer/Hoy/Semana/Mes).
//
// Layout: UNA FILA por manager con un número grande por columna (las columnas
// alineadas son la comparación) + una línea de alertas en chips. Los nombres de
// creadoras viven en el drill-down (click en la fila), no amontonados en la card.
//
// Fuentes: promo_creator_period_scores (score 0-100 + promo-días),
// get_manager_contact_stats (último contacto + días con contacto en el rango;
// la línea es compartida → no se sabe quién tipeó) y get_manager_growth_stats
// (BLU del rango vs el mismo tramo anterior).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, differenceInCalendarDays } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronDown, ChevronUp, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/UserAvatar";
import { supabase } from "@/integrations/supabase/client";
import { useAssignableManagers } from "@/hooks/useAssignableManagers";
import { usePromoScoresRango, type PromoPeriodScore } from "./usePromoPeriodScores";
import { cn } from "@/lib/utils";

interface CreatorLite {
  id: string;
  name: string;
  artistic_name?: string | null;
  instagram_handle?: string | null;
  assigned_manager_profile_id?: string | null;
}

interface Props {
  dateFrom?: Date;
  dateTo?: Date;
  creators: CreatorLite[];
}

interface ContactRow {
  creator_id: string;
  manager_profile_id: string;
  phone_ok: boolean;
  last_contact_at: string | null;
  contact_days_in_range: number;
  msgs_in_range: number;
}

interface GrowthRow {
  creator_id: string;
  manager_profile_id: string;
  new_fans: number;
  new_sub_gross: number;
  recurring_sub_gross: number;
  total_gross: number;
  prev_new_fans: number;
  prev_new_sub_gross: number;
  prev_total_gross: number;
  days_with_data: number;
}

const SILENT_DAYS = 3;
const money = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);
const deltaPct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

const Delta = ({ cur, prev }: { cur: number; prev: number }) => {
  const d = deltaPct(cur, prev);
  if (d == null) return <span className="text-[11px] text-muted-foreground">sin base previa</span>;
  const up = d >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium", up ? "text-success" : "text-destructive")} title="vs el mismo tramo anterior">
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{d}%
    </span>
  );
};

const daysSince = (iso: string | null) => (iso ? differenceInCalendarDays(new Date(), new Date(iso)) : null);
// "Silenciosa" = MISMO criterio que el bot (get_manager_silent_creators): sin
// saliente en las últimas 72 h reales, no días calendario.
const isSilent = (iso: string | null) => (iso ? Date.now() - new Date(iso).getTime() >= SILENT_DAYS * 86400e3 : true);

// Celda KPI: número grande + una línea de contexto. Sin listas.
const Kpi = ({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "warn" | "bad" }) => (
  <div className="min-w-0">
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground md:hidden">{label}</p>
    <p className={cn("text-2xl font-bold leading-none tabular-nums", tone === "good" && "text-success", tone === "warn" && "text-warning", tone === "bad" && "text-destructive")}>{value}</p>
    {sub && <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{sub}</p>}
  </div>
);

const COLS = "md:grid-cols-[minmax(200px,1.3fr)_repeat(5,minmax(0,1fr))_32px]";

const PromologManagersView = ({ dateFrom, dateTo, creators }: Props) => {
  // El rango efectivo termina HOY como máximo: "Esta semana"/"Este mes" llegan al
  // domingo/fin de mes y el delta BLU compararía 2 días contra 7 del tramo anterior.
  const hoy = new Date();
  const toDate = dateTo && dateTo < hoy ? dateTo : hoy;
  const fromDate = dateFrom && dateFrom <= toDate ? dateFrom : toDate;
  const from = format(fromDate, "yyyy-MM-dd");
  const to = format(toDate, "yyyy-MM-dd");
  const rangeDays = differenceInCalendarDays(toDate, fromDate) + 1;
  const recortado = !!dateTo && dateTo > hoy;

  const { data: managers = [] } = useAssignableManagers();
  const { data: scores = [], isLoading: scoresLoading } = usePromoScoresRango(from, to);
  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ["manager-contact-stats", from, to],
    staleTime: 60_000,
    queryFn: async (): Promise<ContactRow[]> => {
      const { data, error } = await (supabase as any).rpc("get_manager_contact_stats", { p_from: from, p_to: to });
      if (error) throw error;
      return (data ?? []) as ContactRow[];
    },
  });
  const { data: growth = [], isLoading: growthLoading } = useQuery({
    queryKey: ["manager-growth-stats", from, to],
    staleTime: 60_000,
    queryFn: async (): Promise<GrowthRow[]> => {
      const { data, error } = await (supabase as any).rpc("get_manager_growth_stats", { p_from: from, p_to: to });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        new_sub_gross: Number(r.new_sub_gross ?? 0),
        recurring_sub_gross: Number(r.recurring_sub_gross ?? 0),
        total_gross: Number(r.total_gross ?? 0),
        prev_new_sub_gross: Number(r.prev_new_sub_gross ?? 0),
        prev_total_gross: Number(r.prev_total_gross ?? 0),
      })) as GrowthRow[];
    },
  });

  const [openManager, setOpenManager] = useState<string | null>(null);

  // ── Agregación por manager ────────────────────────────────────────────
  const rows = useMemo(() => {
    const scoreBy = new Map<string, PromoPeriodScore>(scores.map((s) => [s.creator_id, s]));
    const contactBy = new Map<string, ContactRow>(contacts.map((c) => [c.creator_id, c]));
    const growthBy = new Map<string, GrowthRow>(growth.map((g) => [g.creator_id, g]));

    return managers
      .map((m) => {
        const roster = creators.filter((c) => c.assigned_manager_profile_id === m.id);
        const detail = roster.map((c) => {
          const s = scoreBy.get(c.id);
          const ct = contactBy.get(c.id);
          const g = growthBy.get(c.id);
          const lastDays = daysSince(ct?.last_contact_at ?? null);
          const promoDays = s?.promo_days ?? 0;
          const covered = s?.covered_days ?? 0;
          const promoted = promoDays > 0;
          const silent = ct?.phone_ok ? isSilent(ct.last_contact_at) : null;
          const newFans = g?.new_fans ?? 0;
          const flags = [!promoted && covered > 0, silent === true, newFans === 0].filter(Boolean).length;
          return {
            creator: c,
            name: c.artistic_name || c.name,
            promoDays, covered, promoted,
            score: s?.score ?? null,
            isPartial: s?.is_partial ?? false,
            lastDays,
            phoneOk: ct?.phone_ok ?? false,
            contactDays: ct?.contact_days_in_range ?? 0,
            silent,
            newFans,
            newSub: g?.new_sub_gross ?? 0,
            recSub: g?.recurring_sub_gross ?? 0,
            total: g?.total_gross ?? 0,
            semaforo: flags >= 3 ? "rojo" : flags === 2 ? "ambar" : "verde",
          };
        });
        const scored = detail.filter((d) => d.score != null && d.covered > 0);
        const avgScore = scored.length ? Math.round(scored.reduce((a, d) => a + (d.score ?? 0), 0) / scored.length) : null;
        const promotedCount = detail.filter((d) => d.promoted).length;
        const noPromo = detail.filter((d) => !d.promoted && d.covered > 0).length;
        const contactable = detail.filter((d) => d.phoneOk);
        const contacted = contactable.filter((d) => d.contactDays > 0).length;
        const silent = contactable.filter((d) => d.silent === true).length;
        const sum = (k: "newFans" | "newSub" | "recSub" | "total") => detail.reduce((a, d) => a + (d[k] as number), 0);
        const prevNewFans = roster.reduce((a, c) => a + (growthBy.get(c.id)?.prev_new_fans ?? 0), 0);
        const prevNewSub = roster.reduce((a, c) => a + (growthBy.get(c.id)?.prev_new_sub_gross ?? 0), 0);
        const rojas = detail.filter((d) => d.semaforo === "rojo").length;
        const order = { rojo: 0, ambar: 1, verde: 2 } as const;
        return {
          manager: m,
          roster: roster.length,
          detail: detail.sort((a, b) => order[a.semaforo as keyof typeof order] - order[b.semaforo as keyof typeof order] || b.newFans - a.newFans),
          promotedCount, avgScore, noPromo,
          contactable: contactable.length, contacted, silent,
          newFans: sum("newFans"), newSub: sum("newSub"), recSub: sum("recSub"),
          prevNewFans, prevNewSub, rojas,
        };
      })
      .sort((a, b) => b.roster - a.roster);
  }, [managers, creators, scores, contacts, growth]);

  const withRoster = rows.filter((r) => r.roster > 0);
  const loading = scoresLoading || contactsLoading || growthLoading;

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">Managers</h3>
          <p className="text-xs text-muted-foreground">
            {rangeDays === 1 ? format(fromDate, "d 'de' MMMM yyyy", { locale: es }) : `${format(fromDate, "d MMM", { locale: es })} – ${format(toDate, "d MMM yyyy", { locale: es })} · ${rangeDays} días`}
            {recortado && <span className="text-warning"> · recortado a hoy</span>}
            {" · "}creadoras activas, por la manager asignada en su ficha
          </p>
        </div>
        {loading && <span className="text-xs text-muted-foreground">Cargando…</span>}
      </div>

      {/* Encabezados de columna (desktop) */}
      <div className={cn("hidden md:grid gap-4 px-5 text-[10px] uppercase tracking-wider text-muted-foreground", COLS)}>
        <span>Manager</span>
        <span>Promocionaron</span>
        <span>Calidad promo</span>
        <span>Contacto WhatsApp</span>
        <span>Fans nuevos</span>
        <span>Subs nuevas</span>
        <span />
      </div>

      <div className="space-y-3">
        {withRoster.map((r) => {
          const open = openManager === r.manager.id;
          const name = r.manager.full_name ?? "—";
          const promoPct = pct(r.promotedCount, r.roster);
          const contactPct = pct(r.contacted, r.contactable);
          return (
            <Card key={r.manager.id} className={cn("transition-shadow", open && "ring-1 ring-primary/40")}>
              <CardContent className="p-0">
                <button
                  type="button"
                  onClick={() => setOpenManager(open ? null : r.manager.id)}
                  className={cn("w-full grid grid-cols-2 gap-4 p-5 text-left items-start hover:bg-white/[0.03] rounded-t-xl", COLS)}
                >
                  {/* Manager */}
                  <div className="col-span-2 md:col-span-1 flex items-center gap-3 min-w-0">
                    <UserAvatar name={name} src={r.manager.avatar_url} seed={r.manager.avatar_seed} size="lg" />
                    <div className="min-w-0">
                      <p className="text-base font-semibold truncate">{name}</p>
                      <p className="text-xs text-muted-foreground">{r.roster} creadoras activas</p>
                    </div>
                  </div>
                  <Kpi label="Promocionaron" value={`${promoPct}%`} sub={`${r.promotedCount} de ${r.roster}`} tone={promoPct >= 70 ? "good" : promoPct >= 40 ? "warn" : "bad"} />
                  <Kpi label="Calidad promo" value={r.avgScore != null ? r.avgScore : "—"} sub={r.avgScore != null ? "promedio /100" : "sin lecturas"} tone={r.avgScore == null ? undefined : r.avgScore >= 70 ? "good" : r.avgScore >= 40 ? "warn" : "bad"} />
                  <Kpi label="Contacto WhatsApp" value={`${contactPct}%`} sub={`${r.contacted} de ${r.contactable} contactadas`} tone={contactPct >= 80 ? "good" : contactPct >= 50 ? "warn" : "bad"} />
                  <Kpi label="Fans nuevos" value={r.newFans.toLocaleString("es-CO")} sub={<Delta cur={r.newFans} prev={r.prevNewFans} />} />
                  <Kpi label="Subs nuevas" value={money(r.newSub)} sub={<><Delta cur={r.newSub} prev={r.prevNewSub} /> <span className="text-muted-foreground">· rec. {money(r.recSub)}</span></>} />
                  <div className="hidden md:flex justify-end pt-1 text-muted-foreground">{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</div>
                </button>

                {/* Alertas en chips (sin nombres: van en el drill-down) */}
                <div className="flex flex-wrap items-center gap-2 px-5 pb-4 -mt-1">
                  {r.rojas > 0 && <Badge variant="destructive-soft">🔴 {r.rojas} urgente{r.rojas > 1 ? "s" : ""}</Badge>}
                  {r.noPromo > 0 && <Badge variant="destructive-soft">{r.noPromo} sin promo</Badge>}
                  {r.silent > 0 ? <Badge variant="warning-soft">{r.silent} con {SILENT_DAYS}+ días sin contacto</Badge> : <Badge variant="success-soft">todas contactadas en {SILENT_DAYS} días</Badge>}
                  {r.roster - r.contactable > 0 && <Badge variant="secondary-soft">{r.roster - r.contactable} sin teléfono</Badge>}
                  <span className="ml-auto text-[11px] text-muted-foreground">{open ? "ocultar creadoras" : "ver creadoras"}</span>
                </div>

                {/* Drill-down: sus creadoras con semáforo */}
                {open && (
                  <div className="border-t border-white/10 overflow-x-auto">
                    <Table className="min-w-[760px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Creadora</TableHead>
                          <TableHead className="text-center">Promo</TableHead>
                          <TableHead className="text-center">Calidad</TableHead>
                          <TableHead className="text-center">Último contacto</TableHead>
                          <TableHead className="text-right">Fans nuevos</TableHead>
                          <TableHead className="text-right">Subs nuevas</TableHead>
                          <TableHead className="text-right">Total BLU</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {r.detail.map((d) => (
                          <TableRow key={d.creator.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", d.semaforo === "rojo" ? "bg-destructive" : d.semaforo === "ambar" ? "bg-warning" : "bg-success")} title={d.semaforo === "rojo" ? "No promociona + sin contacto + sin fans nuevos" : d.semaforo === "ambar" ? "Dos señales en rojo" : "OK"} />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{d.name}</p>
                                  {d.creator.instagram_handle && <p className="text-[11px] text-muted-foreground">@{d.creator.instagram_handle}</p>}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-sm">
                              {d.covered > 0 ? <span className={cn(d.promoted ? "text-success" : "text-destructive", "font-medium")}>{d.promoDays}/{d.covered} días</span> : <span className="text-muted-foreground text-xs">sin lectura</span>}
                            </TableCell>
                            <TableCell className="text-center">
                              {d.score != null && d.covered > 0 ? <Badge variant={d.score >= 70 ? "success-soft" : d.score >= 40 ? "warning-soft" : "destructive-soft"}>{d.score}{d.isPartial ? " · parcial" : ""}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                            </TableCell>
                            <TableCell className="text-center text-sm">
                              {!d.phoneOk ? <span className="text-muted-foreground text-xs">sin teléfono</span>
                                : d.lastDays == null ? <span className="text-destructive text-xs">nunca</span>
                                : <span className={cn(d.silent ? "text-warning" : "text-success")}>{d.lastDays === 0 ? "hoy" : `hace ${d.lastDays}d`}</span>}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">{d.newFans.toLocaleString("es-CO")}</TableCell>
                            <TableCell className="text-right text-sm">{money(d.newSub)}</TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">{money(d.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        🔴 urgente = no promociona + sin contacto reciente + sin fans nuevos · la línea de WhatsApp es compartida: el contacto se atribuye a la manager asignada en la ficha.
        {rows.length > withRoster.length && ` · Sin creadoras asignadas: ${rows.filter((r) => r.roster === 0).map((r) => r.manager.full_name).join(", ")}.`}
      </p>
    </div>
  );
};

export default PromologManagersView;
