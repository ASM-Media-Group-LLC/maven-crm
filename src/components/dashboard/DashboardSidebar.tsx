import {
  LayoutDashboard,
  Users,
  UserPlus,
  Settings,
  TrendingUp,
  ChevronRight,
  Bot,
  CalendarDays,
  Activity,
  Megaphone,
  CheckSquare,
  Phone,
  Ticket,
  Palette,
  FileText,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import Logo from "@/components/Logo";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarFooter,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

const mainMenu = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Contactos", url: "/contactos", icon: UserPlus },
  { title: "Tareas", url: "/tareas", icon: CheckSquare },
  { title: "Creadores", url: "/creadores", icon: Users },
  { title: "Eventos", url: "/eventos", icon: CalendarDays },
];

const secondaryMenu = [
  { title: "Settings", url: "/dashboard/settings", icon: Settings },
];

const creatorSalesSubItems = [
  { title: "Dashboard", url: "/sales-overview" },
  { title: "Sales Report", url: "/salesdashboard" },
  { title: "Sale Report v.1", url: "/salesperformancecreator" },
  { title: "AI Sales", url: "/aisales", icon: Bot },
  { title: "AI Config", url: "/ai-sales-config" },
];

const DashboardSidebar = () => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const isCreatorSalesActive = creatorSalesSubItems.some(
    (item) => pathname === item.url
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-3">
        <Logo size="sm" collapsed={collapsed} />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenu.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-primary/10 hover:text-primary"
                      activeClassName="bg-primary/15 text-primary border-l-2 border-l-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {collapsed ? (
                <SidebarMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton tooltip="Creator Sales" className={`hover:bg-primary/10 hover:text-primary ${isCreatorSalesActive ? "bg-primary/15 text-primary font-medium" : ""}`}>
                        <TrendingUp className="h-4 w-4 shrink-0" />
                        <span>Creator Sales</span>
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="min-w-[180px]">
                      {creatorSalesSubItems.map((item) => (
                        <DropdownMenuItem
                          key={item.url}
                          onClick={() => navigate(item.url)}
                          className={pathname === item.url ? "bg-accent text-accent-foreground font-medium" : ""}
                        >
                          {item.title}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ) : (
                <Collapsible
                  defaultOpen={isCreatorSalesActive}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip="Creator Sales" className="hover:bg-primary/10 hover:text-primary">
                        <TrendingUp className="h-4 w-4 shrink-0" />
                        <span>Creator Sales</span>
                        <ChevronRight className="ml-auto h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {creatorSalesSubItems.map((item) => (
                          <SidebarMenuSubItem key={item.url}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={pathname === item.url}
                              className="hover:bg-primary/10 hover:text-primary data-[active=true]:bg-primary/15 data-[active=true]:text-primary"
                            >
                              <NavLink to={item.url}>{item.title}</NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Operaciones</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Promolog">
                  <NavLink
                    to="/promolog"
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent/10 hover:text-accent"
                    activeClassName="bg-accent/15 text-accent border-l-2 border-l-accent font-medium"
                  >
                    <Megaphone className="h-4 w-4 shrink-0" />
                    <span>Promolog</span>
                    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground">
                      97
                    </span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="LeadGen">
                  <NavLink
                    to="/leadgen"
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent/10 hover:text-accent"
                    activeClassName="bg-accent/15 text-accent border-l-2 border-l-accent font-medium"
                  >
                    <Activity className="h-4 w-4 shrink-0" />
                    <span>LeadGen</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Closers">
                  <NavLink
                    to="/closers"
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent/10 hover:text-accent"
                    activeClassName="bg-accent/15 text-accent border-l-2 border-l-accent font-medium"
                  >
                    <Phone className="h-4 w-4 shrink-0" />
                    <span>Closers</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Tickets">
                  <NavLink
                    to="/tickets"
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent/10 hover:text-accent"
                    activeClassName="bg-accent/15 text-accent border-l-2 border-l-accent font-medium"
                  >
                    <Ticket className="h-4 w-4 shrink-0" />
                    <span>Tickets</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Recursos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Design System">
                  <NavLink
                    to="/design-system"
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm sidebar-glass-hover"
                    activeClassName="sidebar-glass-active font-medium"
                  >
                    <Palette className="h-4 w-4 shrink-0" />
                    <span>Design System</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Documentacion">
                  <NavLink
                    to="/docs"
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm sidebar-glass-hover"
                    activeClassName="sidebar-glass-active font-medium"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span>Documentacion</span>
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
              {secondaryMenu.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm sidebar-glass-hover"
                      activeClassName="sidebar-glass-active font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter />
    </Sidebar>
  );
};

export default DashboardSidebar;
