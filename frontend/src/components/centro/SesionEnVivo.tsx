import { Link } from "react-router-dom";
import { Eye, Users } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import type { AdminSessionRow } from "@/hooks/useCoworkSession";
import { tituloBonito } from "@/lib/tituloBonito";

// SALAS EN VIVO, BIEN HECHAS (Alvaro, 18/11/2026: «si lo vas a poner, ponerlo
// bien» → cada sala con las caras de quién está adentro). Las caras salen de
// LiveKit (quién está conectado de verdad, sin los que miran escondidos); si
// LiveKit no contestó, de las asignaciones de la sala. Las salas vacías van en
// una sola línea. «Mirar» abre la sesión de incógnito (solo admin).

type Fotos = Record<string, { foto: string | null; seed: string | null }>;
const MAX_CARAS = 6;

export function SesionEnVivo({ s, fotos }: { s: AdminSessionRow; fotos: Fotos }) {
  const { t } = useLanguage();
  const activas = s.rooms.filter((r) => (r.online ?? 0) > 0);
  const vacias = s.rooms.filter((r) => (r.online ?? 0) === 0);
  const enLinea = s.online == null ? "–" : s.online;

  return (
    <div className="rounded-2xl border border-border/40 bg-foreground/[0.025] p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{tituloBonito(s.name)}</span>
        <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums ${(s.online ?? 0) > 0 ? "text-success" : "text-muted-foreground"}`}>
          <Users className="h-3.5 w-3.5" />{enLinea}
        </span>
        {(s.hubOnline ?? 0) > 0 && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            {t("dashboard.centro.hub")} {s.hubOnline}
          </span>
        )}
        <Link
          to={`/cowork?session=${s.id}&spy=1`}
          title={t("dashboard.salas.mirarSesion")}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <Eye className="h-3.5 w-3.5" />{t("dashboard.salas.mirar")}
        </Link>
      </div>

      {activas.length > 0 ? (
        <ul className="mt-2.5 flex flex-col gap-1">
          {activas.map((r) => {
            // Quién está: LiveKit si contestó; si no, las asignaciones (solo nombres).
            const caras = r.adentro
              ? r.adentro.map((p) => ({ clave: p.id, nombre: p.nombre, foto: fotos[p.id] }))
              : (r.gente ?? []).map((nombre) => ({ clave: nombre, nombre, foto: undefined }));
            const visibles = caras.slice(0, MAX_CARAS);
            const resto = Math.max(0, (r.online ?? caras.length) - visibles.length);
            return (
              <li key={r.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-foreground/[0.03]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={caras.map((c) => c.nombre).join(", ")}>
                  {tituloBonito(r.name)}
                </span>
                <span className="flex shrink-0 items-center">
                  <span className="flex -space-x-1.5">
                    {visibles.map((c) => (
                      <span key={c.clave} title={c.nombre} className="rounded-full ring-2 ring-background">
                        <UserAvatar name={c.nombre} src={c.foto?.foto} seed={c.foto?.seed} size="xs" />
                      </span>
                    ))}
                  </span>
                  {resto > 0 && <span className="ml-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{t("dashboard.salas.mas", { n: resto })}</span>}
                </span>
                <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-success">{r.online}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{t("dashboard.salas.nadieAdentro")}</p>
      )}

      {vacias.length > 0 && (
        <p className="mt-2 truncate px-2 text-[11px] text-muted-foreground" title={vacias.map((r) => tituloBonito(r.name)).join(", ")}>
          {vacias.length === 1 ? t("dashboard.salas.vacia") : t("dashboard.salas.vacias", { n: vacias.length })}
        </p>
      )}
    </div>
  );
}
