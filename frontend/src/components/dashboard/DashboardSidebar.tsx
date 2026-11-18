import {
  Activity, AlertTriangle, BarChart3, Bell, BookOpen, Bot, Briefcase, Calculator, CalendarDays, CalendarRange, ChevronRight, Clapperboard, ClipboardCheck, Clock, DollarSign, Eye, FileSpreadsheet, FileText, Gauge, Gift, GraduationCap, HardDrive, Headphones, Home, Inbox, LayoutDashboard, Mail, Map, Megaphone, MessageCircle, Moon, Palette, Phone, Presentation, RefreshCw, Rocket, Search, Settings, Shield, Smartphone, Sun, Ticket, UserCheck, UserCog, UserPlus, Users, Users2, Video, Wallet, Wifi, MonitorDown,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useIncidentesSalud } from "@/hooks/useIncidentesSalud";
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
import { RUTA_GUIA_CONEXION } from "@/lib/guiaConexion";
import { RUTA_GUIA_APP } from "@/lib/guiaApp";
import Logo from "@/components/Logo";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar, SidebarContent,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub,
  SidebarMenuSubItem, SidebarMenuSubButton, SidebarFooter, SidebarSeparator, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import NotificationBell from "@/components/notifications/NotificationBell";
import MessagesBell from "@/components/messenger/MessagesBell";
import SelectorDeIdioma from "./SelectorDeIdioma";
import { MedidorEquipo } from "@/components/MedidorEquipo";
import { abrirBuscador } from "./DashboardTopbar";
import { useLanguage } from "@/hooks/useLanguage";
import { usePermissions } from "@/hooks/usePermissions";
import { useEsDueno } from "@/hooks/useEsDueno";
import { useVeArgos } from "@/hooks/useVeArgos";
import { CollapsibleSidebarGroup } from "@/components/dashboard/CollapsibleSidebarGroup";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon";
import TelegramIcon from "@/components/icons/TelegramIcon";
import { cn } from "@/lib/utils";
import { ACTIVE_CLASS, LINK_CLASS } from "@/components/dashboard/estilosDelMenu";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { getStatusColor } from "@/pages/messenger/components/StatusPicker";


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
  // En el teléfono el sidebar es un cajón a lo ancho (Sheet): nunca se renderiza
  // como riel plegado (Finanzas/RRHH mostraban su flyout de escritorio y el pie
  // se apilaba en iconos). Plegado SOLO en escritorio.
  const collapsed = state === "collapsed" && !isMobile;
  const { pathname } = useLocation();

  // En móvil el sidebar es un Sheet overlay: cerrarlo al navegar para que la
  // pantalla destino no quede tapada por el drawer (un tap menos por navegación).
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname, isMobile, setOpenMobile]);
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { canAccess, isLoading: permisosCargando, hayError: permisosFallaron, reintentar: reintentarPermisos } = usePermissions();
  // Argos lo ven el dueño, los admins, RR. HH. y los supervisores (Alvaro,
  // 12/11/2026). Lo decide la base (ve_argos); a quién ve cada uno lo filtra la
  // RLS. El supervisor no tiene el permiso del módulo HR: por eso el botón NO
  // pasa por canAccess, solo por veArgos.
  const { esDueno } = useEsDueno();
  const { veArgos: veArgosDb } = useVeArgos();
  const veArgos = veArgosDb === true;

  const unreadChatCount = useUnreadChatCount();
  const { promologCount, leadgenCount, closersCount, waInboxCount, tgInboxCount, coworkRequestsCount, correoUnreadCount } = useSidebarBadges();

  // Sin `module` = para todo el que entra (no pasa por canAccess).
  const mainMenuAll: { title: string; url: string; icon: any; module?: string; submodule?: string; badge?: number }[] = [
    { title: t("nav.dashboard"), url: "/dashboard", icon: LayoutDashboard, module: "Dashboard" },
    { title: t("nav.mail"), url: "/correo", icon: Mail, module: "Correo", badge: correoUnreadCount || undefined },
    // El mute del Messenger vive en la cabecera de su lista de chats, al lado
    // del "+" (Jhon, 09/09/2026); WhatsApp y Telegram lo siguen teniendo acá.
    { title: t("nav.messenger"), url: "/messenger", icon: MessageCircle, module: "Messenger", badge: unreadChatCount || undefined },
    { title: t("nav.cowork"), url: "/cowork", icon: Users2, module: "Cowork", badge: coworkRequestsCount || undefined },
    { title: t("nav.meet"), url: "/meet", icon: Video, module: "Meet" },
    { title: t("nav.recordings"), url: "/grabaciones", icon: Clapperboard, module: "Grabaciones" },
    { title: t("nav.contacts"), url: "/contactos", icon: UserPlus, module: "Contactos" },
    // Guía de conexión (Alvaro, 17/11/2026): la gente se cae de las llamadas por
    // el Wi-Fi; aquí prueba su internet y ve qué hacer. Para todos.
    { title: t("nav.connectionGuide"), url: RUTA_GUIA_CONEXION, icon: Wifi },
    // Instalar la app (Alvaro, 18/11/2026): desde el 20/11 Cowork en el
    // computador va solo en la app; la guía paso a paso, para todos.
    { title: t("nav.appGuide"), url: RUTA_GUIA_APP, icon: MonitorDown },
  ];
  const mainMenu = mainMenuAll.filter((item) => !item.module || canAccess(item.module, item.submodule));

  const creadoresSubItems = [
    { title: t("nav.creators.dashboard"), url: "/creadores/dashboard", submodule: "Dashboard" },
    { title: t("nav.creators.list"), url: "/creadores", submodule: "Lista" },
    { title: t("nav.creators.onboarding"), url: "/creadores/onboarding", submodule: "Onboarding" },
    { title: t("nav.creators.offboarding"), url: "/creadores/offboarding", submodule: "Offboarding" },
  ].filter(item => canAccess("Creadores", item.submodule));

  const allCreadoresItems = creadoresSubItems;
  const isCreadoresActive = allCreadoresItems.some((item) =>
    item.url === "/creadores" ? pathname === "/creadores" : pathname.startsWith(item.url)
  );

  const operationsMenuAll: { title: string; url: string; icon: any; badge?: number; module: string; submodule: string | undefined }[] = [
    { title: t("nav.promolog"), url: "/promolog", icon: Megaphone, badge: promologCount || undefined, module: "Promolog", submodule: undefined },
    { title: t("nav.contentGrid"), url: "/parrilla", icon: CalendarRange, module: "Parrilla", submodule: undefined },
    { title: t("nav.customs"), url: "/personalizados", icon: Gift, module: "Personalizados", submodule: undefined },
    { title: t("nav.leadgen"), url: "/leadgen", icon: Activity, badge: leadgenCount || undefined, module: "LeadGen", submodule: undefined },
    { title: t("nav.closers"), url: "/closers", icon: Phone, badge: closersCount || undefined, module: "Closers", submodule: undefined },
    { title: t("nav.phones"), url: "/telefonos", icon: Smartphone, module: "Telefonos", submodule: undefined },
    { title: t("nav.whatsapp"), url: "/inbox", icon: WhatsAppIcon, badge: waInboxCount || undefined, module: "WhatsApp", submodule: undefined },
    { title: t("nav.telegram"), url: "/telegram/bandeja", icon: TelegramIcon, badge: tgInboxCount || undefined, module: "Telegram", submodule: undefined },
    { title: t("nav.tickets"), url: "/tickets", icon: Ticket, module: "Tickets", submodule: undefined },
    { title: t("nav.chatterEvaluator"), url: "/chatter-evaluator", icon: ClipboardCheck, module: "Chatters", submodule: "Evaluator" as string | undefined },
    { title: t("nav.chattersPerformance"), url: "/chatter-evaluator/rendimiento", icon: Gauge, module: "Chatters", submodule: "Rendimiento" as string | undefined },
    { title: t("nav.chattersSchedules"), url: "/chatters/horarios", icon: CalendarDays, module: "Chatters", submodule: "Horarios" as string | undefined },
    { title: t("nav.scouterAssist"), url: "/scouter-assist", icon: Search, module: "Scouter Assist", submodule: undefined },
    { title: t("nav.companyQa"), url: "/agency-qa", icon: Headphones, module: "Agency QA", submodule: undefined },
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
      label: t("nav.hr.lifecycle"),
      icon: UserCheck,
      key: "lifecycle",
      items: [
        { title: t("nav.hr.staff"), url: "/hr/personal", submodule: "Empleados Activos" },
        { title: t("nav.hr.candidates"), url: "/hr/candidatos", submodule: "Candidatos" },
        { title: t("nav.hr.onboarding"), url: "/hr/onboarding", submodule: "Onboarding" },
        { title: t("nav.hr.activeEmployees"), url: "/hr/directorio", submodule: "Empleados Activos" },
        { title: t("nav.hr.offboarding"), url: "/hr/offboarding", submodule: "Offboarding" },
      ],
    },
    {
      label: t("nav.hr.laborManagement"),
      icon: Clock,
      key: "gestion",
      subGroups: [
        {
          label: t("nav.hr.timeControl"),
          key: "tiempo",
          items: [
            { title: t("nav.hr.attendance"), url: "/hr/asistencia", submodule: "Asistencia" },
            { title: t("nav.hr.schedules"), url: "/hr/horarios", submodule: "Horarios" },
            { title: t("nav.hr.staffSchedule"), url: "/hr/horarios-personal", submodule: "Horarios" },
            { title: t("nav.hr.chatterSchedules"), url: "/hr/horarios-chatters", submodule: "Horarios Chatters" },
            { title: t("nav.hr.overtime"), url: "/hr/horarios/horas-extras", submodule: "Horas Extra" },
            { title: t("nav.hr.hoursBank"), url: "/hr/horarios/banco-horas", submodule: "Banco de Horas" },
          ],
        },
        {
          label: t("nav.hr.absences"),
          key: "ausencias",
          items: [
            { title: t("nav.hr.vacations"), url: "/hr/vacaciones", submodule: "Vacaciones" },
            { title: t("nav.hr.leave"), url: "/hr/permisos", submodule: "Permisos" },
          ],
        },
      ],
      items: [
        { title: t("nav.hr.monitoring"), url: "/hr/monitoreo", submodule: "Monitoreo" },
        { title: t("nav.hr.monitorIA"), url: "/hr/monitor-ia", submodule: "Monitor IA" },
      ],
    },
    {
      label: t("nav.hr.tracking"),
      icon: Eye,
      key: "seguimiento",
      items: [
        { title: t("nav.hr.incidents"), url: "/hr/incidentes", submodule: "Incidentes" },
      ],
    },
    {
      label: t("nav.hr.development"),
      icon: GraduationCap,
      key: "desarrollo",
      items: [
        { title: t("nav.hr.performance"), url: "/hr/desempeno", submodule: "Desempeño" },
        { title: t("nav.hr.training"), url: "/hr/capacitacion", submodule: "Capacitación" },
      ],
    },
    {
      label: t("nav.hr.organization"),
      icon: Users,
      key: "organizacion",
      items: [
        { title: t("nav.hr.directory"), url: "/hr/organizacion/directorio", submodule: "Directorio" },
        { title: t("nav.hr.orgChart"), url: "/hr/organizacion/organigrama", submodule: "Organigrama" },
      ],
    },
    {
      label: t("nav.hr.opsFinance"),
      icon: Wallet,
      key: "finanzas",
      items: [
        { title: t("nav.hr.payroll"), url: "/hr/nomina", submodule: "Deducciones" },
        { title: t("nav.hr.deductions"), url: "/hr/deducciones", submodule: "Deducciones" },
      ],
    },
    {
      label: t("nav.hr.communication"),
      icon: Bell,
      key: "comunicacion",
      items: [
        { title: t("nav.hr.announcements"), url: "/hr/anuncios", submodule: "Anuncios" },
      ],
    },
  ];

  // Filter HR items the role can't actually reach so the sidebar
  // doesn't show entries that just bounce back to /dashboard.
  const filterHRItems = (items?: HRItem[]) =>
    items?.filter((i) => !i.submodule || (canAccess("HR", i.submodule) && (i.submodule !== "Monitor IA" || veArgos)));
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

  // Argos (Monitor IA) tiene su PROPIO icono fijo en el riel (el ojo), así que
  // el grupo RRHH NO debe marcarse activo cuando estás en Argos — si no, se
  // prenden DOS iconos azules a la vez. Solo uno se ilumina: donde estás.
  // Alvaro, 03/11.
  const enMonitorIA = pathname === "/hr/monitor-ia" || pathname.startsWith("/hr/monitor-ia/");
  const isHRActive = !enMonitorIA && (pathname === "/hr" || pathname.startsWith("/hr/"));

  const rrhhCollapsedItems: Array<
    | { kind?: "item"; title: string; url: string }
    | { kind: "label"; title: string }
    | { kind: "separator" }
  > = [
    ...(showHRDashboard ? [{ title: t("nav.hr.dashboard"), url: "/hr" }] : []),
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

  // ── Oficina ───────────────────────────────────────────────────────────
  // Dejó de ser una página para ser una suite. Cada formato es su propia
  // sección, como en Google: la lista de hojas no se mezcla con la de
  // documentos. Calendario y Drive entran acá cuando existan.
  const oficinaItemsAll = [
    { title: t("nav.office.calendar"), url: "/oficina/calendario", icon: CalendarDays, submodule: "Calendario" },
    { title: t("nav.office.docs"), url: "/oficina", icon: FileText, submodule: "Documentos" },
    { title: t("nav.office.sheets"), url: "/oficina/hojas", icon: FileSpreadsheet, submodule: "Hojas de cálculo" },
    { title: t("nav.office.slides"), url: "/oficina/presentaciones", icon: Presentation, submodule: "Presentaciones" },
    { title: t("nav.office.drive"), url: "/oficina/drive", icon: HardDrive, submodule: "Drive" },
  ];
  // «Espacio del NAS» (Alvaro, 10/11): solo el dueño. Va FUERA de
  // oficinaItemsAll a propósito: no es un submódulo que se reparta por rol (el
  // catálogo de permisos de Oficina tiene exactamente sus cinco secciones).
  const oficinaItems = [
    ...oficinaItemsAll.filter((i) => canAccess("Oficina", i.submodule)),
    ...(esDueno === true
      ? [
          { title: t("nav.office.nas"), url: "/oficina/espacio-nas", icon: Gauge, submodule: "" },
          // «Costos y conexiones» (Alvaro, 11/11): solo el dueño, igual que el NAS.
          { title: t("nav.office.costos"), url: "/oficina/costos", icon: Wallet, submodule: "" },
        ]
      : []),
  ];
  const oficinaCollapsedItems: CI[] = oficinaItems.map((i) => ({ title: i.title, url: i.url }));
  // ⚠️ Por PREFIJO y no por igualdad: al abrir un documento la ruta es
  // /oficina/<uuid>, que no está en el menú, y el grupo se apagaba justo
  // mientras se está trabajando adentro.
  const isOficinaActive = pathname === "/oficina" || pathname.startsWith("/oficina/");

  // OPERACIONES EN SUB-ACORDEONES (Alvaro, 10/2026): eran 14 ítems planos en
  // una sola lista — "traen un vergazo de cosas... no es como que hayas metido
  // una cosa dentro de otra". Mismo patrón que Finanzas/RRHH: grupo → subgrupo
  // → ítem. Se agrupa por URL sobre la lista YA filtrada por permisos; un ítem
  // nuevo que no esté en ningún subgrupo se pinta SUELTO arriba — así nada
  // desaparece por olvidar actualizar este mapa.
  type OpsGrupo = { key: string; label: string; icon: typeof Briefcase; urls: string[] };
  const opsGruposDef: OpsGrupo[] = [
    { key: "contenido", label: t("nav.ops.content"), icon: Megaphone, urls: ["/promolog", "/parrilla", "/personalizados"] },
    { key: "ventas", label: t("nav.ops.sales"), icon: Phone, urls: ["/leadgen", "/closers", "/scouter-assist", "/telefonos"] },
    { key: "bandejas", label: t("nav.ops.inboxes"), icon: Inbox, urls: ["/inbox", "/telegram/bandeja", "/tickets"] },
    { key: "chatters", label: t("nav.ops.quality"), icon: Gauge, urls: ["/chatter-evaluator", "/chatter-evaluator/rendimiento", "/chatters/horarios", "/agency-qa"] },
  ];
  const opsGrupos = opsGruposDef
    .map((g) => ({
      ...g,
      items: g.urls
        .map((u) => operationsMenu.find((i) => i.url === u))
        .filter((i): i is (typeof operationsMenu)[number] => !!i),
    }))
    .filter((g) => g.items.length > 0);
  const opsAgrupadas = new Set(opsGrupos.flatMap((g) => g.items.map((i) => i.url)));
  const opsSueltos = operationsMenu.filter((i) => !opsAgrupadas.has(i.url));

  const operationsCollapsedItems: CI[] = [
    ...opsSueltos.map((i) => ({ title: i.title, url: i.url })),
    ...opsGrupos.flatMap((g) => [
      { kind: "separator" } as const,
      { kind: "label", title: g.label } as const,
      ...g.items.map((i) => ({ title: i.title, url: i.url })),
    ]),
  ];
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
      <Sidebar collapsible="icon" variant="floating">
        <SidebarHeader className="riel-logo flex h-14 flex-row items-center justify-start px-5 border-b border-border shrink-0">
          <Link
          to="/dashboard"
          aria-label={t("nav.goToDashboard")}
          className="rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Logo size="sm" collapsed={collapsed} />
        </Link>
        </SidebarHeader>
        <SidebarContent className="gap-2 px-3 py-3">
          {permisosFallaron ? (
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/40 p-3">
              <p className="text-xs font-medium">{t("nav.menuLoadFailed")}</p>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {t("nav.menuLoadFailedHint")}
              </p>
              <Button size="sm" variant="secondary" className="h-7 w-full gap-1.5 text-xs" onClick={reintentarPermisos}>
                <RefreshCw className="h-3 w-3" />
                {t("nav.retry")}
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

  // Icono Home con puntito rojo si hay incidente de salud abierto (Alvaro 09/11).
  // Así ves la salud estés donde estés: Cowork, Messenger, lo que sea.
  const HomeConPuntito = ({ className }: { className?: string }) => {
    const { hayAbiertos } = useIncidentesSalud();
    return (
      <span className="relative inline-flex">
        <Home className={className} />
        {hayAbiertos && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" aria-label={t("dashboard.centro.salud.hayProblema")} />
        )}
      </span>
    );
  };

  return (
    <Sidebar collapsible="icon" variant="floating">
      {/* Compacto (Alvaro, 18/11/2026: «está muy grande»): la marca más chica a
          la izquierda y, al lado, la lupa del buscador (⌘K) y el botón para
          plegar el menú, que vivían en la barra de arriba (ya no está en
          computador). Plegado: la baldosa y los dos botones uno debajo del otro. */}
      <SidebarHeader className={cn(
        "shrink-0",
        collapsed ? "flex flex-col items-center gap-1 px-1 py-2" : "flex h-14 flex-row items-center gap-1 pl-4 pr-2",
      )}>
        <Link
          to="/dashboard"
          aria-label={t("nav.goToDashboard")}
          className="rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Logo size="sm" collapsed={collapsed} />
        </Link>
        {!isMobile && (
          <div className={cn("flex items-center gap-0.5 text-muted-foreground", collapsed ? "flex-col" : "ml-auto")}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={abrirBuscador}
              title={t("topbar.search")}
              aria-label={t("topbar.search")}
            >
              <Search className="h-4 w-4" />
            </Button>
            <SidebarTrigger className="h-8 w-8 rounded-full" title={t("sidebar.plegarMenu")} />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-0.5 overflow-x-hidden px-2 py-1">
        <CollapsibleSidebarGroup
          label={t("sidebar.menu")}
          storageKey="menu"
          icon={HomeConPuntito}
          active={isMenuActive}
          collapsedItems={menuCollapsedItems}
          collapsedHref="/dashboard"
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

        {/* Argos: su PROPIO botón en el riel (Alvaro), no dentro del flyout de
            Menú. Lo ven dueño, admins, RR. HH. y supervisores (ve_argos). */}
        {veArgos && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={t("nav.argos")}>
                <NavLink to="/hr/monitor-ia" className={LINK_CLASS} activeClassName={ACTIVE_CLASS} onMouseEnter={() => precargarRuta("/hr/monitor-ia")} onFocus={() => precargarRuta("/hr/monitor-ia")}>
                  <Eye className="h-4 w-4 shrink-0" />
                  <span>{t("nav.argos")}</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}

        {operationsMenu.length > 0 && (
        <CollapsibleSidebarGroup
          label={t("sidebar.operations")}
          storageKey="operations"
          icon={Briefcase}
          active={isOperationsActive}
          collapsedItems={operationsCollapsedItems}
        >
            <SidebarMenu>
              {/* Ítems fuera de todo subgrupo (red de seguridad del mapa de arriba). */}
              {opsSueltos.map((item) => (
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
              {opsGrupos.map((group) => {
                const isGroupActive = group.items.some((i) => pathname === i.url || pathname.startsWith(i.url + "/"));
                // Con el subgrupo CERRADO, la suma de sus avisos se asoma en el
                // título (y se esconde al abrirlo: ahí ya se ven los de cada
                // ítem) — plegar no puede significar perder los pendientes.
                const avisos = group.items.reduce((acc, i) => acc + (i.badge ?? 0), 0);
                return (
                  <Collapsible key={group.key} defaultOpen={isGroupActive}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={group.label} className="group/ops sidebar-glass-hover">
                          <group.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{group.label}</span>
                          <span className="ml-auto flex shrink-0 items-center gap-1">
                            {avisos > 0 && (
                              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary group-data-[state=open]/ops:hidden">
                                {compactBadge(avisos)}
                              </span>
                            )}
                            <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]/ops:rotate-90" />
                          </span>
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {group.items.map((item) => (
                            <SidebarMenuSubItem key={item.url}>
                              <SidebarMenuSubButton asChild isActive={item.url === operationsActiveUrl} className="sidebar-glass-hover data-[active=true]:sidebar-glass-active">
                                <NavLink to={item.url} onMouseEnter={() => precargarRuta(item.url)} onFocus={() => precargarRuta(item.url)}>
                                  <span className="truncate">{item.title}</span>
                                  {"badge" in item && item.badge != null && (
                                    <span className={`ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${badgeTint(item.module)}`}>
                                      {compactBadge(item.badge)}
                                    </span>
                                  )}
                                </NavLink>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
        </CollapsibleSidebarGroup>
        )}

        {/* ── Finanzas ────────────────────────────────────────────── */}
        {canAccess("Finanzas") && (() => {
          type FinItem = { title: string; url: string; submodule: string };
          type FinGroup = { label: string; icon: typeof Wallet; key: string; items: FinItem[] };

          const finanzasGroupsAll: FinGroup[] = [
            {
              label: t("nav.fin.operations"),
              icon: Calculator,
              key: "fin-ops",
              items: [
                { title: t("nav.fin.payroll"), url: "/finanzas/nomina", submodule: "Nómina" },
                { title: t("nav.fin.hoursVariables"), url: "/finanzas/horas-variables", submodule: "Horas Variables" },
              ],
            },
            {
              label: t("nav.fin.billing"),
              icon: FileText,
              key: "fin-fact",
              items: [
                { title: t("nav.fin.invoices"), url: "/finanzas/facturacion/invoices", submodule: "Invoices" },
                { title: t("nav.fin.templates"), url: "/finanzas/facturacion/templates", submodule: "Templates" },
              ],
            },
            {
              label: t("nav.fin.analysis"),
              icon: BarChart3,
              key: "fin-analysis",
              items: [
                { title: t("nav.fin.control"), url: "/finanzas/control", submodule: "Control Financiero" },
                { title: t("nav.fin.reports"), url: "/finanzas/reportes", submodule: "Reportes" },
              ],
            },
            {
              label: t("nav.fin.settings"),
              icon: Settings,
              key: "fin-config",
              items: [
                { title: t("nav.fin.settingsItem"), url: "/finanzas/configuracion", submodule: "Configuración" },
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
            ...(showFinDashboard ? [{ title: t("nav.dashboard"), url: "/finanzas" }] : []),
            ...(showFinCollections ? [{ title: t("nav.fin.collections"), url: "/finanzas/collections" }] : []),
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
            { title: t("nav.fin.dashboard"), url: "/finanzas" },
            { title: t("nav.fin.collections"), url: "/finanzas/collections" },
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
                          <SidebarMenuButton tooltip={t("nav.finance")} className={`sidebar-glass-hover ${isFinanzasActive ? "sidebar-glass-active font-medium" : ""}`}>
                            <Wallet className="h-4 w-4 shrink-0" />
                            <span>{t("nav.finance")}</span>
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
                          <SidebarMenuButton asChild tooltip={t("nav.fin.dashboard")}>
                            <NavLink to="/finanzas" end className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                              <LayoutDashboard className="h-4 w-4 shrink-0" />
                              <span>{t("nav.fin.dashboard")}</span>
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}

                      {showFinCollections && (
                        <SidebarMenuItem>
                          <SidebarMenuButton asChild tooltip={t("nav.fin.collections")}>
                            <NavLink to="/finanzas/collections" className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                              <DollarSign className="h-4 w-4 shrink-0" />
                              <span>{t("nav.fin.collections")}</span>
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
                      <SidebarMenuButton tooltip={t("nav.staff")} className={`sidebar-glass-hover ${isHRActive ? "sidebar-glass-active font-medium" : ""}`}>
                        <UserCog className="h-4 w-4 shrink-0" />
                        <span>{t("nav.staff")}</span>
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="min-w-[180px]">
                      <DropdownMenuItem onClick={() => navigate("/hr")} className={pathname === "/hr" ? "bg-accent text-accent-foreground font-medium" : ""}>
                        {t("nav.hr.dashboard")}
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
                      <SidebarMenuButton asChild tooltip={t("nav.hr.dashboard")}>
                        <NavLink to="/hr" end className={LINK_CLASS} activeClassName={ACTIVE_CLASS}>
                          <LayoutDashboard className="h-4 w-4 shrink-0" />
                          <span>{t("nav.hr.dashboard")}</span>
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

        {oficinaItems.length > 0 && (
        <CollapsibleSidebarGroup
          label={t("nav.office")}
          storageKey="oficina"
          icon={FileText}
          active={isOficinaActive}
          collapsedItems={oficinaCollapsedItems}
        >
            <SidebarMenu>
              {oficinaItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    {/* `end` en /oficina: sin eso, estar en /oficina/hojas
                        encendía TAMBIÉN a Documentos, porque NavLink marca por
                        prefijo y toda la sección cuelga de la misma raíz. */}
                    <NavLink to={item.url} end={item.url === "/oficina"} className={LINK_CLASS} activeClassName={ACTIVE_CLASS} onMouseEnter={() => precargarRuta(item.url)} onFocus={() => precargarRuta(item.url)}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
        </CollapsibleSidebarGroup>
        )}

        {/* Administración and Recursos used to live here
            as their own sidebar groups. They've all moved into the
            Settings page (reachable from the user dropdown), keeping
            the left rail focused on day-to-day operational tabs. */}

      </SidebarContent>

      <SidebarFooter className="border-t border-border p-2.5">
        {/* Lo que estaba en la barra de arriba: idioma, mensajes, campana (y en
            la app, el medidor del equipo). En el teléfono siguen arriba. */}
        {!isMobile && (
          <div className={cn("flex items-center justify-center gap-1", collapsed && "flex-col")}>
            <MedidorEquipo />
            <SelectorDeIdioma />
            <MessagesBell />
            <NotificationBell />
          </div>
        )}
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
        <div title={t("nav.activeSession")} aria-label={t("nav.activeSession")}>
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
        <div className="shrink-0" title={t("nav.activeSession")} aria-label={t("nav.activeSession")}>
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
