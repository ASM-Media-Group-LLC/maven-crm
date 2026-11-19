import { Suspense, useState, type ReactNode } from "react";
import { Navigate, NavLink, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { Building2, Eye, EyeOff, Presentation, Undo2, Users, CreditCard, LayoutGrid, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { useLanguage } from "@/hooks/useLanguage";
import { modoPlataforma, type TipoDeYo } from "@/lib/plataforma";
import { destinoSinPermiso, type PantallaDePlataforma } from "@/lib/plataforma/acceso";
import { cn } from "@/lib/utils";
import { PlataformaProvider, usePlataforma } from "./contexto";
import { Cargando, ErrorConReintento } from "./piezas";
import { VerComoDialogo } from "./VerComo";

// LA CASA DE LA PLATAFORMA MAVEN: /plataforma (dueño y Grace) y /mi-empresa (el
// admin de cada cliente). Vive FUERA del cascarón de Kash: no usa su sesión ni su
// menú, y con la plataforma apagada (lo de hoy) manda al tablero de siempre.

export default function PlataformaRaiz() {
  // Se decide una vez al montar: la app de Kash no cambia si no hay bandera.
  const [modo] = useState(modoPlataforma);
  if (modo === "apagada") return <Navigate to="/dashboard" replace />;
  return (
    <PlataformaProvider>
      <Casa />
    </PlataformaProvider>
  );
}

function Casa() {
  const { t } = useLanguage();
  const p = usePlataforma();
  const [verComoAbierto, setVerComoAbierto] = useState(false);
  const loc = useLocation();
  const [params] = useSearchParams();
  const org = params.get("org");
  const conOrg = (ruta: string) => (org && p.esPlataforma ? `${ruta}?org=${org}` : ruta);

  const enlace = ({ isActive }: { isActive: boolean }) => cn(
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
    isActive ? "bg-background/70 text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  );

  return (
    <div className="fondo-glass min-h-dvh text-foreground">
      {p.esMock && <BarraDeDemo />}
      {p.verComo && (
        <div className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-3 border-b border-amber-500/40 bg-amber-500/90 px-4 py-2 text-sm font-medium text-black">
          <Eye className="h-4 w-4" />
          <span>{t("plataforma.verComo.banner", { quien: p.verComo.quien })}</span>
          <Button size="sm" variant="outline" className="h-7 border-black/30 bg-black/10 text-black hover:bg-black/20" onClick={p.salirVerComo}>
            <Undo2 className="mr-1 h-3.5 w-3.5" />{t("plataforma.verComo.volver")}
          </Button>
        </div>
      )}
      {p.mostrandoACliente && !p.verComo && (
        <div className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-3 border-b border-border bg-background/90 px-4 py-2 text-sm backdrop-blur">
          <Presentation className="h-4 w-4 text-primary" />
          <span>{t("plataforma.mostrar.banner")}</span>
          <Button size="sm" variant="outline" className="h-7" onClick={() => p.setMostrandoACliente(false)}>
            <EyeOff className="mr-1 h-3.5 w-3.5" />{t("plataforma.mostrar.dejar")}
          </Button>
        </div>
      )}

      <header className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-3 px-4 pt-4 sm:px-6">
        <div className="vidrio-barra flex w-full flex-wrap items-center gap-2 px-3 py-2">
          <div className="flex items-center gap-2 pr-2">
            <Logo size="xs" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {p.esPlataforma && !p.verComo ? t("plataforma.etiqueta") : t("plataforma.etiquetaCliente")}
            </span>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {p.esPlataforma && !p.verComo && (
              <NavLink to="/plataforma" end className={enlace}><LayoutGrid className="h-4 w-4" />{t("plataforma.nav.clientes")}</NavLink>
            )}
            {p.yo?.tipo === "dueno" && !p.verComo && (
              <NavLink to="/plataforma/equipo" className={enlace}><Users className="h-4 w-4" />{t("plataforma.nav.equipo")}</NavLink>
            )}
            {(!p.esPlataforma || org || p.verComo) && (p.verComo?.rol ?? "admin_cliente") === "admin_cliente" && (
              <>
                <NavLink to={conOrg("/mi-empresa")} end className={enlace}><Building2 className="h-4 w-4" />{t("plataforma.nav.miEmpresa")}</NavLink>
                <NavLink to={conOrg("/mi-empresa/plan")} className={enlace}><CreditCard className="h-4 w-4" />{t("plataforma.nav.miPlan")}</NavLink>
              </>
            )}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {p.esPlataforma && !p.verComo && (
              <Button size="sm" variant="outline" onClick={() => setVerComoAbierto(true)}>
                <Eye className="mr-1.5 h-4 w-4" />{t("plataforma.verComo.boton")}
              </Button>
            )}
            {p.yo && (
              <span className="hidden text-xs text-muted-foreground sm:inline" title={p.mostrandoACliente ? undefined : p.yo.correo}>
                {p.yo.nombre}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] px-4 pb-16 pt-6 sm:px-6" key={loc.pathname + (p.verComo?.quien ?? "")}>
        {p.cargandoYo ? <Cargando /> : p.errorYo ? <ErrorConReintento error={p.errorYo} onReintentar={p.reintentarYo} /> : <Suspense fallback={<Cargando />}><Outlet /></Suspense>}
      </main>

      {verComoAbierto && <VerComoDialogo onClose={() => setVerComoAbierto(false)} />}
    </div>
  );
}

/** Solo en la demo: con qué cuenta se mira (dueño, Grace o el admin de un cliente). */
function BarraDeDemo() {
  const { t } = useLanguage();
  const p = usePlataforma();
  const opciones: { k: TipoDeYo; etiqueta: string }[] = [
    { k: "dueno", etiqueta: t("plataforma.demo.dueno") },
    { k: "admin_plataforma", etiqueta: t("plataforma.demo.grace") },
    { k: "admin_cliente", etiqueta: t("plataforma.demo.cliente") },
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-b border-border/60 bg-background/70 px-4 py-1.5 text-xs backdrop-blur" data-demo>
      <FlaskConical className="h-3.5 w-3.5 text-primary" />
      <span className="text-muted-foreground">{t("plataforma.demo.aviso")}</span>
      <div className="flex rounded-lg border border-border/70 p-0.5">
        {opciones.map((o) => (
          <button
            key={o.k}
            type="button"
            onClick={() => p.cambiarIdentidadMock(o.k)}
            className={cn("rounded-md px-2 py-0.5 font-medium", p.identidadMock === o.k ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {o.etiqueta}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Guarda de cada pantalla (lib/plataforma/acceso.ts). */
export function Guarda({ pantalla, children }: { pantalla: PantallaDePlataforma; children: ReactNode }) {
  const p = usePlataforma();
  const [params] = useSearchParams();
  if (!p.yo) return null;
  const org = params.get("org") ?? p.verComo?.organizacion_id ?? null;
  const destino = destinoSinPermiso(pantalla, p.yo, org);
  if (destino) return <Navigate to={destino} replace />;
  return <>{children}</>;
}
