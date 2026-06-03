import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import { OnlinePresenceProvider } from "@/hooks/useOnlinePresence";
import ProtectedRoute from "@/components/ProtectedRoute";
import PermissionRoute from "@/components/PermissionRoute";
import AdminRoute from "./components/AdminRoute";
import AppShell from "@/components/dashboard/AppShell";
import Logo from "@/components/Logo";

// All sidebar-reachable pages are imported eagerly so the FIRST nav to
// each one is instant — no chunk download, no spinner. The initial
// bundle is a bit larger but the in-app navigation feels native, which
// the user expects ("se siente como en otros CRMs").
//
// Only pages that are public, full-screen, or rarely visited stay
// lazy (login forgot/reset, video calls, Proyecto MP, share tokens).

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";

// Rare / public — kept lazy.
const Concept = lazy(() => import("./pages/Concept"));
// SEGURIDAD: página de login de demo (roles de prueba + contraseña hardcodeada).
// Solo en desarrollo: en prod no se rutea NI se bundlea (la rama queda muerta y
// el chunk —con la contraseña— se elimina por tree-shaking en el build de prod).
const Credentials = import.meta.env.DEV ? lazy(() => import("./pages/Credentials")) : null;
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ChatterPublicView = lazy(() => import("./pages/ChatterPublicView"));
const EventoSharePage = lazy(() => import("./pages/eventos/EventoSharePage"));
const SharedAgendaPage = lazy(() => import("./pages/eventos/SharedAgendaPage"));
const TaskSharePage = lazy(() => import("./pages/tareas/TaskSharePage"));
const ProjectSharePage = lazy(() => import("./pages/tareas/ProjectSharePage"));
const VideoCallPage = lazy(() => import("./pages/VideoCallPage"));
const CoworkPage = lazy(() => import("./pages/cowork/CoworkPage"));
const InboxPage = lazy(() => import("./pages/inbox/InboxPage"));
const InboxChannelsPage = lazy(() => import("./pages/inbox/ChannelsPage"));
const InboxBotsPage = lazy(() => import("./pages/inbox/BotsPage"));
const OpportunitiesPage = lazy(() => import("./pages/opportunities/OpportunitiesPage"));

// Proyecto MP — its own sub-app, kept lazy.
const ProyectoMPLayout = lazy(() => import("./pages/proyectomp/ProyectoMPLayout"));
const ProyectoMPDashboard = lazy(() => import("./pages/proyectomp/ProyectoMPDashboard"));
const ProyectoMPTareas = lazy(() => import("./pages/proyectomp/ProyectoMPTareas"));
const ProyectoMPPipeline = lazy(() => import("./pages/proyectomp/ProyectoMPPipeline"));
const ProyectoMPContenido = lazy(() => import("./pages/proyectomp/ProyectoMPContenido"));
const ProyectoMPTrafico = lazy(() => import("./pages/proyectomp/ProyectoMPTrafico"));
const ProyectoMPFinanzas = lazy(() => import("./pages/proyectomp/ProyectoMPFinanzas"));
const ProyectoMPEquipo = lazy(() => import("./pages/proyectomp/ProyectoMPEquipo"));
const ProyectoMPMilestones = lazy(() => import("./pages/proyectomp/ProyectoMPMilestones"));

// Eager — main CRM pages.
import DesignSystem from "./pages/DesignSystem";
import Docs from "./pages/Docs";
import Dashboard from "./pages/Dashboard";
import Dashboard2 from "./pages/Dashboard2";
import PanelDeControl from "./pages/PanelDeControl";

// Sales
import SalesDashboard from "./pages/SalesDashboard";
import SalesAudit from "./pages/SalesAudit";
import SalesOverview from "./pages/SalesOverview";
import AiSales from "./pages/AiSales";

// Creadores
import Creadores from "./pages/Creadores";
import CreadorasDashboardPage from "./pages/creadores/CreadorasDashboardPage";
import OnboardingPage from "./pages/creadores/onboarding/OnboardingPage";
import OnboardingWizardPage from "./pages/creadores/onboarding/OnboardingWizardPage";
import OffboardingListPage from "./pages/creadores/offboarding/OffboardingListPage";
import OffboardingDetailPage from "./pages/creadores/offboarding/OffboardingDetailPage";
import NuevoCreador from "./pages/NuevoCreador";
import CreadorProfile from "./pages/CreadorProfile";
import PersonalizadosPage from "./pages/creadores/personalizados/PersonalizadosPage";

// Eventos
import Eventos from "./pages/Eventos";
import NuevoEvento from "./pages/NuevoEvento";
import EditEvento from "./pages/EditEvento";
import EventoDetail from "./pages/EventoDetail";

// LeadGen / Closers / Contactos
import LeadGen from "./pages/LeadGen";
import LeadGenBaseDatos from "./pages/LeadGenBaseDatos";
import Closers from "./pages/Closers";
import Tickets from "./pages/Tickets";
import Promolog from "./pages/Promolog";
import ChatterEvaluator from "./pages/ChatterEvaluator";
import ScouterAssist from "./pages/scouter/ScouterAssist";
import AgencyQA from "./pages/agency-qa/AgencyQA";
import ChatterProfileDetail from "./pages/ChatterProfileDetail";
import ChatterProfileEdit from "./pages/ChatterProfileEdit";
import ChatterAdmin from "./pages/ChatterAdmin";
import ChatterHistory from "./pages/ChatterHistory";
import ChatterHistorySessionDetail from "./pages/chatter-evaluator/HistorySessionDetail";
import ChatterWorkspace from "./pages/ChatterWorkspace";
import Contactos from "./pages/Contactos";
import NuevoContacto from "./pages/NuevoContacto";

// Tareas
import Tareas from "./pages/Tareas";
import TareaProject from "./pages/TareaProject";

// Admin
import AdminUsuarios from "./pages/admin/AdminUsuarios";
import AuditoriaRoles from "./pages/admin/AuditoriaRoles";

// Wishlist
import Wishlist from "./pages/SuperContacts";
import WishlistProfile from "./pages/supercontacts/SuperContactProfile";

// Misc
import Roadmap from "./pages/Roadmap";
import Messenger from "./pages/Messenger";
import Notificaciones from "./pages/Notificaciones";
import NotificacionesSettings from "./pages/ajustes/NotificacionesSettings";
import Settings from "./pages/Settings";

// HR — eager. The user navigates between subtabs constantly.
import HRLayout from "./pages/hr/HRLayout";
import HRDashboard from "./pages/hr/HRDashboard";
import EmployeeDirectory from "./pages/hr/EmployeeDirectory";
import EmployeeNew from "./pages/hr/EmployeeNew";
import EmployeeProfile from "./pages/hr/EmployeeProfile";
import HRAbsences from "./pages/hr/HRAbsences";
import HRIncidents from "./pages/hr/HRIncidents";
import HRApplicants from "./pages/hr/HRApplicants";
import HRTraining from "./pages/hr/HRTraining";
import HRTrainingChatters from "./pages/hr/HRTrainingChatters";
import HRTrainingTech from "./pages/hr/HRTrainingTech";
import HRPerformance from "./pages/hr/HRPerformance";
import HRPerformanceNew from "./pages/hr/HRPerformanceNew";
import HRAttendance from "./pages/hr/HRAttendance";
import HRVacations from "./pages/hr/HRVacations";
import HRPermisos from "./pages/hr/HRPermisos";
import HRPermisoNew from "./pages/hr/HRPermisoNew";
import HRSchedules from "./pages/hr/HRSchedules";
import HROvertimeDetail from "./pages/hr/HROvertimeDetail";
import HRHourBank from "./pages/hr/HRHourBank";
import HRChatterSchedules from "./pages/hr/HRChatterSchedules";
import HRIncidentNew from "./pages/hr/HRIncidentNew";
import HRApplicantNew from "./pages/hr/HRApplicantNew";
import HROnboarding from "./pages/hr/HROnboarding";
import HROnboardingNew from "./pages/hr/HROnboardingNew";
import HROffboarding from "./pages/hr/HROffboarding";
import HROffboardingNew from "./pages/hr/HROffboardingNew";
import HRMonitoring from "./pages/hr/HRMonitoring";
import HRDirectoryLookup from "./pages/hr/HRDirectoryLookup";
import HROrganigrama from "./pages/hr/HROrganigrama";
import HRDeductions from "./pages/hr/HRDeductions";
import HRDeductionNew from "./pages/hr/HRDeductionNew";
import HRAnnouncements from "./pages/hr/HRAnnouncements";

// Finanzas — eager.
import FinanzasLayout from "./pages/finanzas/FinanzasLayout";
import FinanzasDashboard from "./pages/finanzas/FinanzasDashboard";
import NominaPage from "./pages/finanzas/nomina/NominaPage";
import FacturacionPage from "./pages/finanzas/facturacion/FacturacionPage";
import NuevoInvoice from "./pages/finanzas/facturacion/NuevoInvoice";
import NuevaNotaPago from "./pages/finanzas/facturacion/NuevaNotaPago";
import TemplatesPage from "./pages/finanzas/facturacion/TemplatesPage";
import ControlFinancieroPage from "./pages/finanzas/control/ControlFinancieroPage";
import ReportesPage from "./pages/finanzas/reportes/ReportesPage";
import ConfiguracionPage from "./pages/finanzas/configuracion/ConfiguracionPage";
import CollectionsPage from "./pages/finanzas/collections/CollectionsPage";
import HorasVariablesPage from "./pages/finanzas/horas-variables/HorasVariablesPage";

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <LanguageProvider>
        <AuthProvider>
        <OnlinePresenceProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/concept" element={<Concept />} />
              {import.meta.env.DEV && Credentials && <Route path="/credentials" element={<Credentials />} />}
              
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/eventos/share/:token" element={<EventoSharePage />} />
              {/* Chatter public view — no auth, accessible via /chatter/<sessionId> */}
              <Route path="/chatter/:sessionId" element={<ChatterPublicView />} />
              <Route path="/shared/agenda/:token" element={<SharedAgendaPage />} />
              <Route path="/tareas/share/:token" element={<TaskSharePage />} />
              <Route path="/tareas/project-share/:token" element={<ProjectSharePage />} />

              {/* Protected routes that share the AppShell — Sidebar +
                  Topbar mount once and persist across nav between these
                  routes. Only ProyectoMP (its own MP-specific layout)
                  and the full-screen video pages stay outside. */}
              <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/dashboard2" element={<AdminRoute><Dashboard2 /></AdminRoute>} />
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
                <Route path="/creadores/personalizados" element={<PermissionRoute module="Creadores" submodule="Personalizados"><PersonalizadosPage /></PermissionRoute>} />
                <Route path="/creadores/:id" element={<PermissionRoute module="Creadores" submodule="Perfil"><CreadorProfile /></PermissionRoute>} />
                <Route path="/eventos" element={<PermissionRoute module="Eventos"><Eventos /></PermissionRoute>} />
                <Route path="/eventos/nuevo" element={<PermissionRoute module="Eventos"><NuevoEvento /></PermissionRoute>} />
                <Route path="/eventos/:id/editar" element={<PermissionRoute module="Eventos"><EditEvento /></PermissionRoute>} />
                <Route path="/eventos/:id" element={<PermissionRoute module="Eventos"><EventoDetail /></PermissionRoute>} />
                <Route path="/leadgen" element={<PermissionRoute module="LeadGen"><LeadGen /></PermissionRoute>} />
                <Route path="/leadgen/base-datos" element={<PermissionRoute module="LeadGen"><LeadGenBaseDatos /></PermissionRoute>} />
                <Route path="/closers" element={<PermissionRoute module="Closers"><Closers /></PermissionRoute>} />
                {/* Inbox WhatsApp (bandeja propia) — gateado por permisos (módulo "WhatsApp"). Admin siempre; otros roles según role_permissions. */}
                <Route path="/inbox" element={<PermissionRoute module="WhatsApp" submodule="Bandeja"><InboxPage /></PermissionRoute>} />
                <Route path="/inbox/canales" element={<PermissionRoute module="WhatsApp" submodule="Canales"><InboxChannelsPage /></PermissionRoute>} />
                <Route path="/inbox/bots" element={<PermissionRoute module="WhatsApp" submodule="Canales"><InboxBotsPage /></PermissionRoute>} />
                {/* Oportunidades de monetización — lanzamiento oscuro: admin-only hasta abrir a managers/supervisores. */}
                <Route path="/oportunidades" element={<AdminRoute><OpportunitiesPage /></AdminRoute>} />
                <Route path="/tickets" element={<PermissionRoute module="Tickets"><Tickets /></PermissionRoute>} />
                <Route path="/promolog" element={<PermissionRoute module="Promolog"><Promolog /></PermissionRoute>} />
                {/* Migrated areas from kash-call-qa — placeholders for now */}
                <Route path="/scouter-assist" element={<PermissionRoute module="Scouter Assist"><ScouterAssist /></PermissionRoute>} />
                <Route path="/agency-qa" element={<PermissionRoute module="Agency QA"><AgencyQA /></PermissionRoute>} />
                {/* Sales Overview — sub-rutas eliminadas; ahora vive todo en modales */}
                <Route path="/sales-overview" element={<PermissionRoute module="Creator Sales" submodule="Dashboard"><SalesOverview /></PermissionRoute>} />
                <Route path="/salesdashboard" element={<PermissionRoute module="Creator Sales" submodule="Reportes"><SalesDashboard /></PermissionRoute>} />
                <Route path="/sales-audit" element={<PermissionRoute module="Creator Sales" submodule="Auditoría"><SalesAudit /></PermissionRoute>} />
                <Route path="/aisales" element={<PermissionRoute module="Creator Sales" submodule="IA Ventas"><AiSales /></PermissionRoute>} />
                {/* Chatter Evaluator — submodule-gated so admins can give
                    chatters Evaluator-only access without exposing the
                    admin/workspace tooling. */}
                <Route path="/chatter-evaluator" element={<PermissionRoute module="Chatters" submodule="Evaluator"><ChatterEvaluator /></PermissionRoute>} />
                <Route path="/chatter-evaluator/admin" element={<PermissionRoute module="Chatters" submodule="Admin"><ChatterAdmin /></PermissionRoute>} />
                <Route path="/chatter-evaluator/history" element={<PermissionRoute module="Chatters" submodule="Evaluator"><ChatterHistory /></PermissionRoute>} />
                <Route path="/chatter-evaluator/history/:sessionId" element={<PermissionRoute module="Chatters" submodule="Evaluator"><ChatterHistorySessionDetail /></PermissionRoute>} />
                <Route path="/chatter-evaluator/workspace" element={<PermissionRoute module="Chatters" submodule="Workspace"><ChatterWorkspace /></PermissionRoute>} />
                <Route path="/chatter-evaluator/:profileKey" element={<PermissionRoute module="Chatters" submodule="Evaluator"><ChatterProfileDetail /></PermissionRoute>} />
                <Route path="/chatter-evaluator/:profileKey/edit" element={<PermissionRoute module="Chatters" submodule="Admin"><ChatterProfileEdit /></PermissionRoute>} />
                <Route path="/tareas" element={<PermissionRoute module="Tareas"><Tareas /></PermissionRoute>} />
                <Route path="/tareas/:projectId" element={<PermissionRoute module="Tareas"><TareaProject /></PermissionRoute>} />
                <Route path="/roadmap" element={<Roadmap />} />
                <Route path="/messenger" element={<PermissionRoute module="Messenger"><Messenger /></PermissionRoute>} />
                <Route path="/cowork" element={<PermissionRoute module="Cowork"><CoworkPage /></PermissionRoute>} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/notificaciones" element={<Notificaciones />} />
                <Route path="/ajustes/notificaciones" element={<NotificacionesSettings />} />
                <Route path="/wishlist" element={<PermissionRoute module="SuperContacts"><Wishlist /></PermissionRoute>} />
                <Route path="/wishlist/:id" element={<PermissionRoute module="SuperContacts"><WishlistProfile /></PermissionRoute>} />
                {/* HR routes */}
                <Route path="/hr" element={<PermissionRoute module="HR" submodule="Dashboard"><HRLayout><HRDashboard /></HRLayout></PermissionRoute>} />
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
                <Route path="/hr/horarios/horas-extras" element={<PermissionRoute module="HR" submodule="Horas Extra"><HRLayout><HROvertimeDetail /></HRLayout></PermissionRoute>} />
                <Route path="/hr/horarios/banco-horas" element={<PermissionRoute module="HR" submodule="Banco de Horas"><HRLayout><HRHourBank /></HRLayout></PermissionRoute>} />
                <Route path="/hr/horarios-chatters" element={<PermissionRoute module="HR" submodule="Horarios Chatters"><HRLayout><HRChatterSchedules /></HRLayout></PermissionRoute>} />
                <Route path="/hr/monitoreo" element={<PermissionRoute module="HR" submodule="Monitoreo"><HRLayout><HRMonitoring /></HRLayout></PermissionRoute>} />
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
              </Route>

              {/* Full-screen routes that intentionally bypass the shell */}
              <Route path="/call/:roomName" element={<ProtectedRoute><VideoCallPage /></ProtectedRoute>} />

              {/* Proyecto MP routes (own custom MPSidebar + MPTopbar) */}
              <Route path="/proyectomp" element={<PermissionRoute module="ProyectoMP"><ProyectoMPLayout><ProyectoMPDashboard /></ProyectoMPLayout></PermissionRoute>} />
              <Route path="/proyectomp/tareas" element={<PermissionRoute module="ProyectoMP"><ProyectoMPLayout><ProyectoMPTareas /></ProyectoMPLayout></PermissionRoute>} />
              <Route path="/proyectomp/pipeline" element={<PermissionRoute module="ProyectoMP"><ProyectoMPLayout><ProyectoMPPipeline /></ProyectoMPLayout></PermissionRoute>} />
              <Route path="/proyectomp/contenido" element={<PermissionRoute module="ProyectoMP"><ProyectoMPLayout><ProyectoMPContenido /></ProyectoMPLayout></PermissionRoute>} />
              <Route path="/proyectomp/trafico" element={<PermissionRoute module="ProyectoMP"><ProyectoMPLayout><ProyectoMPTrafico /></ProyectoMPLayout></PermissionRoute>} />
              <Route path="/proyectomp/finanzas" element={<PermissionRoute module="ProyectoMP"><ProyectoMPLayout><ProyectoMPFinanzas /></ProyectoMPLayout></PermissionRoute>} />
              <Route path="/proyectomp/equipo" element={<PermissionRoute module="ProyectoMP"><ProyectoMPLayout><ProyectoMPEquipo /></ProyectoMPLayout></PermissionRoute>} />
              <Route path="/proyectomp/milestones" element={<PermissionRoute module="ProyectoMP"><ProyectoMPLayout><ProyectoMPMilestones /></ProyectoMPLayout></PermissionRoute>} />
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
