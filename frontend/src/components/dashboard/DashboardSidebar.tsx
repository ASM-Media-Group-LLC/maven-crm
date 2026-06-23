import {
  LayoutDashboard, Users, UserPlus, Settings, TrendingUp, ChevronRight,
  Bot, CalendarDays, Activity, Megaphone, CheckSquare, Phone, Smartphone, Ticket, Palette, FileText, Shield, ClipboardCheck, Map,
  UserCog, BookOpen, AlertTriangle, UserCheck, Clock, Eye, GraduationCap, Wallet, Calculator, BarChart3, DollarSign,
  MessageCircle, MessageSquare, Contact, Rocket, Sun, Moon, Home, Briefcase, Users2, Search, Headphones, Inbox,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useMyProfile } from "@/hooks/useUserProfile";
import { useUnreadChatCount } from "@/hooks/useUnreadChatCount";
import { useSidebarBadges } from "@/hooks/useSidebarBadges";
import { useLocation, useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import Logo from "@/components/Logo";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar, SidebarContent,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub,
  SidebarMenuSubItem, SidebarMenuSubButton, SidebarFooter, SidebarSeparator, useSidebar,
  SidebarGroup, SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { useLanguage } from "@/hooks/useLanguage";
import { useUserRole } from "@/hooks/useUserRole";
import { usePermissions } from "@/hooks/usePermissions";
import { CollapsibleSidebarGroup } from "@/components/dashboard/CollapsibleSidebarGroup";
import { cn } from "@/lib/utils";

const LINK_CLASS = "flex items-center gap-2 rounded-md px-3 py-3 text-sm sidebar-glass-hover";
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
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { isAdmin } = useUserRole();
  const { canAccess } = usePermissions();

  const unreadChatCount = useUnreadChatCount();
  const { promologCount, leadgenCount, closersCount, waInboxCount } = useSidebarBadges();

  const mainMenuAll: { title: string; url: string; icon: any; module: string; badge?: number }[] = [
    { title: t("nav.dashboard"), url: "/dashboard", icon: LayoutDashboard, module: "Dashboard" },
    { title: "Dashboard v2", url: "/dashboard2", icon: BarChart3, module: "Dashboard" },
    { title: "Messenger", url: "/messenger", icon: MessageCircle, module: "Messenger", badge: unreadChatCount || undefined },
    { title: "Cowork", url: "/cowork", icon: Users2, module: "Cowork" },
    { title: t("nav.contacts"), url: "/contactos", icon: UserPlus, module: "Contactos" },
    { title: t("nav.tasks"), url: "/tareas", icon: CheckSquare, module: "Tareas" },
    { title: t("nav.events"), url: "/eventos", icon: CalendarDays, module: "Eventos" },
    { title: "Wishlist", url: "/wishlist", icon: Contact, module: "SuperContacts" },
  ];
  const mainMenu = mainMenuAll.filter((item) => canAccess(item.module) && (item.url !== "/dashboard2" || isAdmin));

  const creadoresSubItems = [
    { title: "Dashboard", url: "/creadores/dashboard", submodule: "Dashboard" },
    { title: "Listado", url: "/creadores", submodule: "Lista" },
    { title: "Onboarding", url: "/creadores/onboarding", submodule: "Onboarding" },
    { title: "Offboarding", url: "/creadores/offboarding", submodule: "Offboarding" },
  ].filter(item => canAccess("Creadores", item.submodule));

  const creadoresSubItemsExtra = [
    { title: "Personalizados", url: "/creadores/personalizados", submodule: "Personalizados" },
  ].filter(item => canAccess("Creadores", item.submodule));

  const allCreadoresItems = [...creadoresSubItems, ...creadoresSubItemsExtra];
  const isCreadoresActive = allCreadoresItems.some((item) =>
    item.url === "/creadores" ? pathname === "/creadores" : pathname.startsWith(item.url)
  );

  const creatorSalesSubItemsAll = [
    { title: "Dashboard", url: "/sales-overview", submodule: "Dashboard" },
    { title: "Reportes", url: "/salesdashboard", submodule: "Reportes" },
    { title: "IA Ventas · Beta", url: "/aisales", submodule: "IA Ventas" },
    { title: "Auditoría", url: "/sales-audit", submodule: "Auditoría" },
  ];
  const creatorSalesSubItems = creatorSalesSubItemsAll.filter((item) =>
    canAccess("Creator Sales", item.submodule),
  );

  const operationsMenuAll = [
    { title: t("nav.promolog"), url: "/promolog", icon: Megaphone, badge: promologCount || undefined, module: "Promolog", submodule: undefined as string | undefined },
    { title: t("nav.leadgen"), url: "/leadgen", icon: Activity, badge: leadgenCount || undefined, module: "LeadGen", submodule: undefined },
    { title: t("nav.closers"), url: "/closers", icon: Phone, badge: closersCount || undefined, module: "Closers", submodule: undefined },
    { title: "Teléfonos", url: "/telefonos", icon: Smartphone, module: "Telefonos", submodule: undefined },
    { title: "WhatsApp", url: "/inbox", icon: Inbox, badge: waInboxCount || undefined, module: "WhatsApp", submodule: undefined as string | undefined },
    { title: t("nav.tickets"), url: "/tickets", icon: Ticket, module: "Tickets", submodule: undefined },
    { title: "Chatter Evaluator", url: "/chatter-evaluator", icon: MessageSquare, module: "Chatters", submodule: "Evaluator" as string | undefined },
    { title: "Scouter Assist", url: "/scouter-assist", icon: Search, module: "Scouter Assist", submodule: undefined },
    { title: "Company QA", url: "/agency-qa", icon: Headphones, module: "Agency QA", submodule: undefined },
    { title: "Mensajes Pro", url: "/conversaciones", icon: MessageSquare, module: "Agency QA", submodule: "Mensajes Pro" },
  ];
  const operationsMenu = operationsMenuAll.filter((item) => canAccess(item.module, item.submodule));

  const isCreatorSalesActive = creatorSalesSubItems.some((item) => pathname === item.url) || pathname === "/aisales";

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
        { title: "Deducciones", url: "/hr/deducciones", submodule: "Deducciones" },
      ],
    },
    {
      label: "Comunicación",
      icon: Megaphone,
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
    ...(canAccess("Creator Sales")
      ? ([
          { kind: "separator" } as const,
          { kind: "label", title: "Ventas" } as const,
          ...creatorSalesSubItems.map((i) => ({ title: i.title, url: i.url })),
        ] as CI[])
      : []),
  ];
  const isMenuActive =
    mainMenu.some((i) => pathname === i.url || pathname.startsWith(i.url + "/")) ||
    isCreadoresActive ||
    isCreatorSalesActive;

  const operationsCollapsedItems: CI[] = operationsMenu.map((i) => ({
    title: i.title,
    url: i.url,
  }));
  const isOperationsActive = operationsMenu.some(
    (i) => pathname === i.url || pathname.startsWith(i.url + "/")
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex h-14 items-center justify-start px-5 border-b border-border shrink-0">
        <Logo size="sm" collapsed={collapsed} />
      </SidebarHeader>

      <SidebarContent className="gap-3 py-1">
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
                    <NavLink to={item.url} end={item.url === "/dashboard"} className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.title}</span>
                      {"badge" in item && item.badge != null && (
                        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground">
                          {item.badge > 99 ? "99+" : item.badge}
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

              {/* Ventas — single link to dashboard; submenu vive como subtabs en la página */}
              {canAccess("Creator Sales") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Ventas">
                    <button type="button" onClick={() => navigate("/sales-overview")} className={`${LINK_CLASS} ${isCreatorSalesActive ? ACTIVE_CLASS : ""} w-full text-left`}>
                      <TrendingUp className="h-4 w-4 shrink-0" />
                      <span>Ventas</span>
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
                    <NavLink to={item.url} className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.title}</span>
                      {"badge" in item && item.badge != null && (
                        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground">
                          {item.badge}
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

        {/* Proyecto MP, Administración and Recursos used to live here
            as their own sidebar groups. They've all moved into the
            Settings page (reachable from the user dropdown), keeping
            the left rail focused on day-to-day operational tabs. */}

        {/* Panel de control — top-level tab justo después de RRHH.
            Mismo DOM que un SidebarGroupLabel de CollapsibleSidebarGroup
            (no SidebarMenuButton) para que el peso visual coincida con
            los headers de sección (MENU / OPERACIONES / FINANZAS / RRHH)
            y no se vea más bold/brighter. */}
        {canAccess("Panel de control") && (
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <NavLink
                to="/panel-de-control"
                title="Panel de control"
                className={({ isActive }) =>
                  `group/label flex w-full cursor-pointer items-center gap-2 rounded-md text-[11px] font-semibold uppercase tracking-widest transition-colors hover:!text-foreground hover:bg-foreground/5 ${
                    isActive
                      ? "!text-foreground bg-foreground/5"
                      : "!text-foreground/70"
                  }`
                }
              >
                <BarChart3 className="h-3.5 w-3.5 shrink-0 opacity-70 transition-opacity group-hover/label:opacity-100" />
                <span className="flex-1 text-left">Panel de control</span>
              </NavLink>
            </SidebarGroupLabel>
          </SidebarGroup>
        )}
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
  const initials = fullName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const avatarUrl = profileQ.data?.avatar_url ?? null;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="relative">
          <Avatar className="h-8 w-8">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName} />}
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          </Avatar>
          <span
            aria-label="Sesión activa"
            title="Sesión activa"
            className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background"
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
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          <Avatar className="h-9 w-9">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName} />}
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          </Avatar>
          <span
            aria-label="Sesión activa"
            title="Sesión activa"
            className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background"
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
