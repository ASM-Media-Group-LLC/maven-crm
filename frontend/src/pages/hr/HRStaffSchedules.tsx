import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, Search, Loader2, CheckCircle2, Copy } from "lucide-react";
import { useQaStaff, useUserSchedule, saveUserSchedule, roleKindOf, type QaStaff } from "./useStaffSchedules";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

const DAYS: { w: number; label: TranslationKey }[] = [
  { w: 1, label: "hr.wd.monday" }, { w: 2, label: "hr.wd.tuesday" }, { w: 3, label: "hr.wd.wednesday" },
  { w: 4, label: "hr.wd.thursday" }, { w: 5, label: "hr.wd.friday" }, { w: 6, label: "hr.wd.saturday" }, { w: 7, label: "hr.wd.sunday" },
];
const ROLE_LABEL: Record<string, string> = { Chatter: "Chatter", closer: "Closer", manager: "Manager", LLG: "LLG" };

type Row = { weekday: number; works: boolean; start: string; end: string };
const emptyWeek = (): Row[] => DAYS.map((d) => ({ weekday: d.w, works: false, start: "", end: "" }));

export default function HRStaffSchedules() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: staff = [], isLoading } = useQaStaff();
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selected, setSelected] = useState<QaStaff | null>(null);
  const { data: sched, isLoading: schedLoading } = useUserSchedule(selected?.profile_id ?? null);
  const [week, setWeek] = useState<Row[]>(emptyWeek());
  const [saving, setSaving] = useState(false);

  // Prefill la grilla cuando cargo el horario de la persona seleccionada.
  useEffect(() => {
    if (!selected) return;
    const byDay = new Map((sched ?? []).map((r) => [r.weekday, r]));
    setWeek(DAYS.map((d) => {
      const r = byDay.get(d.w);
      return r && r.start_time
        ? { weekday: d.w, works: true, start: (r.start_time || "").slice(0, 5), end: (r.end_time || "").slice(0, 5) }
        : { weekday: d.w, works: false, start: "", end: "" };
    }));
  }, [selected, sched]);

  const roles = useMemo(
    () => Array.from(new Set(staff.map((s) => s.role).filter(Boolean))).sort() as string[],
    [staff],
  );
  const filtered = useMemo(() => staff.filter((s) =>
    (roleFilter === "all" || s.role === roleFilter) &&
    (!q || s.name.toLowerCase().includes(q.toLowerCase()))
  ), [staff, q, roleFilter]);

  const setDay = (w: number, patch: Partial<Row>) =>
    setWeek((wk) => wk.map((d) => (d.weekday === w ? { ...d, ...patch } : d)));

  // Copia el horario del primer día que trabaja a todos los días laborables (Lun-Vie).
  const copyToWeekdays = () => {
    const src = week.find((d) => d.works && d.start);
    if (!src) return;
    setWeek((wk) => wk.map((d) => (d.weekday <= 5 ? { ...d, works: true, start: src.start, end: src.end } : d)));
  };

  const save = async () => {
    if (!selected) return;
    const bad = week.find((d) => d.works && (!d.start || !d.end));
    if (bad) { toast({ title: t("hr.staffSched.missingTimes"), variant: "destructive" }); return; }
    setSaving(true);
    try {
      await saveUserSchedule(selected.profile_id, roleKindOf(selected.role), week);
      toast({ title: t("hr.staffSched.saved"), description: selected.name });
      qc.invalidateQueries({ queryKey: ["qa-staff"] });
      qc.invalidateQueries({ queryKey: ["user-schedule", selected.profile_id] });
    } catch (e: any) {
      toast({ title: t("common.couldNotSave"), description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-6">
      <PageHeader
        title={t("hr.staffSched.title")}
        icon={<CalendarClock className="h-5 w-5" />}
        subtitle={
          <>
            {t("hr.staffSched.subtitleA")} <strong>{t("hr.staffSched.subtitlePunctuality")}</strong> {t("hr.staffSched.subtitleB")}
          </>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        {/* Picker de personas */}
        <Card className="flex min-h-0 flex-col">
          <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.searchPerson")} className="pl-8" />
            </div>
            <div className="flex flex-wrap gap-1">
              {["all", ...roles].map((r) => (
                <button key={r} onClick={() => setRoleFilter(r)}
                  className={`rounded-full px-2 py-0.5 text-[11px] ${roleFilter === r ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
                  {r === "all" ? t("common.all") : (ROLE_LABEL[r] ?? r)}
                </button>
              ))}
            </div>
            <ScrollArea className="min-h-0 flex-1">
              {isLoading ? (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}</div>
              ) : filtered.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">{t("common.noResults")}</div>
              ) : (
                <div className="space-y-0.5 pr-2">
                  {filtered.map((s) => (
                    <button key={s.profile_id} onClick={() => setSelected(s)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/50 ${selected?.profile_id === s.profile_id ? "bg-muted" : ""}`}>
                      <span className="flex-1 truncate">{s.name}</span>
                      {s.hasSchedule && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />}
                      <Badge variant="secondary-soft" className="text-[10px]">{ROLE_LABEL[s.role] ?? s.role}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Grilla semanal */}
        <Card className="min-h-0">
          <CardContent className="p-4">
            {!selected ? (
              <div className="flex h-full items-center justify-center py-16 text-sm text-muted-foreground">
                {t("hr.staffSched.pickPerson")}
              </div>
            ) : schedLoading ? (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("hr.staffSched.loadingSchedule")}</div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{selected.name}</div>
                    <div className="text-xs text-muted-foreground">{ROLE_LABEL[selected.role] ?? selected.role}</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={copyToWeekdays} className="gap-1">
                    <Copy className="h-3.5 w-3.5" /> {t("hr.staffSched.copyWeekdays")}
                  </Button>
                </div>
                <div className="divide-y rounded-md border">
                  {week.map((d) => {
                    const label = t(DAYS.find((x) => x.w === d.weekday)!.label);
                    return (
                      <div key={d.weekday} className="flex items-center gap-3 px-3 py-2">
                        <div className="flex w-32 items-center gap-2">
                          <Switch checked={d.works} onCheckedChange={(v) => setDay(d.weekday, { works: v })} />
                          <span className={`text-sm ${d.works ? "font-medium" : "text-muted-foreground"}`}>{label}</span>
                        </div>
                        {d.works ? (
                          <div className="flex items-center gap-2 text-sm">
                            <Input type="time" value={d.start} onChange={(e) => setDay(d.weekday, { start: e.target.value })} className="h-8 w-28" />
                            <span className="text-muted-foreground">{t("hr.staffSched.to")}</span>
                            <Input type="time" value={d.end} onChange={(e) => setDay(d.weekday, { end: e.target.value })} className="h-8 w-28" />
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("hr.staffSched.dayOff")}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end">
                  <Button onClick={save} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("hr.staffSched.save")}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t("hr.staffSched.footnote")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
