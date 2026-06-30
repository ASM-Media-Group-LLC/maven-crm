import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { HR_HOME, HR_NAV, type HrNavItem } from "./hrNav";

// Wrapper de todas las páginas de Recursos Humanos. Monta un sub-rail vertical
// persistente (estilo Operaciones / AgencyQA): el menú de RRHH queda fijo a la
// izquierda y el contenido de cada ruta /hr/* se renderiza a la derecha, en vez
// del antiguo modelo hub-and-spoke (entrar al dashboard y "saltar" a cada pantalla
// con un botón Volver). Los items se filtran por canAccess('HR', submodule) — el
// rail solo muestra lo que el rol puede abrir. En mobile el rail se oculta y manda
// el sidebar principal.

const HRLayout = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  const { canAccess } = usePermissions();

  // Item activo = el url más específico (más largo) que matchea el pathname,
  // así /hr/horarios/horas-extras resalta "Horas extra" y no "Horarios y turnos".
  const activeUrl = useMemo(() => {
    const all: HrNavItem[] = [HR_HOME, ...HR_NAV.flatMap((g) => g.items)];
    return all
      .filter((it) => pathname === it.url || pathname.startsWith(it.url + "/"))
      .sort((a, b) => b.url.length - a.url.length)[0]?.url;
  }, [pathname]);

  // Grupos con al menos un item visible para el rol.
  const groups = useMemo(
    () =>
      HR_NAV.map((g) => ({
        ...g,
        items: g.items.filter((it) => canAccess("HR", it.submodule)),
      })).filter((g) => g.items.length > 0),
    [canAccess],
  );

  const RailLink = ({ item }: { item: HrNavItem }) => (
    <Link
      to={item.url}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm sidebar-glass-hover",
        activeUrl === item.url && "sidebar-glass-active font-medium",
      )}
    >
      <span className="truncate">{item.title}</span>
    </Link>
  );

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <aside className="sub-rail hidden w-60 shrink-0 flex-col border-r bg-card/40 md:flex">
        <div className="flex-1 space-y-1 overflow-y-auto p-4">
          <div className="px-2 pb-2">
            <h1 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/70">
              Recursos Humanos
            </h1>
            <p className="mt-1 text-[11px] text-muted-foreground/80">Gestión de personal</p>
          </div>

          {canAccess("HR", HR_HOME.submodule) && (
            <Link
              to={HR_HOME.url}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm sidebar-glass-hover",
                activeUrl === HR_HOME.url && "sidebar-glass-active font-medium",
              )}
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              <span className="truncate">{HR_HOME.title}</span>
            </Link>
          )}

          {groups.map((g) => {
            const Icon = g.icon;
            return (
              <div key={g.label} className="pt-3">
                <div className="flex items-center gap-1.5 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  <Icon className="h-3 w-3" />
                  {g.label}
                </div>
                {g.items.map((item) => (
                  <RailLink key={item.url} item={item} />
                ))}
              </div>
            );
          })}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col min-h-0 overflow-hidden">{children}</section>
    </div>
  );
};

export default HRLayout;
