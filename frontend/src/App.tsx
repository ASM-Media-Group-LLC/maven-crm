import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import AvisoMudanzaDominio from "@/components/AvisoMudanzaDominio";
import AvisoRelojDesfasado from "@/components/AvisoRelojDesfasado";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { useSkinSync } from "@/hooks/useSkin";
import { LanguageProvider } from "@/hooks/useLanguage";
import { OnlinePresenceProvider } from "@/hooks/useOnlinePresence";
import ProtectedRoute from "@/components/ProtectedRoute";
import PermissionRoute from "@/components/PermissionRoute";
import CreadorRosterRoute from "@/components/CreadorRosterRoute";
import AdminRoute from "./components/AdminRoute";
import AppShell from "@/components/dashboard/AppShell";
import { CallProvider } from "@/components/CallProvider";
import { PersistentCallProvider } from "@/components/PersistentCallProvider";
import Logo from "@/components/Logo";

// All sidebar-reachable pages are imported eagerly so the FIRST nav to
// each one is instant — no chunk download, no spinner. The initial
// bundle is a bit larger but the in-app navigation feels native, which
// the user expects ("se siente como en otros CRMs").
//
// Only pages that are public, full-screen, or rarely visited stay
// lazy (login forgot/reset, video calls, share tokens).

const Portada = lazy(() => import("./pages/portada/Portada"));
const Privacidad = lazy(() => import("./pages/portada/Privacidad"));
const Documentacion = lazy(() => import("./pages/portada/Documentacion"));
const DiagnosticoPantalla = lazy(() => import("./pages/DiagnosticoPantalla"));
const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Rare / public — kept lazy.
const Concepto = lazy(() => import("./pages/portada/Concepto"));
// SEGURIDAD: página de login de demo (roles de prueba + contraseña hardcodeada).
// Solo en desarrollo: en prod no se rutea NI se bundlea (la rama queda muerta y
// el chunk —con la contraseña— se elimina por tree-shaking en el build de prod).
const Credentials = import.meta.env.DEV ? lazy(() => import("./pages/Credentials")) : null;
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ChatterPublicView = lazy(() => import("./pages/ChatterPublicView"));
const PaginaAportar = lazy(() => import("./pages/aportar/PaginaAportar"));
const VideoCallPage = lazy(() => import("./pages/VideoCallPage"));
const CoworkPage = lazy(() => import("./pages/cowork/CoworkPage"));
const MeetPage = lazy(() => import("./pages/meet/MeetPage"));
const MeetGuestPage = lazy(() => import("./pages/meet/MeetGuestPage"));
// Portal de creadoras: su espacio, fuera del AppShell del equipo.
const PortalLayout = lazy(() => import("./pages/portal/PortalLayout"));
const PortalInicio = lazy(() => import("./pages/portal/PortalInicio"));
const PortalPedidos = lazy(() => import("./pages/portal/PortalPedidos"));
const PortalFicha = lazy(() => import("./pages/portal/PortalFicha"));
const PortalContenido = lazy(() => import("./pages/portal/PortalContenido"));
const PortalAjustes = lazy(() => import("./pages/portal/PortalAjustes"));
const PortalEntrar = lazy(() => import("./pages/portal/PortalEntrar"));
const PortalContrasena = lazy(() => import("./pages/portal/PortalContrasena"));
const GrabacionesPage = lazy(() => import("./pages/grabaciones/GrabacionesPage"));
const OficinaPage = lazy(() => import("./pages/oficina/OficinaPage"));
const CalendarioPage = lazy(() => import("./pages/calendario/CalendarioPage"));
const DocumentoPage = lazy(() => import("./pages/oficina/DocumentoPage"));
const DrivePage = lazy(() => import("./pages/oficina/DrivePage"));
const ArchivoDelDrivePage = lazy(() => import("./pages/oficina/ArchivoDelDrivePage"));
// Correo (Zoho detrás). Ya está en UNIVERSAL_MODULES (usePermissions), o sea que
// se ve por default como Messenger/Cowork/Meet; un admin puede apagárselo a un rol
// desde Administración → Roles, donde ahora figura (MODULES_CONFIG en useRoles.ts).
const CorreoPage = lazy(() => import("./pages/correo/CorreoPage"));
const CorreoConectarPage = lazy(() => import("./pages/correo/CorreoConectarPage"));
const InboxPage = lazy(() => import("./pages/inbox/InboxPage"));
const InboxChannelsPage = lazy(() => import("./pages/inbox/ChannelsPage"));
const InboxBotsPage = lazy(() => import("./pages/inbox/BotsPage"));
const InboxAnalyticsPage = lazy(() => import("./pages/inbox/InboxAnalyticsPage"));
const TelegramChannelsPage = lazy(() => import("./pages/telegram/TelegramChannelsPage"));
const TelegramInboxPage = lazy(() => import("./pages/telegram/TelegramInboxPage"));
const OpportunitiesPage = lazy(() => import("./pages/opportunities/OpportunitiesPage"));


// Eager — main CRM pages.
const DesignSystem = lazy(() => import("./pages/DesignSystem"));
const Docs = lazy(() => import("./pages/Docs"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Dashboard2 = lazy(() => import("./pages/Dashboard2"));
const PanelDeControl = lazy(() => import("./pages/PanelDeControl"));

// Sales

// Creadores
const Creadores = lazy(() => import("./pages/Creadores"));
const CreadorasDashboardPage = lazy(() => import("./pages/creadores/CreadorasDashboardPage"));
const OnboardingPage = lazy(() => import("./pages/creadores/onboarding/OnboardingPage"));
const OnboardingWizardPage = lazy(() => import("./pages/creadores/onboarding/OnboardingWizardPage"));
const OffboardingListPage = lazy(() => import("./pages/creadores/offboarding/OffboardingListPage"));
const OffboardingDetailPage = lazy(() => import("./pages/creadores/offboarding/OffboardingDetailPage"));
const NuevoCreador = lazy(() => import("./pages/NuevoCreador"));
const CreadorProfile = lazy(() => import("./pages/CreadorProfile"));

// Teléfonos (cloud phones)
const TelefonosPage = lazy(() => import("./pages/telefonos/TelefonosPage"));

// LeadGen / Closers / Contactos
const LeadGen = lazy(() => import("./pages/LeadGen"));
const LeadGenBaseDatos = lazy(() => import("./pages/LeadGenBaseDatos"));
const Closers = lazy(() => import("./pages/Closers"));
const Tickets = lazy(() => import("./pages/Tickets"));
const Promolog = lazy(() => import("./pages/Promolog"));
const Parrilla = lazy(() => import("./pages/Parrilla"));
const Personalizados = lazy(() => import("./pages/personalizados/PersonalizadosPage"));
const ChatterHorarios = lazy(() => import("./pages/chatters/horarios/HorariosPage"));
const ChatterEvaluator = lazy(() => import("./pages/ChatterEvaluator"));
const ScouterAssist = lazy(() => import("./pages/scouter/ScouterAssist"));
const AgencyQA = lazy(() => import("./pages/agency-qa/AgencyQA"));
const ChatterProfileDetail = lazy(() => import("./pages/ChatterProfileDetail"));
const ChatterProfileEdit = lazy(() => import("./pages/ChatterProfileEdit"));
const ChatterAdmin = lazy(() => import("./pages/ChatterAdmin"));
const ChatterHistory = lazy(() => import("./pages/ChatterHistory"));
const ChatterHistorySessionDetail = lazy(() => import("./pages/chatter-evaluator/HistorySessionDetail"));
const ChatterWorkspace = lazy(() => import("./pages/ChatterWorkspace"));
const ChatterRendimiento = lazy(() => import("./pages/chatters/ChatterRendimiento"));
const Contactos = lazy(() => import("./pages/Contactos"));
const NuevoContacto = lazy(() => import("./pages/NuevoContacto"));

// Admin
const AdminUsuarios = lazy(() => import("./pages/admin/AdminUsuarios"));
const CentroOperaciones = lazy(() => import("./pages/admin/CentroOperaciones"));
const AuditoriaRoles = lazy(() => import("./pages/admin/AuditoriaRoles"));
const CoworkVsHubstaff = lazy(() => import("./pages/admin/CoworkVsHubstaff"));
const HorariosPage = lazy(() => import("./pages/admin/HorariosPage"));
const TardanzasPage = lazy(() => import("./pages/admin/TardanzasPage"));
const SaludPage = lazy(() => import("./pages/admin/SaludPage"));
const VirtualOfficePage = lazy(() => import("./pages/oficina-ai/VirtualOfficePage"));


// Misc
const Roadmap = lazy(() => import("./pages/Roadmap"));
const Messenger = lazy(() => import("./pages/Messenger"));
const Notificaciones = lazy(() => import("./pages/Notificaciones"));
const NotificacionesSettings = lazy(() => import("./pages/ajustes/NotificacionesSettings"));
const Settings = lazy(() => import("./pages/Settings"));

// HR — eager. The user navigates between subtabs constantly.
const HRLayout = lazy(() => import("./pages/hr/HRLayout"));
const HRDashboard = lazy(() => import("./pages/hr/HRDashboard"));
const EmployeeDirectory = lazy(() => import("./pages/hr/EmployeeDirectory"));
const EmployeeNew = lazy(() => import("./pages/hr/EmployeeNew"));
const EmployeeProfile = lazy(() => import("./pages/hr/EmployeeProfile"));
const HRAbsences = lazy(() => import("./pages/hr/HRAbsences"));
const HRIncidents = lazy(() => import("./pages/hr/HRIncidents"));
const HRApplicants = lazy(() => import("./pages/hr/HRApplicants"));
const HRTraining = lazy(() => import("./pages/hr/HRTraining"));
const HRTrainingChatters = lazy(() => import("./pages/hr/HRTrainingChatters"));
const HRTrainingTech = lazy(() => import("./pages/hr/HRTrainingTech"));
const HRPerformance = lazy(() => import("./pages/hr/HRPerformance"));
const HRPerformanceNew = lazy(() => import("./pages/hr/HRPerformanceNew"));
const HRAttendance = lazy(() => import("./pages/hr/HRAttendance"));
const HRVacations = lazy(() => import("./pages/hr/HRVacations"));
const HRPermisos = lazy(() => import("./pages/hr/HRPermisos"));
const HRPermisoNew = lazy(() => import("./pages/hr/HRPermisoNew"));
const HRSchedules = lazy(() => import("./pages/hr/HRSchedules"));
const HRStaffSchedules = lazy(() => import("./pages/hr/HRStaffSchedules"));
const HROvertimeDetail = lazy(() => import("./pages/hr/HROvertimeDetail"));
const HRHourBank = lazy(() => import("./pages/hr/HRHourBank"));
const HRChatterSchedules = lazy(() => import("./pages/hr/HRChatterSchedules"));
const HRIncidentNew = lazy(() => import("./pages/hr/HRIncidentNew"));
const HRApplicantNew = lazy(() => import("./pages/hr/HRApplicantNew"));
const HROnboarding = lazy(() => import("./pages/hr/HROnboarding"));
const HROnboardingNew = lazy(() => import("./pages/hr/HROnboardingNew"));
const HROffboarding = lazy(() => import("./pages/hr/HROffboarding"));
const HROffboardingNew = lazy(() => import("./pages/hr/HROffboardingNew"));
const HRMonitoring = lazy(() => import("./pages/hr/HRMonitoring"));
const HRMonitorIA = lazy(() => import("./pages/hr/HRMonitorIA"));
const HRExpediente = lazy(() => import("./pages/hr/HRExpediente"));
const ArgosComparativo = lazy(() => import("./pages/hr/ArgosComparativo"));
const ArgosAjustes = lazy(() => import("./pages/hr/ArgosAjustes"));
const HRDirectoryLookup = lazy(() => import("./pages/hr/HRDirectoryLookup"));
const HROrganigrama = lazy(() => import("./pages/hr/HROrganigrama"));
const HRDeductions = lazy(() => import("./pages/hr/HRDeductions"));
const HRDeductionNew = lazy(() => import("./pages/hr/HRDeductionNew"));
const HRAnnouncements = lazy(() => import("./pages/hr/HRAnnouncements"));
const HRPersonnel = lazy(() => import("./pages/hr/HRPersonnel"));
const HRPersonCard = lazy(() => import("./pages/hr/HRPersonCard"));
const HRPayroll = lazy(() => import("./pages/hr/HRPayroll"));

// Finanzas — eager.
const FinanzasLayout = lazy(() => import("./pages/finanzas/FinanzasLayout"));
const FinanzasDashboard = lazy(() => import("./pages/finanzas/FinanzasDashboard"));
const NominaPage = lazy(() => import("./pages/finanzas/nomina/NominaPage"));
const FacturacionPage = lazy(() => import("./pages/finanzas/facturacion/FacturacionPage"));
const NuevoInvoice = lazy(() => import("./pages/finanzas/facturacion/NuevoInvoice"));
const NuevaNotaPago = lazy(() => import("./pages/finanzas/facturacion/NuevaNotaPago"));
const TemplatesPage = lazy(() => import("./pages/finanzas/facturacion/TemplatesPage"));
const ControlFinancieroPage = lazy(() => import("./pages/finanzas/control/ControlFinancieroPage"));
const ReportesPage = lazy(() => import("./pages/finanzas/reportes/ReportesPage"));
const ConfiguracionPage = lazy(() => import("./pages/finanzas/configuracion/ConfiguracionPage"));
const CollectionsPage = lazy(() => import("./pages/finanzas/collections/CollectionsPage"));
const HorasVariablesPage = lazy(() => import("./pages/finanzas/horas-variables/HorasVariablesPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Bumped from 60s to 5min: most app data (user profile, permissions,
      // sidebar counts, tab badges) doesn't need to refetch on every nav.
      // The pages that DO want fresher data already pass their own
      // staleTime/refetchInterval.
      staleTime: 5 * 60_000,
      // Bumped from default (5min) to 30min so cached queries survive a
      // few nav round-trips — switching to a tab and back instantly
      // re-uses the data instead of triggering a "loading" state.
      gcTime: 30 * 60_000,
      // Was true. Every time the user came back to the tab the entire
      // app's queries refired, which is a big chunk of the "feels like a
      // full reload" perception. Pages that want fresh-on-focus opt in
      // explicitly via their own useQuery options.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// El ROL y los PERMISOS deciden qué ve cada persona: si su consulta falla, el
// menú queda con solo los módulos universales y se siente como si la sesión se
// hubiera caído. Un intento (el default de arriba) es poco para algo así, así
// que estas dos van con 3 y espera creciente. Va acá y no dentro de los hooks
// porque un `retry` en el useQuery pisa al del cliente, y las pruebas crean su
// propio QueryClient con `retry: false` para no esperar de gusto.
const REINTENTOS_CRITICOS = {
  retry: 3,
  retryDelay: (intento: number) => Math.min(500 * 2 ** intento, 8000),
};
queryClient.setQueryDefaults(["user-role"], REINTENTOS_CRITICOS);
queryClient.setQueryDefaults(["user-permissions"], REINTENTOS_CRITICOS);

// Subtle loading bar while a lazy chunk downloads. The previous full-
// screen spinner blanked everything (sidebar, topbar, content) and made
// every nav feel like a hard reload. This sits as a thin progress strip
// at the top so the previous page stays visible underneath.
const LoadingFallback = () => (
  <>
    <div className="fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden">
      <div className="h-full w-1/3 animate-[loading-bar_1.2s_ease-in-out_infinite] bg-primary" />
    </div>
    <div
      className="fixed inset-0 z-[99] flex flex-col items-center justify-center gap-9 bg-background opacity-0"
      style={{ animation: "delayed-fade-in 0.25s ease-out 0.18s forwards" }}
    >
      <Logo size="lg" />
      <div className="relative h-1 w-[220px] overflow-hidden rounded-full bg-foreground/10">
        <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-accent to-primary animate-[loading-bar_1.2s_ease-in-out_infinite]" />
      </div>
    </div>
  </>
);

// Render nulo, solo efectos: aplica el skin guardado (localStorage) al montar
// y, cuando la sesión resuelve, sincroniza con profiles.ui_skin para que el
// skin elegido siga al usuario en cualquier dispositivo/pantalla.
const SkinBoot = () => {
  useSkinSync();
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    {/* enableSystem: la card Apariencia de Settings ofrece "Sistema" además de
        Oscuro/Claro. El default sigue siendo dark y el toggle del sidebar
        sigue funcionando igual (dark ⇄ light). */}
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <TooltipProvider>
        <LanguageProvider>
        <AuthProvider>
        <OnlinePresenceProvider>
          <SkinBoot />
          <Toaster />
          {/* Solo aparece si la persona entró por el dominio anterior. */}
          <AvisoMudanzaDominio />
          {/* Solo con sesión y si la hora del computador va 5 min o más mal. */}
          <AvisoRelojDesfasado />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Portada />} />
              <Route path="/privacidad" element={<Privacidad />} />
              <Route path="/documentation" element={<Documentacion />} />
              {/* Medidas del dispositivo para depurar la PWA en teléfonos (pública). */}
              <Route path="/diagnostico-pantalla" element={<DiagnosticoPantalla />} />
              <Route path="/login" element={<Login />} />
              {/* El registro público está cerrado (ver `bloquear_alta_publica`
                  en la base): quien llega con un link viejo cae en el
                  formulario de demo, no en un formulario que no funciona. */}
              <Route path="/register" element={<Navigate to="/#demo" replace />} />
              <Route path="/concept" element={<Concepto />} />
              {import.meta.env.DEV && Credentials && <Route path="/credentials" element={<Credentials />} />}
              
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              {/* Chatter public view — no auth, accessible via /chatter/<sessionId> */}
              <Route path="/chatter/:sessionId" element={<ChatterPublicView />} />
              {/* Subida pública por link: la gente sube contenido al Drive SIN cuenta.
                  /subir/ es el alias nuevo para esquivar SWs cacheados en navegadores
                  que ya habían entrado a /aportar/ antes del fix del motor TUS
                  (Alvaro, 06/11): el SW viejo no intercepta /subir/, el navegador
                  va directo al servidor y baja el bundle fresco. Misma página, mismo
                  token; se pueden usar ambos en paralelo. */}
              <Route path="/aportar/:token" element={<PaginaAportar />} />
              <Route path="/subir/:token" element={<PaginaAportar />} />
              {/* Invitado a un Meet sin cuenta en Maven: pide entrada y espera que
                  alguien de adentro lo admita. Pública a propósito. */}
              <Route path="/entrar/:code" element={<MeetGuestPage />} />

              {/* Portal de creadoras: entrar y elegir contraseña son públicas; su
                  espacio lo cuida PortalLayout (solo cuentas de creadora). */}
              <Route path="/portal/entrar" element={<PortalEntrar />} />
              <Route path="/portal/contrasena" element={<PortalContrasena />} />
              <Route path="/portal" element={<PortalLayout />}>
                <Route index element={<PortalInicio />} />
                <Route path="contenido" element={<PortalContenido />} />
                <Route path="ficha" element={<PortalFicha />} />
                {/* «Mis accesos» ahora es la primera parte de «Mi ficha» (Jhon, 08/10). */}
                <Route path="accesos" element={<Navigate to="/portal/ficha?seccion=accesos" replace />} />
                <Route path="pedidos" element={<PortalPedidos />} />
                <Route path="ajustes" element={<PortalAjustes />} />
                <Route path="*" element={<Navigate to="/portal" replace />} />
              </Route>

              {/* Protected routes that share the AppShell — Sidebar +
                  Topbar mount once and persist across nav between these
                  routes. Only the full-screen video pages stay outside. */}
              <Route element={<ProtectedRoute><CallProvider><PersistentCallProvider><AppShell /></PersistentCallProvider></CallProvider></ProtectedRoute>}>
                <Route path="/dashboard" element={<Dashboard />} />
                {/* Dashboard Ventas (antes "Dashboard v2"). Pasó de solo-admin al
                    módulo Ventas: absorbió /sales-overview, que ya veían 7 roles.
                    La URL no cambia para no romper links ni la PWA de nadie. */}
                <Route path="/dashboard2" element={<PermissionRoute module="Creator Sales" submodule="Dashboard"><Dashboard2 /></PermissionRoute>} />
                <Route path="/panel-de-control" element={<PermissionRoute module="Panel de control"><PanelDeControl /></PermissionRoute>} />
                <Route path="/design-system" element={<DesignSystem />} />
                <Route path="/docs" element={<Docs />} />
                <Route path="/contactos" element={<PermissionRoute module="Contactos"><Contactos /></PermissionRoute>} />
                <Route path="/contactos/nuevo" element={<PermissionRoute module="Contactos"><NuevoContacto /></PermissionRoute>} />
                <Route path="/creadores" element={<PermissionRoute module="Creadores" submodule="Lista"><Creadores /></PermissionRoute>} />
                <Route path="/creadores/dashboard" element={<PermissionRoute module="Creadores" submodule="Dashboard"><CreadorasDashboardPage /></PermissionRoute>} />
                <Route path="/creadores/nuevo" element={<PermissionRoute module="Creadores" submodule="Nuevo"><NuevoCreador /></PermissionRoute>} />
                <Route path="/creadores/onboarding" element={<PermissionRoute module="Creadores" submodule="Onboarding"><OnboardingPage /></PermissionRoute>} />
                <Route path="/creadores/onboarding/nuevo" element={<PermissionRoute module="Creadores" submodule="Onboarding"><OnboardingWizardPage /></PermissionRoute>} />
                <Route path="/creadores/onboarding/:id" element={<PermissionRoute module="Creadores" submodule="Onboarding"><OnboardingWizardPage /></PermissionRoute>} />
                <Route path="/creadores/offboarding" element={<PermissionRoute module="Creadores" submodule="Offboarding"><OffboardingListPage /></PermissionRoute>} />
                <Route path="/creadores/offboarding/:offboardingId" element={<PermissionRoute module="Creadores" submodule="Offboarding"><OffboardingDetailPage /></PermissionRoute>} />
                {/* Perfil: permiso Creadores · Perfil, o chatter cuyo grupo atiende a esa creadora (Horarios). */}
                <Route path="/creadores/:id" element={<CreadorRosterRoute><CreadorProfile /></CreadorRosterRoute>} />
                <Route path="/leadgen" element={<PermissionRoute module="LeadGen"><LeadGen /></PermissionRoute>} />
                <Route path="/leadgen/base-datos" element={<PermissionRoute module="LeadGen"><LeadGenBaseDatos /></PermissionRoute>} />
                <Route path="/closers" element={<PermissionRoute module="Closers"><Closers /></PermissionRoute>} />
                {/* Inbox WhatsApp (bandeja propia) — gateado por permisos (módulo "WhatsApp"). Admin siempre; otros roles según role_permissions. */}
                <Route path="/inbox" element={<PermissionRoute module="WhatsApp" submodule="Bandeja"><InboxPage /></PermissionRoute>} />
                <Route path="/inbox/canales" element={<PermissionRoute module="WhatsApp" submodule="Canales"><InboxChannelsPage /></PermissionRoute>} />
                <Route path="/inbox/bots" element={<PermissionRoute module="WhatsApp" submodule="Canales"><InboxBotsPage /></PermissionRoute>} />
                <Route path="/inbox/analitica" element={<PermissionRoute module="WhatsApp" submodule="Analítica"><InboxAnalyticsPage /></PermissionRoute>} />
                {/* Telegram (canal) — S0: cuentas/manager. Bandeja + botón = próximos slices. */}
                <Route path="/telegram" element={<PermissionRoute module="Telegram"><TelegramChannelsPage /></PermissionRoute>} />
                <Route path="/telegram/bandeja" element={<PermissionRoute module="Telegram" submodule="Bandeja"><TelegramInboxPage /></PermissionRoute>} />
                {/* Oportunidades ahora vive como subtab dentro de Closers (gated por Closers/Oportunidades). El path viejo redirige. */}
                <Route path="/oportunidades" element={<Navigate to="/closers" replace />} />
                <Route path="/tickets" element={<PermissionRoute module="Tickets"><Tickets /></PermissionRoute>} />
                <Route path="/promolog" element={<PermissionRoute module="Promolog"><Promolog /></PermissionRoute>} />
                <Route path="/parrilla" element={<PermissionRoute module="Parrilla"><Parrilla /></PermissionRoute>} />
                <Route path="/personalizados" element={<PermissionRoute module="Personalizados"><Personalizados /></PermissionRoute>} />
                <Route path="/telefonos" element={<PermissionRoute module="Telefonos"><TelefonosPage /></PermissionRoute>} />
                {/* Migrated areas from kash-call-qa — placeholders for now */}
                <Route path="/scouter-assist" element={<PermissionRoute module="Scouter Assist"><ScouterAssist /></PermissionRoute>} />
                <Route path="/agency-qa" element={<PermissionRoute module="Agency QA"><AgencyQA /></PermissionRoute>} />
                {/* Sales Overview — sub-rutas eliminadas; ahora vive todo en modales */}
                {/* Chatter Evaluator — submodule-gated so admins can give
                    chatters Evaluator-only access without exposing the
                    admin/workspace tooling. */}
                <Route path="/chatter-evaluator" element={<PermissionRoute module="Chatters" submodule="Evaluator"><ChatterEvaluator /></PermissionRoute>} />
                <Route path="/chatter-evaluator/admin" element={<PermissionRoute module="Chatters" submodule="Admin"><ChatterAdmin /></PermissionRoute>} />
                <Route path="/chatter-evaluator/history" element={<PermissionRoute module="Chatters" submodule="Evaluator"><ChatterHistory /></PermissionRoute>} />
                <Route path="/chatter-evaluator/history/:sessionId" element={<PermissionRoute module="Chatters" submodule="Evaluator"><ChatterHistorySessionDetail /></PermissionRoute>} />
                <Route path="/chatter-evaluator/workspace" element={<PermissionRoute module="Chatters" submodule="Workspace"><ChatterWorkspace /></PermissionRoute>} />
                <Route path="/chatter-evaluator/rendimiento" element={<PermissionRoute module="Chatters" submodule="Rendimiento"><ChatterRendimiento /></PermissionRoute>} />
                <Route path="/chatters/horarios" element={<PermissionRoute module="Chatters" submodule="Horarios"><ChatterHorarios /></PermissionRoute>} />
                <Route path="/chatter-evaluator/:profileKey" element={<PermissionRoute module="Chatters" submodule="Evaluator"><ChatterProfileDetail /></PermissionRoute>} />
                <Route path="/chatter-evaluator/:profileKey/edit" element={<PermissionRoute module="Chatters" submodule="Admin"><ChatterProfileEdit /></PermissionRoute>} />
                <Route path="/roadmap" element={<Roadmap />} />
                <Route path="/correo" element={<PermissionRoute module="Correo"><CorreoPage /></PermissionRoute>} />
                {/* Retorno del OAuth de Zoho. SIN PermissionRoute: la URL está
                    registrada en Zoho y tiene que resolver aunque el módulo
                    todavía no esté habilitado para el rol. Va protegida igual
                    por ProtectedRoute (hay que estar logueado) y por el state
                    firmado que valida el backend. */}
                <Route path="/correo/conectar" element={<CorreoConectarPage />} />
                <Route path="/messenger" element={<PermissionRoute module="Messenger"><Messenger /></PermissionRoute>} />
                <Route path="/cowork" element={<PermissionRoute module="Cowork"><CoworkPage /></PermissionRoute>} />
                <Route path="/meet" element={<PermissionRoute module="Meet"><MeetPage /></PermissionRoute>} />
                <Route path="/grabaciones" element={<PermissionRoute module="Grabaciones"><GrabacionesPage /></PermissionRoute>} />
                {/* ⚠️ `/oficina/hojas` y `/oficina/:id` compiten por la misma
                    forma. React Router 6 rankea lo ESTÁTICO por encima de lo
                    dinámico, así que gana la sección y no un documento con id
                    "hojas" (que además no puede existir: los ids son UUID).
                    Hay guarda en rutasDeOficina.test.ts. */}
                <Route path="/oficina" element={<PermissionRoute module="Oficina" submodule="Documentos"><OficinaPage formato="docx" /></PermissionRoute>} />
                <Route path="/oficina/calendario" element={<PermissionRoute module="Oficina" submodule="Calendario"><CalendarioPage /></PermissionRoute>} />
                <Route path="/oficina/hojas" element={<PermissionRoute module="Oficina" submodule="Hojas de cálculo"><OficinaPage formato="xlsx" /></PermissionRoute>} />
                <Route path="/oficina/presentaciones" element={<PermissionRoute module="Oficina" submodule="Presentaciones"><OficinaPage formato="pptx" /></PermissionRoute>} />
                <Route path="/oficina/drive" element={<PermissionRoute module="Oficina" submodule="Drive"><DrivePage /></PermissionRoute>} />
                {/* Un archivo del Drive abierto en la Oficina (editado en su
                    lugar, como el modo de edición de Office de Google). Lo
                    abre «Abrir» desde Documentos, Hojas o Presentaciones: no
                    pide el submódulo Drive, la RLS decide qué se puede abrir. */}
                <Route path="/oficina/drive/:id" element={<PermissionRoute module="Oficina"><ArchivoDelDrivePage /></PermissionRoute>} />
                <Route path="/oficina/:id" element={<PermissionRoute module="Oficina"><DocumentoPage /></PermissionRoute>} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/notificaciones" element={<Notificaciones />} />
                <Route path="/ajustes/notificaciones" element={<NotificacionesSettings />} />
                {/* HR routes */}
                <Route path="/hr" element={<PermissionRoute module="HR" submodule="Dashboard"><HRLayout><HRDashboard /></HRLayout></PermissionRoute>} />
                <Route path="/hr/personal" element={<PermissionRoute module="HR" submodule="Empleados Activos"><HRLayout><HRPersonnel /></HRLayout></PermissionRoute>} />
                <Route path="/hr/persona/:id" element={<PermissionRoute module="HR" submodule="Empleados Activos"><HRLayout><HRPersonCard /></HRLayout></PermissionRoute>} />
                <Route path="/hr/nomina" element={<PermissionRoute module="HR" submodule="Deducciones"><HRLayout><HRPayroll /></HRLayout></PermissionRoute>} />
                <Route path="/hr/directorio" element={<PermissionRoute module="HR" submodule="Empleados Activos"><HRLayout><EmployeeDirectory /></HRLayout></PermissionRoute>} />
                <Route path="/hr/empleado/nuevo" element={<PermissionRoute module="HR" submodule="Empleados Activos"><HRLayout><EmployeeNew /></HRLayout></PermissionRoute>} />
                <Route path="/hr/empleado/:id" element={<PermissionRoute module="HR" submodule="Empleados Activos"><HRLayout><EmployeeProfile /></HRLayout></PermissionRoute>} />
                <Route path="/hr/ausencias" element={<PermissionRoute module="HR" submodule="Vacaciones"><HRLayout><HRAbsences /></HRLayout></PermissionRoute>} />
                <Route path="/hr/incidentes" element={<PermissionRoute module="HR" submodule="Incidentes"><HRLayout><HRIncidents /></HRLayout></PermissionRoute>} />
                <Route path="/hr/incidentes/nuevo" element={<PermissionRoute module="HR" submodule="Incidentes"><HRLayout><HRIncidentNew /></HRLayout></PermissionRoute>} />
                <Route path="/hr/candidatos" element={<PermissionRoute module="HR" submodule="Candidatos"><HRLayout><HRApplicants /></HRLayout></PermissionRoute>} />
                <Route path="/hr/candidatos/nuevo" element={<PermissionRoute module="HR" submodule="Candidatos"><HRLayout><HRApplicantNew /></HRLayout></PermissionRoute>} />
                <Route path="/hr/onboarding" element={<PermissionRoute module="HR" submodule="Onboarding"><HRLayout><HROnboarding /></HRLayout></PermissionRoute>} />
                <Route path="/hr/onboarding/nuevo" element={<PermissionRoute module="HR" submodule="Onboarding"><HRLayout><HROnboardingNew /></HRLayout></PermissionRoute>} />
                <Route path="/hr/offboarding" element={<PermissionRoute module="HR" submodule="Offboarding"><HRLayout><HROffboarding /></HRLayout></PermissionRoute>} />
                <Route path="/hr/offboarding/nuevo" element={<PermissionRoute module="HR" submodule="Offboarding"><HRLayout><HROffboardingNew /></HRLayout></PermissionRoute>} />
                <Route path="/hr/capacitacion" element={<PermissionRoute module="HR" submodule="Capacitación"><HRLayout><HRTraining /></HRLayout></PermissionRoute>} />
                <Route path="/hr/capacitacion/chatters" element={<PermissionRoute module="HR" submodule="Capacitación"><HRLayout><HRTrainingChatters /></HRLayout></PermissionRoute>} />
                <Route path="/hr/capacitacion/tecnologia" element={<PermissionRoute module="HR" submodule="Capacitación"><HRLayout><HRTrainingTech /></HRLayout></PermissionRoute>} />
                <Route path="/hr/desempeno" element={<PermissionRoute module="HR" submodule="Desempeño"><HRLayout><HRPerformance /></HRLayout></PermissionRoute>} />
                <Route path="/hr/desempeno/nuevo" element={<PermissionRoute module="HR" submodule="Desempeño"><HRLayout><HRPerformanceNew /></HRLayout></PermissionRoute>} />
                <Route path="/hr/asistencia" element={<PermissionRoute module="HR" submodule="Asistencia"><HRLayout><HRAttendance /></HRLayout></PermissionRoute>} />
                <Route path="/hr/vacaciones" element={<PermissionRoute module="HR" submodule="Vacaciones"><HRLayout><HRVacations /></HRLayout></PermissionRoute>} />
                <Route path="/hr/permisos" element={<PermissionRoute module="HR" submodule="Permisos"><HRLayout><HRPermisos /></HRLayout></PermissionRoute>} />
                <Route path="/hr/permisos/nuevo" element={<PermissionRoute module="HR" submodule="Permisos"><HRLayout><HRPermisoNew /></HRLayout></PermissionRoute>} />
                <Route path="/hr/horarios" element={<PermissionRoute module="HR" submodule="Horarios"><HRLayout><HRSchedules /></HRLayout></PermissionRoute>} />
                <Route path="/hr/horarios-personal" element={<PermissionRoute module="HR" submodule="Horarios"><HRLayout><HRStaffSchedules /></HRLayout></PermissionRoute>} />
                <Route path="/hr/horarios/horas-extras" element={<PermissionRoute module="HR" submodule="Horas Extra"><HRLayout><HROvertimeDetail /></HRLayout></PermissionRoute>} />
                <Route path="/hr/horarios/banco-horas" element={<PermissionRoute module="HR" submodule="Banco de Horas"><HRLayout><HRHourBank /></HRLayout></PermissionRoute>} />
                <Route path="/hr/horarios-chatters" element={<PermissionRoute module="HR" submodule="Horarios Chatters"><HRLayout><HRChatterSchedules /></HRLayout></PermissionRoute>} />
                <Route path="/hr/monitoreo" element={<PermissionRoute module="HR" submodule="Monitoreo"><HRLayout><HRMonitoring /></HRLayout></PermissionRoute>} />
                {/* Argos (por ahora) solo para el dueño de la empresa: soloDueno. */}
                <Route path="/hr/monitor-ia" element={<PermissionRoute module="HR" submodule="Monitor IA" soloDueno><HRLayout><HRMonitorIA /></HRLayout></PermissionRoute>} />
                <Route path="/hr/expediente/:userId" element={<PermissionRoute module="HR" submodule="Monitor IA" soloDueno><HRLayout><HRExpediente /></HRLayout></PermissionRoute>} />
                <Route path="/hr/argos-comparativo" element={<PermissionRoute module="HR" submodule="Monitor IA" soloDueno><HRLayout><ArgosComparativo /></HRLayout></PermissionRoute>} />
                <Route path="/hr/argos-ajustes" element={<PermissionRoute module="HR" submodule="Monitor IA" soloDueno><HRLayout><ArgosAjustes /></HRLayout></PermissionRoute>} />
                <Route path="/hr/organizacion/directorio" element={<PermissionRoute module="HR" submodule="Directorio"><HRLayout><HRDirectoryLookup /></HRLayout></PermissionRoute>} />
                <Route path="/hr/organizacion/organigrama" element={<PermissionRoute module="HR" submodule="Organigrama"><HRLayout><HROrganigrama /></HRLayout></PermissionRoute>} />
                <Route path="/hr/deducciones" element={<PermissionRoute module="HR" submodule="Deducciones"><HRLayout><HRDeductions /></HRLayout></PermissionRoute>} />
                <Route path="/hr/deducciones/nuevo" element={<PermissionRoute module="HR" submodule="Deducciones"><HRLayout><HRDeductionNew /></HRLayout></PermissionRoute>} />
                <Route path="/hr/anuncios" element={<PermissionRoute module="HR" submodule="Anuncios"><HRLayout><HRAnnouncements /></HRLayout></PermissionRoute>} />
                {/* Finanzas routes */}
                <Route path="/finanzas" element={<PermissionRoute module="Finanzas" submodule="Dashboard"><FinanzasLayout><FinanzasDashboard /></FinanzasLayout></PermissionRoute>} />
                <Route path="/finanzas/nomina" element={<PermissionRoute module="Finanzas" submodule="Nómina"><FinanzasLayout><NominaPage /></FinanzasLayout></PermissionRoute>} />
                <Route path="/finanzas/facturacion/invoices" element={<PermissionRoute module="Finanzas" submodule="Invoices"><FinanzasLayout><FacturacionPage /></FinanzasLayout></PermissionRoute>} />
                <Route path="/finanzas/facturacion" element={<Navigate to="/finanzas/facturacion/invoices" replace />} />
                <Route path="/finanzas/facturacion/facturas/nueva" element={<PermissionRoute module="Finanzas" submodule="Invoices"><NuevoInvoice /></PermissionRoute>} />
                <Route path="/finanzas/facturacion/notasdepago/nueva" element={<PermissionRoute module="Finanzas" submodule="Invoices"><NuevaNotaPago /></PermissionRoute>} />
                <Route path="/finanzas/facturacion/templates" element={<PermissionRoute module="Finanzas" submodule="Templates"><FinanzasLayout><TemplatesPage /></FinanzasLayout></PermissionRoute>} />
                <Route path="/finanzas/control" element={<PermissionRoute module="Finanzas" submodule="Control Financiero"><FinanzasLayout><ControlFinancieroPage /></FinanzasLayout></PermissionRoute>} />
                <Route path="/finanzas/reportes" element={<PermissionRoute module="Finanzas" submodule="Reportes"><FinanzasLayout><ReportesPage /></FinanzasLayout></PermissionRoute>} />
                <Route path="/finanzas/collections" element={<PermissionRoute module="Finanzas" submodule="Collections"><FinanzasLayout><CollectionsPage /></FinanzasLayout></PermissionRoute>} />
                <Route path="/finanzas/horas-variables" element={<PermissionRoute module="Finanzas" submodule="Horas Variables"><FinanzasLayout><HorasVariablesPage /></FinanzasLayout></PermissionRoute>} />
                <Route path="/finanzas/configuracion" element={<PermissionRoute module="Finanzas" submodule="Configuración"><FinanzasLayout><ConfiguracionPage /></FinanzasLayout></PermissionRoute>} />
                {/* Admin routes */}
                <Route path="/admin/usuarios" element={<AdminRoute><AdminUsuarios /></AdminRoute>} />
                <Route path="/admin/auditoria" element={<AdminRoute><AuditoriaRoles /></AdminRoute>} />
                <Route path="/admin/centro-de-operaciones" element={<AdminRoute><CentroOperaciones /></AdminRoute>} />
                <Route path="/admin/cowork-vs-hubstaff" element={<AdminRoute><CoworkVsHubstaff /></AdminRoute>} />
                <Route path="/admin/horarios" element={<AdminRoute><HorariosPage /></AdminRoute>} />
                <Route path="/admin/tardanzas" element={<AdminRoute><TardanzasPage /></AdminRoute>} />
                <Route path="/admin/salud" element={<AdminRoute><SaludPage /></AdminRoute>} />
                <Route path="/oficina-ai" element={<VirtualOfficePage />} />
              </Route>

              {/* Full-screen routes that intentionally bypass the shell */}
              <Route path="/call/:roomName" element={<ProtectedRoute><VideoCallPage /></ProtectedRoute>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </OnlinePresenceProvider>
        </AuthProvider>
        </LanguageProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
