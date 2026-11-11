import { Link } from "react-router-dom";
import { ChevronRight, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import { Bloque, Cargando, Fallo, Nota } from "./piezas";
import { useRolesSinPermisos } from "./datos";

// 4. Roles nuevos sin permisos: los que creó la plataforma. Cada uno abre el editor
// de permisos de siempre (Usuarios → Roles → Permisos) con ese rol ya abierto.

/** Ajustes → Usuarios, pestaña Roles, con los permisos de este rol abiertos. */
export function enlaceAPermisos(rol: string): string {
  const q = new URLSearchParams({ sub: "usuarios", pestana: "roles", permisos: rol });
  return `/settings?${q.toString()}`;
}

export function RolesSinPermisos() {
  const { t } = useLanguage();
  const f = useFormato();
  const q = useRolesSinPermisos();
  const fecha = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(f.intl("es-CO"), { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <Bloque id="roles-sin-permisos" icono={ShieldOff} titulo={t("conexionEquipo.roles.titulo")} para={t("conexionEquipo.roles.para")}>
      {q.isLoading ? <Cargando /> : q.isError || !q.data ? (
        <Fallo onReintentar={() => void q.refetch()} detalle={(q.error as Error | null)?.message} />
      ) : q.data.length === 0 ? (
        <Nota tono="bien">{t("conexionEquipo.roles.ninguno")}</Nota>
      ) : (
        <ul className="flex flex-col gap-2">
          {q.data.map((r) => (
            <li key={r.nombre} className="flex flex-col gap-3 rounded-panel border border-border/50 bg-background/30 p-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-warning/40 bg-warning/10 text-warning">
                  <ShieldOff className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.nombre}</div>
                  <div className="text-xs text-muted-foreground">{t("conexionEquipo.roles.llego", { fecha: fecha(r.creado_at) })}</div>
                </div>
              </div>
              <Button asChild variant="outline" size="sm" className="gap-1 self-start sm:self-auto">
                <Link to={enlaceAPermisos(r.nombre)}>
                  {t("conexionEquipo.roles.marcar")}<ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Bloque>
  );
}
