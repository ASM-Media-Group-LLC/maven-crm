import {
  LayoutDashboard, Users, UserPlus, Settings, TrendingUp, ChevronRight,
  Bot, CalendarDays, Activity, Megaphone, CheckSquare, Phone, Ticket, Palette, FileText, Shield, ClipboardCheck, Map,
  UserCog, BookOpen, AlertTriangle, UserCheck, Clock, Eye, GraduationCap, Wallet, Calculator, BarChart3, DollarSign,
  MessageCircle, Contact, Rocket,
} from "lucide-react";
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
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub,
  SidebarMenuSubItem, SidebarMenuSubButton, SidebarFooter, SidebarSeparator, useSidebar,
} from "@/components/ui/sidebar";
import { useLanguage } from "@/hooks/useLanguage";
import { useUserRole } from "@/hooks/useUserRole";
import { usePermissions } from "@/hooks/usePermissions";

const LINK_CLASS = "flex items-center gap-2 rounded-md px-3 py-2.5 text-sm sidebar-glass-hover";
const ACTIVE_CLASS = "sidebar-glass-active font-medium";

const DashboardSidebar = () => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { isAdmin } = useUserRole();
  const { canAccess } = usePermissions();

  const unreadChatCount = useUnreadChatCount();
  const { promologCount, leadgenCount, closersCount } = useSidebarBadges();

  const mainMenuAll: { title: string; url: string; icon: any; module: string; badge?: number }[] = [
    { title: t("nav.dashboard"), url: "/dashboard", icon: LayoutDashboard, module: "Dashboard" },
    { title: "Dashboard v2", url: "/dashboard2", icon: BarChart3, module: "Dashboard" },
    { title: "Messenger", url: "/messenger", icon: MessageCircle, module: "Messenger", badge: unreadChatCount || undefined },
    { title: t("nav.contacts"), url: "/contactos", icon: UserPlus, module: "Contactos" },
    { title: t("nav.tasks"), url: "/tareas", icon: CheckSquare, module: "Tareas" },
    { title: t("nav.events"), url: "/eventos", icon: CalendarDays, module: "Eventos" },
    { title: "Wishlist", url: "/wishlist", icon: Contact, module: "SuperContacts" },
  ];
  const mainMenu = mainMenuAll.filter((item) => canAccess(item.module));

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

  const creatorSalesSubItems = [
    { title: "Dashboard", url: "/sales-overview" },
    { title: "Reportes", url: "/salesdashboard" },
    { title: "IA Ventas", url: "/aisales" },
    { title: "Auditoría", url: "/sales-audit" },
  ];

  const operationsMenuAll = [
    { title: t("nav.promolog"), url: "/promolog", icon: Megaphone, badge: promologCount || undefined, module: "Promolog" },
    { title: t("nav.leadgen"), url: "/leadgen", icon: Activity, badge: leadgenCount || undefined, module: "LeadGen" },
    { title: t("nav.closers"), url: "/closers", icon: Phone, badge: closersCount || undefined, module: "Closers" },
    { title: t("nav.tickets"), url: "/tickets", icon: Ticket, module: "Tickets" },
  ];
  const operationsMenu = operationsMenuAll.filter((item) => canAccess(item.module));

  const isCreatorSalesActive = creatorSalesSubItems.some((item) => pathname === item.url) || pathname === "/aisales" || pathname === "/ai-sales-config";

  type HRItem = { title: string; url: string | null };
  type HRSubGroup = { label: string; key: string; items: HRItem[] };
  type HRGroup = {
    label: string;
    icon: typeof Clock;
    key: string;
    items?: HRItem[];
    subGroups?: HRSubGroup[];
  };

  const hrGroups: HRGroup[] = [
    {
      label: "Employee Lifecycle",
      icon: UserCheck,
      key: "lifecycle",
      items: [
        { title: "Candidatos", url: "/hr/candidatos" },
        { title: "Onboarding", url: "/hr/onboarding" },
        { title: "Empleados Activos", url: "/hr/directorio" },
        { title: "Offboarding", url: "/hr/offboarding" },
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
            { title: "Asistencia", url: "/hr/asistencia" },
            { title: "Horarios y Turnos", url: "/hr/horarios" },
            { title: "Horarios Chatters", url: "/hr/horarios-chatters" },
            { title: "Horas Extra", url: "/hr/horarios/horas-extras" },
            { title: "Banco de Horas", url: "/hr/horarios/banco-horas" },
          ],
        },
        {
          label: "Ausencias",
          key: "ausencias",
          items: [
            { title: "Vacaciones", url: "/hr/vacaciones" },
            { title: "Permisos", url: "/hr/permisos" },
          ],
        },
      ],
      items: [
        { title: "Monitoreo", url: "/hr/monitoreo" },
      ],
    },
    {
      label: "Seguimiento",
      icon: Eye,
      key: "seguimiento",
      items: [
        { title: "Incidentes", url: "/hr/incidentes" },
      ],
    },
    {
      label: "Desarrollo & Performance",
      icon: GraduationCap,
      key: "desarrollo",
      items: [
        { title: "Desempeño", url: "/hr/desempeno" },
        { title: "Capacitación", url: "/hr/capacitacion" },
      ],
    },
    {
      label: "Organización",
      icon: Users,
      key: "organizacion",
      items: [
        { title: "Directorio", url: "/hr/organizacion/directorio" },
        { title: "Organigrama", url: "/hr/organizacion/organigrama" },
      ],
    },
    {
      label: "Finanzas Operativas",
      icon: Wallet,
      key: "finanzas",
      items: [
        { title: "Deducciones", url: "/hr/deducciones" },
      ],
    },
    {
      label: "Comunicación",
      icon: Megaphone,
      key: "comunicacion",
      items: [
        { title: "Anuncios Internos", url: "/hr/anuncios" },
      ],
    },
  ];

  // Helper to get all URLs from a group (including subGroups)
  const getGroupUrls = (group: HRGroup): string[] => {
    const urls: string[] = [];
    if (group.items) urls.push(...group.items.filter(i => i.url).map(i => i.url!));
    if (group.subGroups) group.subGroups.forEach(sg => urls.push(...sg.items.filter(i => i.url).map(i => i.url!)));
    return urls;
  };

  // Flat list for collapsed dropdown
  const hrFlatItems = hrGroups.flatMap((g) => {
    const items: { title: string; url: string }[] = [];
    if (g.items) items.push(...g.items.filter((i): i is { title: string; url: string } => i.url !== null));
    if (g.subGroups) g.subGroups.forEach(sg => items.push(...sg.items.filter((i): i is { title: string; url: string } => i.url !== null)));
    return items;
  });

  const isHRActive = pathname === "/hr" || pathname.startsWith("/hr/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex h-14 items-center justify-start px-5 border-b border-border shrink-0">
        <Logo size="sm" collapsed={collapsed} />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("sidebar.menu")}</SidebarGroupLabel>
          <SidebarGroupContent>
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

              {/* Creadores submenu */}
              {canAccess("Creadores") && (collapsed ? (
                <SidebarMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton tooltip={t("nav.creators")} className={`sidebar-glass-hover ${isCreadoresActive ? "sidebar-glass-active font-medium" : ""}`}>
                        <Users className="h-4 w-4 shrink-0" />
                        <span>{t("nav.creators")}</span>
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="min-w-[180px]">
                      {creadoresSubItems.map((item) => (
                        <DropdownMenuItem key={item.url} onClick={() => navigate(item.url)} className={pathname === item.url ? "bg-accent text-accent-foreground font-medium" : ""}>
                          {item.title}
                        </DropdownMenuItem>
                      ))}
                      {creadoresSubItemsExtra.map((item) => (
                        <DropdownMenuItem key={item.url} onClick={() => navigate(item.url)} className={pathname === item.url ? "bg-accent text-accent-foreground font-medium" : ""}>
                          {item.title}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ) : (
                <Collapsible defaultOpen={isCreadoresActive} className="group/creadoresCollapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip={t("nav.creators")} className="sidebar-glass-hover">
                        <Users className="h-4 w-4 shrink-0" />
                        <span>{t("nav.creators")}</span>
                        <ChevronRight className="ml-auto h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]/creadoresCollapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                         {creadoresSubItems.map((item) => (
                          <SidebarMenuSubItem key={item.url}>
                            <SidebarMenuSubButton asChild isActive={pathname === item.url} className="sidebar-glass-hover data-[active=true]:sidebar-glass-active">
                              <NavLink to={item.url}>{item.title}</NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                        {creadoresSubItemsExtra.map((item) => (
                          <SidebarMenuSubItem key={item.url}>
                            <SidebarMenuSubButton asChild isActive={pathname === item.url || pathname.startsWith(item.url + "/")} className="sidebar-glass-hover data-[active=true]:sidebar-glass-active">
                              <NavLink to={item.url}>{item.title}</NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ))}

              {/* Creator Sales submenu */}
              {canAccess("Creator Sales") && (collapsed ? (
                <SidebarMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton tooltip="Ventas" className={`sidebar-glass-hover ${isCreatorSalesActive ? "sidebar-glass-active font-medium" : ""}`}>
                        <TrendingUp className="h-4 w-4 shrink-0" />
                        <span>Ventas</span>
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="min-w-[180px]">
                      {creatorSalesSubItems.map((item) => (
                        <DropdownMenuItem key={item.url} onClick={() => navigate(item.url)} className={pathname === item.url ? "bg-accent text-accent-foreground font-medium" : ""}>
                          {item.title}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ) : (
                <Collapsible defaultOpen={isCreatorSalesActive} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip="Ventas" className="sidebar-glass-hover">
                        <TrendingUp className="h-4 w-4 shrink-0" />
                        <span>Ventas</span>
                        <ChevronRight className="ml-auto h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {creatorSalesSubItems.map((item) => (
                          <SidebarMenuSubItem key={item.url}>
                            <SidebarMenuSubButton asChild isActive={pathname === item.url} className="sidebar-glass-hover data-[active=true]:sidebar-glass-active">
                              <NavLink to={item.url}>{item.title}</NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t("sidebar.operations")}</SidebarGroupLabel>
          <SidebarGroupContent>
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
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ── Finanzas ────────────────────────────────────────────── */}
        {canAccess("Finanzas") && (() => {
          type FinItem = { title: string; url: string };
          type FinGroup = { label: string; icon: typeof Wallet; key: string; items: FinItem[] };

          const finanzasGroups: FinGroup[] = [
            {
              label: "Operaciones",
              icon: Calculator,
              key: "fin-ops",
              items: [
                { title: "Nómina", url: "/finanzas/nomina" },
                { title: "Horas & Variables", url: "/finanzas/horas-variables" },
              ],
            },
            {
              label: "Facturación",
              icon: FileText,
              key: "fin-fact",
              items: [
                { title: "Invoices", url: "/finanzas/facturacion/invoices" },
                { title: "Templates", url: "/finanzas/facturacion/templates" },
              ],
            },
            {
              label: "Análisis",
              icon: BarChart3,
              key: "fin-analysis",
              items: [
                { title: "Control Financiero", url: "/finanzas/control" },
                { title: "Reportes Avanzados", url: "/finanzas/reportes" },
              ],
            },
            {
              label: "Configuración",
              icon: Settings,
              key: "fin-config",
              items: [
                { title: "Config. Financiera", url: "/finanzas/configuracion" },
              ],
            },
          ];

          const finFlatItems = [
            { title: "Dashboard", url: "/finanzas" },
            { title: "Collections", url: "/finanzas/collections" },
            ...finanzasGroups.flatMap(g => g.items),
          ];

          const isFinanzasActive = pathname === "/finanzas" || pathname.startsWith("/finanzas/");

          return (
            <SidebarGroup>
              <SidebarGroupLabel>Finanzas</SidebarGroupLabel>
              <SidebarGroupContent>
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
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild tooltip="Dashboard Financiero">
                          <NavLink to="/finanzas" end className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                            <LayoutDashboard className="h-4 w-4 shrink-0" />
                            <span>Dashboard Financiero</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>

                      <SidebarMenuItem>
                        <SidebarMenuButton asChild tooltip="Collections">
                          <NavLink to="/finanzas/collections" className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                            <DollarSign className="h-4 w-4 shrink-0" />
                            <span>Collections</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>

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
                                      <SidebarMenuSubButton asChild isActive={pathname === item.url || pathname.startsWith(item.url + "/")} className="sidebar-glass-hover data-[active=true]:sidebar-glass-active">
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
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })()}

        {canAccess("HR") && (
        <SidebarGroup>
          <SidebarGroupLabel>Recursos Humanos</SidebarGroupLabel>
          <SidebarGroupContent>
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
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Dashboard HR">
                      <NavLink to="/hr" end className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                        <LayoutDashboard className="h-4 w-4 shrink-0" />
                        <span>Dashboard HR</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  {hrGroups.map((group) => {
                    const groupUrls = getGroupUrls(group);
                    const isGroupActive = groupUrls.some(u => pathname === u || pathname.startsWith(u + "/"));

                    const renderHRItem = (item: HRItem) =>
                      item.url ? (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton asChild isActive={pathname === item.url || pathname.startsWith(item.url + "/")} className="sidebar-glass-hover data-[active=true]:sidebar-glass-active">
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
          </SidebarGroupContent>
        </SidebarGroup>
        )}

        {canAccess("ProyectoMP") && (
          <SidebarGroup>
            <SidebarGroupLabel>Proyecto MP</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Proyecto MP">
                    <NavLink to="/proyectomp" className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                      <Rocket className="h-4 w-4 shrink-0" />
                      <span>Proyecto MP</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {canAccess("Administración") && (
          <SidebarGroup>
            <SidebarGroupLabel>Administración</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {canAccess("Administración", "Usuarios") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Usuarios">
                      <NavLink to="/admin/usuarios" className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                        <Shield className="h-4 w-4 shrink-0" />
                        <span>Usuarios</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canAccess("Administración", "Roles") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Auditoría">
                      <NavLink to="/admin/auditoria" className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                        <ClipboardCheck className="h-4 w-4 shrink-0" />
                        <span>Auditoría</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {canAccess("Administración") && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("sidebar.resources")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip={t("nav.designSystem")}>
                    <NavLink to="/design-system" className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                      <Palette className="h-4 w-4 shrink-0" />
                      <span>{t("nav.designSystem")}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip={t("nav.docs")}>
                    <NavLink to="/docs" className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                      <FileText className="h-4 w-4 shrink-0" />
                      <span>{t("nav.docs")}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Roadmap">
                    <NavLink to="/roadmap" className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                      <Map className="h-4 w-4 shrink-0" />
                      <span>Roadmap</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

      </SidebarContent>

      <SidebarFooter />
    </Sidebar>
  );
};

export default DashboardSidebar;
