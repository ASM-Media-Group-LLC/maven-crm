import { Suspense, useMemo, useState, type ReactNode } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Building2, Eye, EyeOff, Presentation, Undo2, Users, CreditCard, LayoutGrid, FlaskConical, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { useLanguage } from "@/hooks/useLanguage";
import { claveDeError, modoPlataforma, type TipoDeYo } from "@/lib/plataforma";
import { crearPlataformaSupabase, type ClienteDelEdificio } from "@/lib/plataforma/supabase";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  if (modo === "edificio") return <CasaDelEdificio />;
  return (
    <PlataformaProvider>
      <Casa />
    </PlataformaProvider>
  );
}

/** Los datos REALES (pestaña conectada al edificio). Pide sesión; quién entra a qué lo
 *  dice quien_soy_en_la_plataforma (Casa → errorYo «sin_permiso» = vuelve a /dashboard). */
function CasaDelEdificio() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  // En una pestaña del edificio, este cliente YA es el del edificio (lib/conexionSupabase.ts).
  const datos = useMemo(() => crearPlataformaSupabase(supabase as unknown as ClienteDelEdificio), []);
  if (loading) return <div className="fondo-glass min-h-dvh"><Cargando /></div>;
  if (!user) return <Navigate to={`/login?returnTo=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return (
    <PlataformaProvider datos={datos}>
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

  // MENÚ A LA IZQUIERDA (19/11/2026, Alvaro: «Clientes» en el menú izquierdo de la cuenta
  // de la plataforma). En el teléfono va arriba, a lo ancho.
  const enlace = ({ isActive }: { isActive: boolean }) => cn(
    "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors lg:flex lg:w-full",
    isActive ? "sidebar-glass-active text-foreground" : "text-muted-foreground sidebar-glass-hover hover:text-foreground",
  );

  // Ni plataforma ni admin de un cliente (cuenta del edificio de una agencia): su casa es el tablero.
  if (claveDeError(p.errorYo) === "sin_permiso") return <Navigate to="/dashboard" replace />;

  return (
    <div className="fondo-glass min-h-dvh text-foreground">
      {p.esMock && <BarraDeDemo />}
      {p.verComo && (
        <div className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-3 border-b border-warning/40 bg-warning/90 px-4 py-2 text-sm font-medium text-black">
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

      <div className="mx-auto flex max-w-[1500px] flex-col gap-2 px-4 pt-4 sm:px-6 lg:flex-row lg:items-start lg:gap-5">
        <aside className="vidrio-barra flex w-full flex-col gap-2 p-3 lg:sticky lg:top-4 lg:w-56 lg:shrink-0" data-menu-plataforma>
          <div className="flex items-center gap-2 px-1 pb-1">
            <Logo size="xs" />
            <span className="text-[11px] font-semibold text-muted-foreground">
              {p.esPlataforma && !p.verComo ? t("plataforma.etiqueta") : t("plataforma.etiquetaCliente")}
            </span>
          </div>
          <nav className="flex flex-wrap items-center gap-1 lg:flex-col lg:items-stretch">
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
          <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2 lg:flex-col lg:items-stretch">
            {p.esPlataforma && !p.verComo && (
              <Button size="sm" variant="outline" onClick={() => setVerComoAbierto(true)}>
                <Eye className="mr-1.5 h-4 w-4" />{t("plataforma.verComo.boton")}
              </Button>
            )}
            {p.yo && (
              <span className="truncate px-1 text-xs text-muted-foreground" title={p.mostrandoACliente ? undefined : p.yo.correo}>
                {p.yo.nombre}
              </span>
            )}
            {!p.esMock && <BotonSalir />}
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-16" key={loc.pathname + (p.verComo?.quien ?? "")}>
          {p.cargandoYo ? <Cargando /> : p.errorYo ? <ErrorConReintento error={p.errorYo} onReintentar={p.reintentarYo} /> : <Suspense fallback={<Cargando />}><Outlet /></Suspense>}
        </main>
      </div>

      {verComoAbierto && <VerComoDialogo onClose={() => setVerComoAbierto(false)} />}
    </div>
  );
}

/** Salir de la cuenta de la plataforma (solo con datos reales). */
function BotonSalir() {
  const { t } = useLanguage();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <Button size="sm" variant="ghost" className="justify-start text-muted-foreground" onClick={async () => { await signOut(); navigate("/login", { replace: true }); }}>
      <LogOut className="mr-1.5 h-4 w-4" />{t("plataforma.salir")}
    </Button>
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
            className={cn("rounded-control px-2 py-0.5 font-medium", p.identidadMock === o.k ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
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
