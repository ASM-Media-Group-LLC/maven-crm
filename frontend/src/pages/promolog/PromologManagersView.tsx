// Tab "Managers" de Promolog (ex "Agentes", rediseño 08/09/26).
//
// Qué mide a una manager (definido con Jhon): (1) que SUS modelos promocionen y
// la calidad de esas promos, (2) cuánto las contacta por la línea de WhatsApp de
// Managers, (3) cuántos usuarios NUEVOS traen (BLU: fans nuevos y $ de subs
// nuevas). Todo por la manager ASIGNADA en la ficha de cada creadora y siempre
// sobre las activas. El rango es el global del header (Ayer/Hoy/Semana/Mes).
//
// Fuentes: promo_creator_period_scores (score 0-100 + promo-días),
// get_manager_contact_stats (último contacto + días con contacto en el rango;
// la línea es compartida → no se sabe quién tipeó) y get_manager_growth_stats
// (BLU del rango vs el mismo tramo anterior).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, differenceInCalendarDays } from "date-fns";
import { ChevronDown, ChevronUp, MessageCircle, Sparkles, TrendingDown, TrendingUp, Users, UserPlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium", up ? "text-success" : "text-destructive")}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{d}% vs tramo anterior
    </span>
  );
};

const daysSince = (iso: string | null) => (iso ? differenceInCalendarDays(new Date(), new Date(iso)) : null);

const PromologManagersView = ({ dateFrom, dateTo, creators }: Props) => {
  const from = dateFrom ? format(dateFrom, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
  const to = dateTo ? format(dateTo, "yyyy-MM-dd") : from;
  const rangeDays = dateFrom && dateTo ? differenceInCalendarDays(dateTo, dateFrom) + 1 : 1;

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
          const silent = ct?.phone_ok ? (lastDays == null || lastDays >= SILENT_DAYS) : null;
          const newFans = g?.new_fans ?? 0;
          // Semáforo: rojo = no promociona + sin contacto reciente + sin fans nuevos.
          const flags = [!promoted && covered > 0, silent === true, newFans === 0].filter(Boolean).length;
          return {
            creator: c,
            name: c.artistic_name || c.name,
            promoDays, covered, promoted,
            score: s?.score ?? null,
            isPartial: s?.is_partial ?? false,
            lastContactAt: ct?.last_contact_at ?? null,
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
        const noPromo = detail.filter((d) => !d.promoted && d.covered > 0);
        const contactable = detail.filter((d) => d.phoneOk);
        const contacted = contactable.filter((d) => d.contactDays > 0);
        const silent = contactable.filter((d) => d.silent === true).sort((a, b) => (b.lastDays ?? 999) - (a.lastDays ?? 999));
        const sum = (k: "newFans" | "newSub" | "recSub" | "total") => detail.reduce((a, d) => a + (d[k] as number), 0);
        const prevNewFans = roster.reduce((a, c) => a + (growthBy.get(c.id)?.prev_new_fans ?? 0), 0);
        const prevNewSub = roster.reduce((a, c) => a + (growthBy.get(c.id)?.prev_new_sub_gross ?? 0), 0);
        const prevTotal = roster.reduce((a, c) => a + (growthBy.get(c.id)?.prev_total_gross ?? 0), 0);
        const topFans = [...detail].filter((d) => d.newFans > 0).sort((a, b) => b.newFans - a.newFans).slice(0, 3);
        return {
          manager: m,
          roster: roster.length,
          detail: detail.sort((a, b) => (a.semaforo === b.semaforo ? b.newFans - a.newFans : a.semaforo === "rojo" ? -1 : b.semaforo === "rojo" ? 1 : a.semaforo === "ambar" ? -1 : 1)),
          promotedCount, avgScore, noPromo,
          contactable: contactable.length, contacted: contacted.length, silent,
          newFans: sum("newFans"), newSub: sum("newSub"), recSub: sum("recSub"), total: sum("total"),
          prevNewFans, prevNewSub, prevTotal, topFans,
        };
      })
      .sort((a, b) => b.roster - a.roster);
  }, [managers, creators, scores, contacts, growth]);

  const withRoster = rows.filter((r) => r.roster > 0);
  const loading = scoresLoading || contactsLoading || growthLoading;

  const initials = (n: string) => n.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6 space-y-5">
      {/* Fila comparativa */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div>
              <h3 className="text-base font-semibold">Managers</h3>
              <p className="text-xs text-muted-foreground">
                {rangeDays === 1 ? format(dateFrom ?? new Date(), "d 'de' MMMM yyyy") : `${format(dateFrom!, "d MMM")} – ${format(dateTo!, "d MMM yyyy")} · ${rangeDays} días`}
                {" · "}por la manager asignada en la ficha · solo creadoras activas
              </p>
            </div>
            {loading && <span className="text-xs text-muted-foreground">Cargando…</span>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { key: "promo", label: "Roster que promocionó", icon: Sparkles, val: (r: typeof rows[number]) => pct(r.promotedCount, r.roster), fmt: (v: number) => `${v}%` },
              { key: "contacto", label: "Roster contactado por WhatsApp", icon: MessageCircle, val: (r: typeof rows[number]) => pct(r.contacted, r.contactable), fmt: (v: number) => `${v}%` },
              { key: "fans", label: "Fans nuevos (BLU)", icon: UserPlus, val: (r: typeof rows[number]) => r.newFans, fmt: (v: number) => v.toLocaleString("es-CO") },
            ].map((k) => {
              const max = Math.max(1, ...withRoster.map((r) => k.val(r)));
              return (
                <div key={k.key} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-2"><k.icon className="h-3.5 w-3.5" /> {k.label}</p>
                  <div className="space-y-1.5">
                    {withRoster.map((r) => {
                      const v = k.val(r);
                      return (
                        <div key={r.manager.id} className="flex items-center gap-2 text-xs">
                          <span className="w-20 truncate">{(r.manager.full_name ?? "").split(" ")[0]}</span>
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((v / max) * 100)}%` }} />
                          </div>
                          <span className="w-14 text-right font-medium">{k.fmt(v)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tarjetas por manager */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {withRoster.map((r) => {
          const open = openManager === r.manager.id;
          const name = r.manager.full_name ?? "—";
          return (
            <Card key={r.manager.id} className={cn("transition-shadow", open && "ring-1 ring-primary/40")}>
              <CardContent className="pt-4 pb-4 space-y-4">
                <button type="button" className="w-full flex items-center gap-3 text-left" onClick={() => setOpenManager(open ? null : r.manager.id)}>
                  <Avatar className="h-10 w-10"><AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">{initials(name)}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> {r.roster} creadoras activas</p>
                  </div>
                  {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Promoción */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Promoción</p>
                    <p className="text-2xl font-bold mt-1">{pct(r.promotedCount, r.roster)}%</p>
                    <p className="text-xs text-muted-foreground">{r.promotedCount} de {r.roster} promocionaron</p>
                    <p className="text-xs mt-2">Calidad promedio: <span className="font-semibold">{r.avgScore != null ? `${r.avgScore}/100` : "—"}</span></p>
                    {r.noPromo.length > 0 && (
                      <p className="text-xs text-destructive mt-1">🔴 {r.noPromo.length} sin promo: {r.noPromo.slice(0, 3).map((d) => d.name).join(", ")}{r.noPromo.length > 3 ? "…" : ""}</p>
                    )}
                  </div>
                  {/* Contacto */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> Contacto WhatsApp</p>
                    <p className="text-2xl font-bold mt-1">{r.contacted}<span className="text-sm font-normal text-muted-foreground"> / {r.contactable}</span></p>
                    <p className="text-xs text-muted-foreground">creadoras contactadas en el rango</p>
                    {r.silent.length > 0 ? (
                      <p className="text-xs text-warning mt-2">⏳ {r.silent.length} con {SILENT_DAYS}+ días sin contacto: {r.silent.slice(0, 3).map((d) => `${d.name}${d.lastDays != null ? ` (${d.lastDays}d)` : " (nunca)"}`).join(", ")}{r.silent.length > 3 ? "…" : ""}</p>
                    ) : (
                      <p className="text-xs text-success mt-2">Todas contactadas en los últimos {SILENT_DAYS} días</p>
                    )}
                    {r.roster - r.contactable > 0 && <p className="text-[11px] text-muted-foreground mt-1">{r.roster - r.contactable} sin teléfono normalizable (no atribuibles)</p>}
                  </div>
                  {/* Crecimiento */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><UserPlus className="h-3.5 w-3.5" /> Usuarios nuevos (BLU)</p>
                    <p className="text-2xl font-bold mt-1">{r.newFans.toLocaleString("es-CO")}</p>
                    <Delta cur={r.newFans} prev={r.prevNewFans} />
                    <p className="text-xs mt-2">Subs nuevas: <span className="font-semibold">{money(r.newSub)}</span> <span className="text-muted-foreground">· recurrentes {money(r.recSub)}</span></p>
                    <Delta cur={r.newSub} prev={r.prevNewSub} />
                    {r.topFans.length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1">Top: {r.topFans.map((d) => `${d.name} (${d.newFans})`).join(" · ")}</p>
                    )}
                  </div>
                </div>

                {/* Drill-down: sus creadoras con semáforo */}
                {open && (
                  <div className="rounded-xl border border-white/10 overflow-x-auto">
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
                                : <span className={cn(d.lastDays >= SILENT_DAYS ? "text-warning" : "text-success")}>{d.lastDays === 0 ? "hoy" : `hace ${d.lastDays}d`}</span>}
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

      {rows.length > withRoster.length && (
        <p className="text-xs text-muted-foreground">
          Sin creadoras asignadas: {rows.filter((r) => r.roster === 0).map((r) => r.manager.full_name).join(", ")}.
        </p>
      )}
    </div>
  );
};

export default PromologManagersView;
