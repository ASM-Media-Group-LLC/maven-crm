// Sección Empleados — el listado. Cada persona del equipo (cuenta activa) es
// una tarjeta que abre su perfil de desempeño. Solo la ven supervisores y
// superiores (la ruta va envuelta en SupervisorRoute).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Search, ChevronRight } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useStaffRoster } from "@/hooks/useStaffRoster";
import { UserAvatar } from "@/components/UserAvatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const normaliza = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function EmpleadosPage() {
  const { t } = useLanguage();
  const { data, isLoading, isError, refetch, isFetching } = useStaffRoster();
  const [q, setQ] = useState("");

  const lista = useMemo(() => {
    const todos = data ?? [];
    const term = normaliza(q.trim());
    if (!term) return todos;
    return todos.filter((p) => normaliza(p.full_name ?? "").includes(term));
  }, [data, q]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("empleados.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("empleados.subtitle")}</p>
      </header>

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("empleados.search")}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/20 py-12 text-center">
          <p className="text-sm text-muted-foreground">{t("empleados.loadError")}</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            {t("empleados.retry")}
          </Button>
        </div>
      ) : lista.length === 0 ? (
        <div className="rounded-xl border border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
          {q.trim() ? t("empleados.emptySearch", { q: q.trim() }) : t("empleados.empty")}
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("empleados.count", { count: lista.length })}
          </p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {lista.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/empleados/${p.id}`}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <UserAvatar name={p.full_name ?? "—"} src={p.avatar_url} seed={p.avatar_seed} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.full_name ?? "—"}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {isFetching && !isLoading && (
        <div className="mt-4 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
    </div>
  );
}
