import {
  LayoutDashboard, Users, UserPlus, Settings, TrendingUp, ChevronRight,
  Bot, CalendarDays, Activity, Megaphone, CheckSquare, Phone, Ticket, Palette, FileText, Shield, ClipboardCheck, Map,
} from "lucide-react";
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

const LINK_CLASS = "flex items-center gap-2 rounded-md px-3 py-2 text-sm sidebar-glass-hover";
const ACTIVE_CLASS = "sidebar-glass-active font-medium";

const DashboardSidebar = () => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { isAdmin } = useUserRole();

  const mainMenu = [
    { title: t("nav.dashboard"), url: "/dashboard", icon: LayoutDashboard },
    { title: t("nav.contacts"), url: "/contactos", icon: UserPlus },
    { title: t("nav.tasks"), url: "/tareas", icon: CheckSquare },
    { title: t("nav.events"), url: "/eventos", icon: CalendarDays },
  ];

  const creadoresSubItems = [
    { title: "Dashboard", url: "/creadores/dashboard" },
    { title: "Listado", url: "/creadores" },
    { title: "Onboarding", url: "/creadores/onboarding" },
  ];

  const isCreadoresActive = creadoresSubItems.some((item) =>
    item.url === "/creadores" ? pathname === "/creadores" : pathname.startsWith(item.url)
  );

  const creatorSalesSubItems = [
    { title: "Dashboard", url: "/sales-overview" },
    { title: "Reportes", url: "/salesdashboard" },
  ];

  const operationsMenu = [
    { title: t("nav.promolog"), url: "/promolog", icon: Megaphone, badge: 97 },
    { title: t("nav.leadgen"), url: "/leadgen", icon: Activity },
    { title: t("nav.closers"), url: "/closers", icon: Phone },
    { title: t("nav.tickets"), url: "/tickets", icon: Ticket },
  ];

  const isCreatorSalesActive = creatorSalesSubItems.some((item) => pathname === item.url) || pathname === "/aisales" || pathname === "/ai-sales-config";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-3">
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
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {/* Creadores submenu */}
              {collapsed ? (
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
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}

              {/* Creator Sales submenu */}
              {collapsed ? (
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
                      <DropdownMenuItem onClick={() => navigate("/aisales")} className={pathname === "/aisales" ? "bg-accent text-accent-foreground font-medium" : ""}>
                        IA Ventas
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/ai-sales-config")} className={pathname === "/ai-sales-config" ? "bg-accent text-accent-foreground font-medium" : ""}>
                        Config IA
                      </DropdownMenuItem>
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
                        {/* IA Ventas with settings gear */}
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={pathname === "/aisales"} className="sidebar-glass-hover data-[active=true]:sidebar-glass-active">
                            <div className="flex items-center w-full">
                              <NavLink to="/aisales" className="flex-1">IA Ventas</NavLink>
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate("/ai-sales-config"); }}
                                className={`ml-1 p-0.5 rounded hover:bg-accent/50 transition-colors ${pathname === "/ai-sales-config" ? "text-primary" : "text-muted-foreground"}`}
                                title="Configuración IA"
                              >
                                <Settings className="h-3 w-3" />
                              </button>
                            </div>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}
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

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administración</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Usuarios">
                    <NavLink to="/admin/usuarios" className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                      <Shield className="h-4 w-4 shrink-0" />
                      <span>Usuarios</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Auditoría">
                    <NavLink to="/admin/auditoria" className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                      <ClipboardCheck className="h-4 w-4 shrink-0" />
                      <span>Auditoría</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

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

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={t("nav.settings")}>
                  <NavLink to="/dashboard/settings" className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                    <Settings className="h-4 w-4 shrink-0" />
                    <span>{t("nav.settings")}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter />
    </Sidebar>
  );
};

export default DashboardSidebar;
