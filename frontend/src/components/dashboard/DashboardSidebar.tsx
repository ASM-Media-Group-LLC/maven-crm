import {
  LayoutDashboard, Users, UserPlus, Settings, ChevronRight,
  Bot, Activity, Megaphone, Phone, Smartphone, Ticket, Palette, FileText, Shield, ClipboardCheck, Map,
  UserCog, BookOpen, AlertTriangle, UserCheck, Clock, Eye, GraduationCap, Wallet, Calculator, BarChart3, DollarSign, Gauge,
  MessageCircle, Rocket, Sun, Moon, Home, Briefcase, Users2, Search, Headphones, Inbox, Bell, Video,
  Mail, Clapperboard, CalendarRange, CalendarDays, Gift, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { useMyProfile } from "@/hooks/useUserProfile";
import { useUnreadChatCount } from "@/hooks/useUnreadChatCount";
import { useSidebarBadges } from "@/hooks/useSidebarBadges";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { precargarRuta, precargarEnOcio } from "@/lib/prefetchRutas";
import Logo from "@/components/Logo";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar, SidebarContent,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub,
  SidebarMenuSubItem, SidebarMenuSubButton, SidebarFooter, SidebarSeparator, useSidebar,
} from "@/components/ui/sidebar";
import { useLanguage } from "@/hooks/useLanguage";
import { usePermissions } from "@/hooks/usePermissions";
import { CollapsibleSidebarGroup } from "@/components/dashboard/CollapsibleSidebarGroup";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon";
import TelegramIcon from "@/components/icons/TelegramIcon";
import { cn } from "@/lib/utils";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { getStatusColor } from "@/pages/messenger/components/StatusPicker";

// Ítem dentro de un grupo: cuelga de la guía vertical del grupo, 40 px de alto.
const LINK_CLASS = "flex items-center gap-2.5 rounded-xl px-2 py-2.5 text-sm sidebar-glass-hover";

// Tinte del badge por módulo (mockup "Maven sin corbata"): cada contador con
// el color de su módulo en vez de rojo genérico. El rojo queda reservado para
// lo urgente (Telegram sin leer). El número no cambia.
const BADGE_TINTS: Record<string, string> = {
  Promolog: "bg-primary/15 text-primary",
  Correo: "bg-primary/15 text-primary",
  LeadGen: "bg-accent/15 text-accent",
  Closers: "bg-warning/15 text-warning",
  WhatsApp: "bg-success/15 text-success",
  Messenger: "bg-success/15 text-success",
  Telegram: "bg-success/15 text-success",
};
const badgeTint = (module: string | undefined): string =>
  (module && BADGE_TINTS[module]) || "bg-destructive text-destructive-foreground";

// Contadores compactos como el mockup: 6929 → "6.9k". Debajo de 1000 el
// número va tal cual; el valor exacto queda en el title de la fila.
const compactBadge = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k` : String(n);
const ACTIVE_CLASS = "sidebar-glass-active font-medium";

// Picks the URL with the LONGEST prefix match against `pathname`. Sin
// esto, dos items hermanos cuyas URLs se solapan (ej: /hr/horarios y
// /hr/horarios/horas-extras) se marcan activos a la vez. Aplica a los
// sub-items de Finanzas/RRHH renderizados con SidebarMenuSubButton.
const pickActiveUrl = (urls: string[], pathname: string): string | null => {
  let best: string | null = null;
  for (const u of urls) {
    if (pathname === u || pathname.startsWith(u + "/")) {
      if (!best || u.length > best.length) best = u;
    }
  }
  return best;
};

const DashboardSidebar = () => {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  // En móvil el sidebar es un Sheet overlay: cerrarlo al navegar para que la
  // pantalla destino no quede tapada por el drawer (un tap menos por navegación).
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname, isMobile, setOpenMobile]);
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { canAccess, isLoading: permisosCargando, hayError: permisosFallaron, reintentar: reintentarPermisos } = usePermissions();

  const unreadChatCount = useUnreadChatCount();
  const { promologCount, leadgenCount, closersCount, waInboxCount, tgInboxCount, coworkRequestsCount, correoUnreadCount } = useSidebarBadges();

  const mainMenuAll: { title: string; url: string; icon: any; module: string; badge?: number }[] = [
    { title: t("nav.dashboard"), url: "/dashboard", icon: LayoutDashboard, module: "Dashboard" },
    { title: "Correo", url: "/correo", icon: Mail, module: "Correo", badge: correoUnreadCount || undefined },
    // El mute del Messenger vive en la cabecera de su lista de chats, al lado
    // del "+" (Jhon, 09/09/2026); WhatsApp y Telegram lo siguen teniendo acá.
    { title: "Messenger", url: "/messenger", icon: MessageCircle, module: "Messenger", badge: unreadChatCount || undefined },
    { title: "Cowork", url: "/cowork", icon: Users2, module: "Cowork", badge: coworkRequestsCount || undefined },
    { title: "Meet", url: "/meet", icon: Video, module: "Meet" },
    { title: "Grabaciones", url: "/grabaciones", icon: Clapperboard, module: "Grabaciones" },
    { title: t("nav.contacts"), url: "/contactos", icon: UserPlus, module: "Contactos" },
  ];
  const mainMenu = mainMenuAll.filter((item) => canAccess(item.module));

  const creadoresSubItems = [
    { title: "Dashboard", url: "/creadores/dashboard", submodule: "Dashboard" },
    { title: "Listado", url: "/creadores", submodule: "Lista" },
    { title: "Onboarding", url: "/creadores/onboarding", submodule: "Onboarding" },
    { title: "Offboarding", url: "/creadores/offboarding", submodule: "Offboarding" },
  ].filter(item => canAccess("Creadores", item.submodule));

  const allCreadoresItems = creadoresSubItems;
  const isCreadoresActive = allCreadoresItems.some((item) =>
    item.url === "/creadores" ? pathname === "/creadores" : pathname.startsWith(item.url)
  );

  const operationsMenuAll: { title: string; url: string; icon: any; badge?: number; module: string; submodule: string | undefined }[] = [
    { title: t("nav.promolog"), url: "/promolog", icon: Megaphone, badge: promologCount || undefined, module: "Promolog", submodule: undefined },
    { title: "Parrilla", url: "/parrilla", icon: CalendarRange, module: "Parrilla", submodule: undefined },
    { title: "Personalizados", url: "/personalizados", icon: Gift, module: "Personalizados", submodule: undefined },
    { title: t("nav.leadgen"), url: "/leadgen", icon: Activity, badge: leadgenCount || undefined, module: "LeadGen", submodule: undefined },
    { title: t("nav.closers"), url: "/closers", icon: Phone, badge: closersCount || undefined, module: "Closers", submodule: undefined },
    { title: "Teléfonos", url: "/telefonos", icon: Smartphone, module: "Telefonos", submodule: undefined },
    { title: "WhatsApp", url: "/inbox", icon: WhatsAppIcon, badge: waInboxCount || undefined, module: "WhatsApp", submodule: undefined },
    { title: "Telegram", url: "/telegram/bandeja", icon: TelegramIcon, badge: tgInboxCount || undefined, module: "Telegram", submodule: undefined },
    { title: t("nav.tickets"), url: "/tickets", icon: Ticket, module: "Tickets", submodule: undefined },
    { title: "Chatter Evaluator", url: "/chatter-evaluator", icon: ClipboardCheck, module: "Chatters", submodule: "Evaluator" as string | undefined },
    { title: "Chatters · Rendimiento", url: "/chatter-evaluator/rendimiento", icon: Gauge, module: "Chatters", submodule: "Rendimiento" as string | undefined },
    { title: "Chatters · Horarios", url: "/chatters/horarios", icon: CalendarDays, module: "Chatters", submodule: "Horarios" as string | undefined },
    { title: "Scouter Assist", url: "/scouter-assist", icon: Search, module: "Scouter Assist", submodule: undefined },
    { title: "Company QA", url: "/agency-qa", icon: Headphones, module: "Agency QA", submodule: undefined },
  ];
  const operationsMenu = operationsMenuAll.filter((item) => canAccess(item.module, item.submodule));

  // Precarga en ocio de lo que ESTA persona ve en el menú (lib/prefetchRutas):
  // de a una, espaciadas, nunca en llamada. Así la primera vez que toca una
  // sección ya está bajada y no ve la barra de carga. Corre una vez, cuando ya
  // se sabe qué puede ver; si cambian los permisos, se rearma con la lista nueva.
  const urlsVisibles = [...mainMenu, ...operationsMenu].map((i) => i.url).join("|");
  useEffect(() => {
    if (permisosCargando || !urlsVisibles) return;
    return precargarEnOcio(urlsVisibles.split("|"));
  }, [permisosCargando, urlsVisibles]);

  // El Dashboard Ventas ya no es un ítem aparte: para management ES el
  // Dashboard (ver pages/Dashboard.tsx). /dashboard2 sigue respondiendo para
  // los links guardados, y en ese caso el menú marca "Dashboard".
  const enDashboardVentas = pathname === "/dashboard2";

  type HRItem = { title: string; url: string | null; submodule?: string };
  type HRSubGroup = { label: string; key: string; items: HRItem[] };
  type HRGroup = {
    label: string;
    icon: typeof Clock;
    key: string;
    items?: HRItem[];
    subGroups?: HRSubGroup[];
  };

  const hrGroupsAll: HRGroup[] = [
    {
      label: "Employee Lifecycle",
      icon: UserCheck,
      key: "lifecycle",
      items: [
        { title: "Personal", url: "/hr/personal", submodule: "Empleados Activos" },
        { title: "Candidatos", url: "/hr/candidatos", submodule: "Candidatos" },
        { title: "Onboarding", url: "/hr/onboarding", submodule: "Onboarding" },
        { title: "Empleados Activos", url: "/hr/directorio", submodule: "Empleados Activos" },
        { title: "Offboarding", url: "/hr/offboarding", submodule: "Offboarding" },
      ],
    },
    {
      label: "Gestión Laboral",
      icon: Clock,
      key: "gestion",
      subGroups: [
        {
          label: "Control de Tiempo",
          key: "tiempo",
          items: [
            { title: "Asistencia", url: "/hr/asistencia", submodule: "Asistencia" },
            { title: "Horarios y Turnos", url: "/hr/horarios", submodule: "Horarios" },
            { title: "Horario del personal", url: "/hr/horarios-personal", submodule: "Horarios" },
            { title: "Horarios Chatters", url: "/hr/horarios-chatters", submodule: "Horarios Chatters" },
            { title: "Horas Extra", url: "/hr/horarios/horas-extras", submodule: "Horas Extra" },
            { title: "Banco de Horas", url: "/hr/horarios/banco-horas", submodule: "Banco de Horas" },
          ],
        },
        {
          label: "Ausencias",
          key: "ausencias",
          items: [
            { title: "Vacaciones", url: "/hr/vacaciones", submodule: "Vacaciones" },
            { title: "Permisos", url: "/hr/permisos", submodule: "Permisos" },
          ],
        },
      ],
      items: [
        { title: "Monitoreo", url: "/hr/monitoreo", submodule: "Monitoreo" },
      ],
    },
    {
      label: "Seguimiento",
      icon: Eye,
      key: "seguimiento",
      items: [
        { title: "Incidentes", url: "/hr/incidentes", submodule: "Incidentes" },
      ],
    },
    {
      label: "Desarrollo & Performance",
      icon: GraduationCap,
      key: "desarrollo",
      items: [
        { title: "Desempeño", url: "/hr/desempeno", submodule: "Desempeño" },
        { title: "Capacitación", url: "/hr/capacitacion", submodule: "Capacitación" },
      ],
    },
    {
      label: "Organización",
      icon: Users,
      key: "organizacion",
      items: [
        { title: "Directorio", url: "/hr/organizacion/directorio", submodule: "Directorio" },
        { title: "Organigrama", url: "/hr/organizacion/organigrama", submodule: "Organigrama" },
      ],
    },
    {
      label: "Finanzas Operativas",
      icon: Wallet,
      key: "finanzas",
      items: [
        { title: "Nómina y costo", url: "/hr/nomina", submodule: "Deducciones" },
        { title: "Deducciones", url: "/hr/deducciones", submodule: "Deducciones" },
      ],
    },
    {
      label: "Comunicación",
      icon: Bell,
      key: "comunicacion",
      items: [
        { title: "Anuncios Internos", url: "/hr/anuncios", submodule: "Anuncios" },
      ],
    },
  ];

  // Filter HR items the role can't actually reach so the sidebar
  // doesn't show entries that just bounce back to /dashboard.
  const filterHRItems = (items?: HRItem[]) =>
    items?.filter((i) => !i.submodule || canAccess("HR", i.submodule));
  const hrGroups: HRGroup[] = hrGroupsAll
    .map((g) => ({
      ...g,
      items: filterHRItems(g.items),
      subGroups: g.subGroups
        ?.map((sg) => ({ ...sg, items: filterHRItems(sg.items) ?? [] }))
        .filter((sg) => sg.items.length > 0),
    }))
    .filter(
      (g) => (g.items && g.items.length > 0) || (g.subGroups && g.subGroups.length > 0),
    );

  const showHRDashboard = canAccess("HR", "Dashboard");

  // Helper to get all URLs from a group (including subGroups)
  const getGroupUrls = (group: HRGroup): string[] => {
    const urls: string[] = [];
    if (group.items) urls.push(...group.items.filter(i => i.url).map(i => i.url!));
    if (group.subGroups) group.subGroups.forEach(sg => urls.push(...sg.items.filter(i => i.url).map(i => i.url!)));
    return urls;
  };

  // Longest-prefix-wins entre TODOS los sub-items de RRHH (cruzando
  // groups y subGroups), para que solo uno quede activo aunque sus
  // URLs se solapen (ej: /hr/horarios vs /hr/horarios/horas-extras).
  const hrActiveUrl = pickActiveUrl(hrGroups.flatMap(getGroupUrls), pathname);

  // Flat list for collapsed dropdown
  const hrFlatItems = hrGroups.flatMap((g) => {
    const items: { title: string; url: string }[] = [];
    if (g.items)
      items.push(
        ...g.items
          .filter((i): i is HRItem & { url: string } => i.url !== null)
          .map((i) => ({ title: i.title, url: i.url })),
      );
    if (g.subGroups)
      g.subGroups.forEach((sg) =>
        items.push(
          ...sg.items
            .filter((i): i is HRItem & { url: string } => i.url !== null)
            .map((i) => ({ title: i.title, url: i.url })),
        ),
      );
    return items;
  });

  const isHRActive = pathname === "/hr" || pathname.startsWith("/hr/");

  const rrhhCollapsedItems: Array<
    | { kind?: "item"; title: string; url: string }
    | { kind: "label"; title: string }
    | { kind: "separator" }
  > = [
    ...(showHRDashboard ? [{ title: "Dashboard HR", url: "/hr" }] : []),
    ...hrGroups.flatMap((g) => {
      const flat: Array<{ title: string; url: string }> = [];
      if (g.items)
        flat.push(
          ...g.items
            .filter((i): i is HRItem & { url: string } => i.url !== null)
            .map((i) => ({ title: i.title, url: i.url })),
        );
      if (g.subGroups)
        g.subGroups.forEach((sg) =>
          flat.push(
            ...sg.items
              .filter((i): i is HRItem & { url: string } => i.url !== null)
              .map((i) => ({ title: i.title, url: i.url })),
          ),
        );
      return flat.length > 0
        ? ([
            { kind: "separator" } as const,
            { kind: "label", title: g.label } as const,
            ...flat,
          ])
        : [];
    }),
  ];

  type CI =
    | { kind?: "item"; title: string; url: string }
    | { kind: "label"; title: string }
    | { kind: "separator" };

  const menuCollapsedItems: CI[] = [
    ...mainMenu.map((i) => ({ title: i.title, url: i.url })),
    ...(canAccess("Creadores") && allCreadoresItems.length > 0
      ? ([
          { kind: "separator" } as const,
          { kind: "label", title: t("nav.creators") } as const,
          ...allCreadoresItems.map((i) => ({ title: i.title, url: i.url })),
        ] as CI[])
      : []),
  ];
  const isMenuActive =
    mainMenu.some((i) => pathname === i.url || pathname.startsWith(i.url + "/")) ||
    isCreadoresActive ||
    enDashboardVentas;

  const operationsCollapsedItems: CI[] = operationsMenu.map((i) => ({
    title: i.title,
    url: i.url,
  }));
  const isOperationsActive = operationsMenu.some(
    (i) => pathname === i.url || pathname.startsWith(i.url + "/")
  );
  // Gana la coincidencia MAS ESPECIFICA — mismo criterio que RRHH. Sin esto,
  // /chatter-evaluator/rendimiento encendia tambien a "Chatter Evaluator",
  // porque NavLink marca por prefijo. Poner `end` no alcanzaba: dejaria al
  // padre apagado en sus propias subpaginas que no estan en el menu
  // (historial, admin, workspace).
  const operationsActiveUrl = pickActiveUrl(operationsMenu.map((i) => i.url), pathname);

  // Mientras no sepamos qué puede ver, NO se dibuja un menú recortado.
  //
  // `canAccess` cae a los módulos universales (Dashboard, Correo, Messenger,
  // Cowork, Meet, Grabaciones) cuando falta el rol — correcto por seguridad,
  // pero mostrarlo como si fuera el menú de la persona es lo que hacía pensar
  // que la sesión se había caído: desaparecían Operaciones, Finanzas, RRHH y
  // Panel de Control de golpe. Cargando se muestran huesos; si falló, se dice
  // qué pasó y se puede reintentar sin recargar la página.
  if (permisosCargando || permisosFallaron) {
    return (
      <Sidebar collapsible="icon">
        <SidebarHeader className="flex h-14 flex-row items-center justify-start px-5 border-b border-border shrink-0">
          <Link
          to="/dashboard"
          aria-label="Ir al Dashboard"
          className="rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Logo size="sm" collapsed={collapsed} />
        </Link>
        </SidebarHeader>
        <SidebarContent className="gap-2 px-3 py-3">
          {permisosFallaron ? (
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/40 p-3">
              <p className="text-xs font-medium">No pudimos cargar tu menú</p>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Fue la conexión, no tu cuenta. Sigues con la sesión abierta.
              </p>
              <Button size="sm" variant="secondary" className="h-7 w-full gap-1.5 text-xs" onClick={reintentarPermisos}>
                <RefreshCw className="h-3 w-3" />
                Reintentar
              </Button>
            </div>
          ) : (
            Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded-md bg-muted/50" />
            ))
          )}
        </SidebarContent>
      </Sidebar>
    );
  }

  return (
    <Sidebar collapsible="icon">
      {/* Rediseño 09/2026: la marca va centrada y con aire arriba (como en el
          resto de las plataformas de Unlimited), sin línea debajo: el menú
          arranca solo. En el rail plegado queda la baldosa. */}
      <SidebarHeader className="flex h-20 flex-row items-center justify-center px-4 shrink-0">
        <Link
          to="/dashboard"
          aria-label="Ir al Dashboard"
          className="rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Logo size={collapsed ? "sm" : "md"} collapsed={collapsed} />
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0.5 px-2 py-1">
        <CollapsibleSidebarGroup
          label={t("sidebar.menu")}
          storageKey="menu"
          icon={Home}
          active={isMenuActive}
          collapsedItems={menuCollapsedItems}
        >
            <SidebarMenu>
              {mainMenu.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink to={item.url} end={item.url === "/dashboard"} className={LINK_CLASS} activeClassName={ACTIVE_CLASS} onMouseEnter={() => precargarRuta(item.url)} onFocus={() => precargarRuta(item.url)}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.title}</span>
                      {"badge" in item && item.badge != null && (
                        <span className={`ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${badgeTint(item.module)}`}>
                          {compactBadge(item.badge)}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {/* Creadores — single link to dashboard; submenu vive como subtabs en la página */}
              {canAccess("Creadores") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip={t("nav.creators")}>
                    <button type="button" onClick={() => navigate("/creadores/dashboard")} className={`${LINK_CLASS} ${isCreadoresActive ? ACTIVE_CLASS : ""} w-full text-left`}>
                      <Users className="h-4 w-4 shrink-0" />
                      <span>{t("nav.creators")}</span>
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

            </SidebarMenu>
        </CollapsibleSidebarGroup>

        {operationsMenu.length > 0 && (
        <CollapsibleSidebarGroup
          label={t("sidebar.operations")}
          storageKey="operations"
          icon={Briefcase}
          active={isOperationsActive}
          collapsedItems={operationsCollapsedItems}
        >
            <SidebarMenu>
              {operationsMenu.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink to={item.url} className={cn(LINK_CLASS, item.url === operationsActiveUrl && ACTIVE_CLASS)} onMouseEnter={() => precargarRuta(item.url)} onFocus={() => precargarRuta(item.url)}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.title}</span>
                      {"badge" in item && item.badge != null && (
                        <span className={`ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${badgeTint(item.module)}`}>
                          {compactBadge(item.badge)}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
        </CollapsibleSidebarGroup>
        )}

        {/* ── Finanzas ────────────────────────────────────────────── */}
        {canAccess("Finanzas") && (() => {
          type FinItem = { title: string; url: string; submodule: string };
          type FinGroup = { label: string; icon: typeof Wallet; key: string; items: FinItem[] };

          const finanzasGroupsAll: FinGroup[] = [
            {
              label: "Operaciones",
              icon: Calculator,
              key: "fin-ops",
              items: [
                { title: "Nómina", url: "/finanzas/nomina", submodule: "Nómina" },
                { title: "Horas & Variables", url: "/finanzas/horas-variables", submodule: "Horas Variables" },
              ],
            },
            {
              label: "Facturación",
              icon: FileText,
              key: "fin-fact",
              items: [
                { title: "Invoices", url: "/finanzas/facturacion/invoices", submodule: "Invoices" },
                { title: "Templates", url: "/finanzas/facturacion/templates", submodule: "Templates" },
              ],
            },
            {
              label: "Análisis",
              icon: BarChart3,
              key: "fin-analysis",
              items: [
                { title: "Control Financiero", url: "/finanzas/control", submodule: "Control Financiero" },
                { title: "Reportes Avanzados", url: "/finanzas/reportes", submodule: "Reportes" },
              ],
            },
            {
              label: "Configuración",
              icon: Settings,
              key: "fin-config",
              items: [
                { title: "Config. Financiera", url: "/finanzas/configuracion", submodule: "Configuración" },
              ],
            },
          ];

          const finanzasGroups: FinGroup[] = finanzasGroupsAll
            .map((g) => ({
              ...g,
              items: g.items.filter((i) => canAccess("Finanzas", i.submodule)),
            }))
            .filter((g) => g.items.length > 0);

          const showFinDashboard = canAccess("Finanzas", "Dashboard");
          const showFinCollections = canAccess("Finanzas", "Collections");

          const finFlatItems = [
            ...(showFinDashboard ? [{ title: "Dashboard", url: "/finanzas" }] : []),
            ...(showFinCollections ? [{ title: "Collections", url: "/finanzas/collections" }] : []),
            ...finanzasGroups.flatMap(g => g.items.map(i => ({ title: i.title, url: i.url }))),
          ];

          const isFinanzasActive = pathname === "/finanzas" || pathname.startsWith("/finanzas/");

          // Longest-prefix-wins entre todos los sub-items de Finanzas,
          // para que solo uno quede marcado activo aunque sus URLs se
          // solapen (ver pickActiveUrl).
          const finActiveUrl = pickActiveUrl(
            finanzasGroups.flatMap((g) => g.items.map((i) => i.url)),
            pathname,
          );

          const finCollapsedItems: CI[] = [
            { title: "Dashboard Financiero", url: "/finanzas" },
            { title: "Collections", url: "/finanzas/collections" },
            ...finanzasGroups.flatMap((g) => [
              { kind: "separator" } as const,
              { kind: "label", title: g.label } as const,
              ...g.items.map((i) => ({ title: i.title, url: i.url })),
            ]),
          ];

          return (
            <CollapsibleSidebarGroup
              label="Finanzas"
              storageKey="finanzas"
              icon={Wallet}
              active={isFinanzasActive}
              collapsedItems={finCollapsedItems}
            >
                <SidebarMenu>
                  {collapsed ? (
                    <SidebarMenuItem>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuButton tooltip="Finanzas" className={`sidebar-glass-hover ${isFinanzasActive ? "sidebar-glass-active font-medium" : ""}`}>
                            <Wallet className="h-4 w-4 shrink-0" />
                            <span>Finanzas</span>
                          </SidebarMenuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start" className="min-w-[180px]">
                          {finFlatItems.map((item) => (
                            <DropdownMenuItem key={item.url} onClick={() => navigate(item.url)} className={pathname === item.url ? "bg-accent text-accent-foreground font-medium" : ""}>
                              {item.title}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  ) : (
                    <>
                      {showFinDashboard && (
                        <SidebarMenuItem>
                          <SidebarMenuButton asChild tooltip="Dashboard Financiero">
                            <NavLink to="/finanzas" end className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                              <LayoutDashboard className="h-4 w-4 shrink-0" />
                              <span>Dashboard Financiero</span>
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}

                      {showFinCollections && (
                        <SidebarMenuItem>
                          <SidebarMenuButton asChild tooltip="Collections">
                            <NavLink to="/finanzas/collections" className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                              <DollarSign className="h-4 w-4 shrink-0" />
                              <span>Collections</span>
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}

                      {finanzasGroups.map((group) => {
                        const isGroupActive = group.items.some(i => pathname === i.url || pathname.startsWith(i.url + "/"));
                        return (
                          <Collapsible key={group.key} defaultOpen={isGroupActive} className={`group/fin-${group.key}`}>
                            <SidebarMenuItem>
                              <CollapsibleTrigger asChild>
                                <SidebarMenuButton tooltip={group.label} className="sidebar-glass-hover">
                                  <group.icon className="h-4 w-4 shrink-0" />
                                  <span>{group.label}</span>
                                  <ChevronRight className={`ml-auto h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]/fin-${group.key}:rotate-90`} />
                                </SidebarMenuButton>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <SidebarMenuSub>
                                  {group.items.map((item) => (
                                    <SidebarMenuSubItem key={item.url}>
                                      <SidebarMenuSubButton asChild isActive={item.url === finActiveUrl} className="sidebar-glass-hover data-[active=true]:sidebar-glass-active">
                                        <NavLink to={item.url}>{item.title}</NavLink>
                                      </SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                  ))}
                                </SidebarMenuSub>
                              </CollapsibleContent>
                            </SidebarMenuItem>
                          </Collapsible>
                        );
                      })}
                    </>
                  )}
                </SidebarMenu>
            </CollapsibleSidebarGroup>
          );
        })()}

        {canAccess("HR") && (
        <CollapsibleSidebarGroup
          label="Recursos Humanos"
          storageKey="rrhh"
          icon={UserCog}
          active={isHRActive}
          collapsedItems={rrhhCollapsedItems}
        >
            <SidebarMenu>
              {/* Dashboard HR - top level */}
              {collapsed ? (
                <SidebarMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton tooltip="Empleados" className={`sidebar-glass-hover ${isHRActive ? "sidebar-glass-active font-medium" : ""}`}>
                        <UserCog className="h-4 w-4 shrink-0" />
                        <span>Empleados</span>
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="min-w-[180px]">
                      <DropdownMenuItem onClick={() => navigate("/hr")} className={pathname === "/hr" ? "bg-accent text-accent-foreground font-medium" : ""}>
                        Dashboard HR
                      </DropdownMenuItem>
                      {hrFlatItems.map((item) => (
                        <DropdownMenuItem key={item.url} onClick={() => navigate(item.url)} className={pathname === item.url ? "bg-accent text-accent-foreground font-medium" : ""}>
                          {item.title}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ) : (
                <>
                  {showHRDashboard && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild tooltip="Dashboard HR">
                        <NavLink to="/hr" end className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                          <LayoutDashboard className="h-4 w-4 shrink-0" />
                          <span>Dashboard HR</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}

                  {hrGroups.map((group) => {
                    const groupUrls = getGroupUrls(group);
                    const isGroupActive = groupUrls.some(u => pathname === u || pathname.startsWith(u + "/"));

                    const renderHRItem = (item: HRItem) =>
                      item.url ? (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton asChild isActive={item.url === hrActiveUrl} className="sidebar-glass-hover data-[active=true]:sidebar-glass-active">
                            <NavLink to={item.url}>{item.title}</NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ) : (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton className="opacity-40 cursor-not-allowed pointer-events-none">
                            <span>{item.title}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );

                    return (
                      <Collapsible key={group.key} defaultOpen={isGroupActive} className={`group/hr-${group.key}`}>
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton tooltip={group.label} className="sidebar-glass-hover">
                              <group.icon className="h-4 w-4 shrink-0" />
                              <span>{group.label}</span>
                              <ChevronRight className={`ml-auto h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]/hr-${group.key}:rotate-90`} />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {group.subGroups?.map((sg) => {
                                const isSgActive = sg.items.some(i => i.url && (pathname === i.url || pathname.startsWith(i.url + "/")));
                                return (
                                  <Collapsible key={sg.key} defaultOpen={isSgActive} className={`group/hrSub-${sg.key}`}>
                                    <SidebarMenuSubItem>
                                      <CollapsibleTrigger asChild>
                                        <SidebarMenuSubButton className="sidebar-glass-hover text-muted-foreground cursor-pointer w-full justify-between pr-1 font-medium">
                                          <span>{sg.label}</span>
                                          <ChevronRight className={`h-3 w-3 shrink-0 transition-transform duration-200 group-data-[state=open]/hrSub-${sg.key}:rotate-90`} />
                                        </SidebarMenuSubButton>
                                      </CollapsibleTrigger>
                                      <CollapsibleContent>
                                        <SidebarMenuSub>
                                          {sg.items.map(renderHRItem)}
                                        </SidebarMenuSub>
                                      </CollapsibleContent>
                                    </SidebarMenuSubItem>
                                  </Collapsible>
                                );
                              })}
                              {group.items?.map(renderHRItem)}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    );
                  })}
                </>
              )}
            </SidebarMenu>
        </CollapsibleSidebarGroup>
        )}

        {/* Administración and Recursos used to live here
            as their own sidebar groups. They've all moved into the
            Settings page (reachable from the user dropdown), keeping
            the left rail focused on day-to-day operational tabs. */}

      </SidebarContent>

      <SidebarFooter className="border-t border-border p-3">
        <UserFooterBlock collapsed={collapsed} />
      </SidebarFooter>
    </Sidebar>
  );
};

// ----- Sidebar footer: avatar (con presence dot) + name + theme + Settings.
// Logout vive en /settings (rail izquierdo, última opción). Collapsed state
// muestra los iconos apilados para que el rail siga siendo usable cuando
// el usuario lo pone en modo icon-only.
const UserFooterBlock = ({ collapsed }: { collapsed: boolean }) => {
  const { user } = useAuth();
  const { myStatus, myStatusColor } = useOnlinePresence();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const profileQ = useMyProfile();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Toggle behavior del gear: si estás EN settings, el botón vuelve al
  // tab anterior (guardado en sessionStorage al primer click). Si NO
  // estás en settings, guarda la ruta actual y navega a /settings.
  // Si el usuario navega al sidebar a otro tab, el active se apaga solo
  // (deriva de pathname). Esto reemplaza el behavior anterior que solo
  // hacía navigate("/settings") sin "ida y vuelta".
  const isOnSettings = pathname.startsWith("/settings");
  const SETTINGS_RETURN_KEY = "maven.sidebar.preSettingsRoute";
  const handleSettingsToggle = () => {
    if (isOnSettings) {
      const prev = (typeof window !== "undefined"
        ? window.sessionStorage.getItem(SETTINGS_RETURN_KEY)
        : null) || "/dashboard";
      navigate(prev);
    } else {
      try {
        window.sessionStorage.setItem(SETTINGS_RETURN_KEY, pathname);
      } catch { /* no-op: storage bloqueado / SSR */ }
      navigate("/settings");
    }
  };

  const fullName =
    user?.user_metadata?.full_name || profileQ.data?.full_name || "Usuario";
  const avatarUrl = profileQ.data?.avatar_url ?? null;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div title="Sesión activa" aria-label="Sesión activa">
          <UserAvatar
            name={fullName}
            src={avatarUrl}
            seed={profileQ.data?.avatar_seed}
            size="sm"
            status="online"
            /* Antes iba SIEMPRE en verde (`status="online"` fijo), así que no
               coincidía con el estado que uno mismo eligió en el Messenger. */
            statusClassName={getStatusColor(myStatus, myStatus !== "offline", myStatusColor)}
          />
        </div>
        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-muted-foreground"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? t("topbar.lightMode") : t("topbar.darkMode")}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8",
            isOnSettings && "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary",
          )}
          onClick={handleSettingsToggle}
          title={isOnSettings ? "Volver" : "Settings"}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Identity row — avatar (con dot de presencia), name, theme toggle.
          Antes mostraba "Sesión activa" como texto verde a tamaño completo;
          ahora el estado de presencia vive como un dot 2.5px verde sobre el
          borde inferior-derecho del avatar (patrón estándar Slack/Discord/
          Linear) y el nombre tiene su línea completa, más limpio. */}
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/70 p-2">
        <div className="shrink-0" title="Sesión activa" aria-label="Sesión activa">
          {/* El del sidebar DESPLEGADO. Va aparte del de arriba (el plegado):
              son dos avatares distintos y los dos tienen que seguir el estado. */}
          <UserAvatar
            name={fullName}
            src={avatarUrl}
            seed={profileQ.data?.avatar_seed}
            size="md"
            status="online"
            statusClassName={getStatusColor(myStatus, myStatus !== "offline", myStatusColor)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-tight">{fullName}</div>
        </div>
        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full text-muted-foreground"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? t("topbar.lightMode") : t("topbar.darkMode")}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        )}
        {/* Settings — icon button al lado del theme toggle.
            Antes ocupaba su propia fila full-width pero la jerarquía
            era demasiado equivalente a Salir; como icono entra en la
            fila de identidad y libera vertical.
            Comporta como toggle: si ya estás en /settings se muestra
            activo (color primary) y el click te lleva al tab anterior
            guardado. */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 shrink-0 rounded-full",
            isOnSettings
              ? "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary"
              : "text-muted-foreground",
          )}
          onClick={handleSettingsToggle}
          title={isOnSettings ? "Volver" : "Settings"}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default DashboardSidebar;
