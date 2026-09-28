import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Search, ChevronRight, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { HRPageHeader } from "@/components/hr/HRPageHeader";
import { useHrRoster } from "./useHrPeople";
import { useLanguage } from "@/hooks/useLanguage";
import { rolHr } from "./etiquetasHr";

// Roster de TODO el personal (v_hr_roster, 64) → ficha por persona. Reemplaza el viejo
// "directorio" basado en employees (1 fila). Búsqueda + filtro por rol; click abre la ficha.

export default function HRPersonnel() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data: people = [], isLoading } = useHrRoster();
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const roles = useMemo(
    () => Array.from(new Set(people.map((p) => p.role).filter(Boolean))).sort(),
    [people],
  );
  const filtered = useMemo(
    () => people.filter((p) =>
      (roleFilter === "all" || p.role === roleFilter) &&
      (!q || p.name.toLowerCase().includes(q.toLowerCase())),
    ),
    [people, q, roleFilter],
  );

  const initials = (name: string) =>
    name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 px-6 pt-6">
        <HRPageHeader
          title={t("hrg.pers.title")}
          subtitle={t("hrg.pers.subtitle", { count: people.length })}
          icon={Users}
        />
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.searchPerson")} className="pl-8" />
          </div>
          <div className="flex flex-wrap gap-1">
            {["all", ...roles].map((r) => (
              <button key={r} onClick={() => setRoleFilter(r)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] ${roleFilter === r ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
                {r === "all" ? t("common.all") : rolHr(t, r)}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t("common.noResults")}</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <button key={p.profile_id} onClick={() => navigate(`/hr/persona/${p.profile_id}`)}
                className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {initials(p.name) || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary-soft" className="text-[10px]">{rolHr(t, p.role)}</Badge>
                    {p.in_hubstaff && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-success">
                        <Activity className="h-3 w-3" /> Hubstaff
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
