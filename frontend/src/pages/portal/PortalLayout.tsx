import { porHacer, usePedidosDelPortal } from "@/hooks/usePortalPedidos";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { Check, ChevronDown, House, IdCard, Images, Loader2, LogOut, Moon, Settings, ShoppingBag, Sun } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { esCuentaDeCreadora } from "@/lib/portal/cuenta";
import { PORTAL_CERRADO } from "@/lib/modulosOcultos";
import {
  type FichaDeAgencia,
  guardarFichaActiva,
  leerFichaActiva,
  nombreParaMostrar,
  PortalContext,
  useMisFichas,
  usePortalHola,
} from "@/hooks/usePortal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { MarcaM } from "@/components/MarcaM";
import { NavLink } from "@/components/NavLink";
import { UserAvatar } from "@/components/UserAvatar";
import NotificationBell from "@/components/notifications/NotificationBell";
import SelectorDeIdioma from "@/components/dashboard/SelectorDeIdioma";
import { BOTON_TOPBAR } from "@/components/dashboard/topbarStyles";
import { ACTIVE_CLASS, LINK_CLASS } from "@/components/dashboard/estilosDelMenu";
import { SubidasContext, useSubidasDelPortal } from "@/hooks/usePortalContenido";
import AvisoDeSubidas from "./AvisoDeSubidas";
import { cn } from "@/lib/utils";

// EL ESPACIO DE LA CREADORA (portal de creadoras). Va FUERA del AppShell del
// equipo: nada de menú del CRM, Messenger, Cowork, llamadas ni avisos del equipo.
// Pero se ve como Maven (Jhon, 06/10: «hazlo más apegado a lo que es Maven y su
// diseño»): el mismo menú lateral (logo, ítems, la tarjeta de abajo con su foto,
// claro/oscuro y Ajustes) y la misma barra de arriba (idioma y campana). En el
// celular, el menú va abajo, al alcance del pulgar.
//
// Quién entra: solo una cuenta de creadora (app_metadata.tipo). Alguien del equipo
// que llega aquí vuelve a /dashboard; sin sesión, a /portal/entrar.

// Los personalizados (fase 3): con el número de los que le toca hacer.
const RUTA_PEDIDOS = "/portal/pedidos";

const SECCIONES: { a: string; icono: typeof House; etiqueta: TranslationKey; exacta?: boolean }[] = [
  { a: "/portal", icono: House, etiqueta: "portal.nav.inicio", exacta: true },
  { a: "/portal/contenido", icono: Images, etiqueta: "portal.nav.contenido" },
  { a: "/portal/ficha", icono: IdCard, etiqueta: "portal.nav.ficha" },
  { a: RUTA_PEDIDOS, icono: ShoppingBag, etiqueta: "portal.nav.pedidos" },
  { a: "/portal/ajustes", icono: Settings, etiqueta: "portal.nav.ajustes" },
];

// En el computador, Ajustes NO va en el menú (Jhon, 08/10: «es redundante»): ya
// está el engranaje de la tarjeta de abajo. En el celular la tarjeta no está, así
// que en la barra de abajo sí va: es la única entrada a Ajustes.
const RUTA_AJUSTES = "/portal/ajustes";
const SECCIONES_DEL_MENU = SECCIONES.filter((s) => s.a !== RUTA_AJUSTES);

function Pantalla({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
      {children}
    </div>
  );
}

export default function PortalLayout() {
  const { t } = useLanguage();
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const esCreadora = esCuentaDeCreadora(user);
  const fichas = useMisFichas(user && esCreadora ? user.id : null);
  const [elegida, setElegida] = useState<string | null>(leerFichaActiva);

  const activa = useMemo(() => {
    const lista = fichas.data ?? [];
    return lista.find((f) => f.creator_id === elegida) ?? lista[0];
  }, [fichas.data, elegida]);
  usePortalHola(activa?.creator_id);
  // Las subidas viven aquí y no en «Mi contenido»: si ella va a su ficha, siguen.
  const subidas = useSubidasDelPortal();
  // Cuántos pedidos le toca hacer: el número al lado de «Pedidos».
  const pedidos = usePedidosDelPortal(activa?.creator_id ?? "");
  const pedidosPorHacer = porHacer(pedidos.data).length;

  const salir = async () => {
    await signOut();
    navigate("/portal/entrar", { replace: true });
  };

  if (loading) {
    return (
      <Pantalla>
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      </Pantalla>
    );
  }
  if (!user) return <Navigate to="/portal/entrar" replace state={{ from: location }} />;
  if (!esCreadora) return <Navigate to="/dashboard" replace />;
  // Portal cerrado (recorte reversible): la creadora va al aviso de cerrado que
  // vive en /portal/entrar. Reabrir = PORTAL_CERRADO = false en lib/modulosOcultos.ts.
  if (PORTAL_CERRADO) return <Navigate to="/portal/entrar" replace />;

  if (fichas.isLoading) {
    return (
      <Pantalla>
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t("portal.shell.cargando")}</p>
      </Pantalla>
    );
  }
  if (fichas.isError) {
    return (
      <Pantalla>
        <h1 className="text-xl font-semibold">{t("portal.shell.errorTitulo")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t("portal.shell.errorTexto")}</p>
        <Button onClick={() => fichas.refetch()}>{t("portal.shell.reintentar")}</Button>
      </Pantalla>
    );
  }
  if (!activa) {
    return (
      <Pantalla>
        <h1 className="text-xl font-semibold">{t("portal.shell.sinAccesoTitulo")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t("portal.shell.sinAccesoTexto")}</p>
        <Button variant="outline" onClick={salir}>
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("portal.shell.salir")}
        </Button>
      </Pantalla>
    );
  }

  const lista = fichas.data ?? [];
  const elegir = (id: string) => {
    guardarFichaActiva(id);
    setElegida(id);
  };

  const selectorDeAgencia = <SelectorDeAgencia lista={lista} activa={activa} elegir={elegir} />;

  return (
    <PortalContext.Provider value={{ fichas: lista, activa, elegir }}>
    <SubidasContext.Provider value={subidas}>
    <SidebarProvider>
      <div className="flex alto-de-la-app w-full overflow-hidden bg-background text-foreground">
        <MenuDelPortal activa={activa} selectorDeAgencia={lista.length > 1 ? selectorDeAgencia : null} pedidosPorHacer={pedidosPorHacer} />

        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* La barra de arriba de Maven: en el computador, el botón del menú; en el
              celular, su foto y su nombre (el menú va abajo). A la derecha, el idioma
              y la campana; en el celular también claro/oscuro, que en el computador
              está en la tarjeta del menú. */}
          <header className="sticky top-0 z-30 box-content flex h-14 shrink-0 items-center gap-2 border-b border-white/10 bg-background/60 px-3 pt-safe backdrop-blur-xl sm:gap-4 sm:px-4">
            <SidebarTrigger className="hidden md:inline-flex" />
            <div className="flex min-w-0 flex-1 items-center gap-2.5 md:hidden">
              <UserAvatar name={nombreParaMostrar(activa)} src={activa.foto} seed={activa.creator_id} size="sm" />
              <span className="truncate font-semibold">{nombreParaMostrar(activa)}</span>
            </div>
            <div className="hidden min-w-0 flex-1 md:block" />
            <div className="flex shrink-0 items-center gap-1">
              {lista.length > 1 && <div className="md:hidden">{selectorDeAgencia}</div>}
              <SelectorDeIdioma />
              <BotonDeTema className={cn(BOTON_TOPBAR, "md:hidden")} />
              <NotificationBell verTodas={null} />
            </div>
          </header>

          {/* Cada página trae su <Page> (y su scroll); aquí solo el aire para el menú de abajo. */}
          <div className="flex min-h-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
            <Outlet />
          </div>

          {/* Si sube algo y ella está en otra pantalla, el aviso abajo (en el
              celular, justo arriba del menú). */}
          {!location.pathname.startsWith("/portal/contenido") && (
            <div className="absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 md:bottom-0">
              <AvisoDeSubidas />
            </div>
          )}
          <nav
            aria-label={t("portal.nav.menu")}
            className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
          >
            {SECCIONES.map(({ a, icono: Icono, etiqueta, exacta }) => (
              <NavLink
                key={a}
                to={a}
                end={exacta}
                className="flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                activeClassName="text-primary"
              >
                <span className="relative">
                  <Icono className="h-6 w-6" aria-hidden="true" />
                  {a === RUTA_PEDIDOS && pedidosPorHacer > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-[18px] text-primary-foreground">
                      {pedidosPorHacer > 9 ? "9+" : pedidosPorHacer}
                    </span>
                  )}
                </span>
                {t(etiqueta)}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </SidebarProvider>
    </SubidasContext.Provider>
    </PortalContext.Provider>
  );
}

/** El menú lateral de Maven (computador): el logo, sus secciones con los ítems de
 *  Maven y abajo la tarjeta con su foto, claro/oscuro y Ajustes. Plegado, queda
 *  el riel de iconos, como en Maven. */
function MenuDelPortal({ activa, selectorDeAgencia, pedidosPorHacer }: { activa: FichaDeAgencia; selectorDeAgencia: React.ReactNode; pedidosPorHacer: number }) {
  const { t } = useLanguage();
  const { state } = useSidebar();
  const plegado = state === "collapsed";
  return (
    <Sidebar collapsible="icon">
      {/* La marca chica con «Mi espacio» al lado (Jhon, 06/10: el logo grande de
          Maven le quitaba aire; plegado, queda la baldosa). */}
      <SidebarHeader className={cn("flex h-16 shrink-0 flex-row items-center", plegado ? "justify-center px-2" : "px-4")}>
        <Link
          to="/portal"
          aria-label={t("portal.nav.inicio")}
          className="flex min-w-0 items-center gap-2.5 rounded-control transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-primary">
            <MarcaM alto="13px" />
          </span>
          {!plegado && <span className="truncate font-semibold">{t("portal.shell.espacio")}</span>}
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-0.5 overflow-x-hidden px-2 py-1">
        <SidebarMenu aria-label={t("portal.nav.menu")}>
          {SECCIONES_DEL_MENU.map(({ a, icono: Icono, etiqueta, exacta }) => (
            <SidebarMenuItem key={a}>
              <SidebarMenuButton asChild tooltip={t(etiqueta)}>
                {/* El iluminado de Maven (ACTIVE_CLASS) con el tamaño de antes: ítems de
                    44 px e íconos más grandes, cómodos también con el dedo. */}
                <NavLink to={a} end={exacta} className={cn(LINK_CLASS, "min-h-11 gap-3 px-3 font-medium")} activeClassName={ACTIVE_CLASS}>
                  <Icono className="h-5 w-5 shrink-0" />
                  <span className="flex-1">{t(etiqueta)}</span>
                  {a === RUTA_PEDIDOS && pedidosPorHacer > 0 && !plegado && (
                    <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold leading-5 tabular-nums text-primary-foreground">
                      {pedidosPorHacer > 99 ? "99+" : pedidosPorHacer}
                    </span>
                  )}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="border-t border-border p-3">
        <TarjetaDeLaCreadora activa={activa} plegado={plegado} selectorDeAgencia={selectorDeAgencia} />
      </SidebarFooter>
    </Sidebar>
  );
}

/** La tarjeta de abajo del menú, como la del equipo en Maven: su foto (la de su
 *  ficha; sin foto, su muñequito), su nombre y su agencia, claro/oscuro y el
 *  engranaje de Ajustes (en Ajustes, el engranaje vuelve a donde estaba). */
function TarjetaDeLaCreadora({ activa, plegado, selectorDeAgencia }: { activa: FichaDeAgencia; plegado: boolean; selectorDeAgencia: React.ReactNode }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const enAjustes = pathname.startsWith(RUTA_AJUSTES);
  const [volverA, setVolverA] = useState("/portal");
  const engranaje = () => {
    if (enAjustes) return navigate(volverA);
    setVolverA(pathname);
    navigate(RUTA_AJUSTES);
  };
  const nombre = nombreParaMostrar(activa);
  const avatar = <UserAvatar name={nombre} src={activa.foto} seed={activa.creator_id} size={plegado ? "sm" : "md"} />;
  const botonAjustes = (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8 shrink-0 rounded-full", enAjustes ? "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary" : "text-muted-foreground")}
      onClick={engranaje}
      title={t("portal.nav.ajustes")}
      aria-label={t("portal.nav.ajustes")}
      aria-pressed={enAjustes}
    >
      <Settings className="h-4 w-4" />
    </Button>
  );

  if (plegado) {
    return (
      <div className="flex flex-col items-center gap-2">
        {avatar}
        <BotonDeTema className="h-8 w-8 rounded-full text-muted-foreground" />
        {botonAjustes}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/70 p-2">
        <div className="shrink-0">{avatar}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-tight">{nombre}</div>
          <div className="truncate text-xs text-muted-foreground">{t("portal.shell.agencia", { agencia: activa.agencia })}</div>
        </div>
        <BotonDeTema className="h-8 w-8 shrink-0 rounded-full text-muted-foreground" />
        {botonAjustes}
      </div>
      {selectorDeAgencia}
    </div>
  );
}

/** Sol o luna: claro y oscuro, como en Maven. */
function BotonDeTema({ className }: { className?: string }) {
  const { t } = useLanguage();
  const { resolvedTheme, setTheme } = useTheme();
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;
  const oscuro = resolvedTheme === "dark";
  const texto = t(oscuro ? "topbar.lightMode" : "topbar.darkMode");
  return (
    <Button variant="ghost" size="icon" className={className} onClick={() => setTheme(oscuro ? "light" : "dark")} title={texto} aria-label={texto}>
      {oscuro ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

/** Con más de una agencia, para cambiar de una a otra. */
function SelectorDeAgencia({ lista, activa, elegir }: { lista: FichaDeAgencia[]; activa: FichaDeAgencia; elegir: (id: string) => void }) {
  const { t } = useLanguage();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t("portal.shell.cambiarAgencia")}
      >
        <span className="truncate">{activa.agencia}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>{t("portal.shell.cambiarAgencia")}</DropdownMenuLabel>
        {lista.map((f) => (
          <DropdownMenuItem key={f.creator_id} onSelect={() => elegir(f.creator_id)} className="min-h-11 gap-2">
            <Check className={cn("h-4 w-4", f.creator_id === activa.creator_id ? "opacity-100" : "opacity-0")} aria-hidden="true" />
            <span className="truncate">{f.agencia}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
