import { lazy, Suspense, useEffect } from "react";
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

// Cold-load critical pages stay eager so the auth flow has no extra
// chunk hop. Everything else is lazy + preloaded in the background
// after first paint (see useBackgroundPreload below) so the in-app nav
// feels instant once the user has been on the app for a few seconds.

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";

// Public / share entry points.
const Concept = lazy(() => import("./pages/Concept"));
const Credentials = lazy(() => import("./pages/Credentials"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ChatterPublicView = lazy(() => import("./pages/ChatterPublicView"));
const EventoSharePage = lazy(() => import("./pages/eventos/EventoSharePage"));
const SharedAgendaPage = lazy(() => import("./pages/eventos/SharedAgendaPage"));
const TaskSharePage = lazy(() => import("./pages/tareas/TaskSharePage"));
const ProjectSharePage = lazy(() => import("./pages/tareas/ProjectSharePage"));
const VideoCallPage = lazy(() => import("./pages/VideoCallPage"));
const CoworkPage = lazy(() => import("./pages/cowork/CoworkPage"));

// Proyecto MP — own sub-app.
const ProyectoMPLayout = lazy(() => import("./pages/proyectomp/ProyectoMPLayout"));
const ProyectoMPDashboard = lazy(() => import("./pages/proyectomp/ProyectoMPDashboard"));
const ProyectoMPTareas = lazy(() => import("./pages/proyectomp/ProyectoMPTareas"));
const ProyectoMPPipeline = lazy(() => import("./pages/proyectomp/ProyectoMPPipeline"));
const ProyectoMPContenido = lazy(() => import("./pages/proyectomp/ProyectoMPContenido"));
const ProyectoMPTrafico = lazy(() => import("./pages/proyectomp/ProyectoMPTrafico"));
const ProyectoMPFinanzas = lazy(() => import("./pages/proyectomp/ProyectoMPFinanzas"));
const ProyectoMPEquipo = lazy(() => import("./pages/proyectomp/ProyectoMPEquipo"));
const ProyectoMPMilestones = lazy(() => import("./pages/proyectomp/ProyectoMPMilestones"));

// Main CRM pages — lazy. Preloaded in the background once the user has
// reached the dashboard (see useBackgroundPreload below).
const DesignSystem = lazy(() => import("./pages/DesignSystem"));
const Docs = lazy(() => import("./pages/Docs"));
const Dashboard2 = lazy(() => import("./pages/Dashboard2"));

// Sales
const SalesDashboard = lazy(() => import("./pages/SalesDashboard"));
const SalesAudit = lazy(() => import("./pages/SalesAudit"));
const SalesOverview = lazy(() => import("./pages/SalesOverview"));
const ComparativasPage = lazy(() => import("./pages/sales-overview/ComparativasPage"));
const Top10Page = lazy(() => import("./pages/sales-overview/Top10Page"));
const SubiendoPage = lazy(() => import("./pages/sales-overview/SubiendoPage"));
const BajandoPage = lazy(() => import("./pages/sales-overview/BajandoPage"));
const AltoPotencialPage = lazy(() => import("./pages/sales-overview/AltoPotencialPage"));
const EnRiesgoPage = lazy(() => import("./pages/sales-overview/EnRiesgoPage"));
const AiSales = lazy(() => import("./pages/AiSales"));
const AiSalesConfig = lazy(() => import("./pages/AiSalesConfig"));

// Creadores
const Creadores = lazy(() => import("./pages/Creadores"));
const CreadorasDashboardPage = lazy(() => import("./pages/creadores/CreadorasDashboardPage"));
const OnboardingPage = lazy(() => import("./pages/creadores/onboarding/OnboardingPage"));
const OnboardingWizardPage = lazy(() => import("./pages/creadores/onboarding/OnboardingWizardPage"));
const OffboardingListPage = lazy(() => import("./pages/creadores/offboarding/OffboardingListPage"));
const OffboardingDetailPage = lazy(() => import("./pages/creadores/offboarding/OffboardingDetailPage"));
const NuevoCreador = lazy(() => import("./pages/NuevoCreador"));
const CreadorProfile = lazy(() => import("./pages/CreadorProfile"));
const PersonalizadosPage = lazy(() => import("./pages/creadores/personalizados/PersonalizadosPage"));

// Eventos
const Eventos = lazy(() => import("./pages/Eventos"));
const NuevoEvento = lazy(() => import("./pages/NuevoEvento"));
const EditEvento = lazy(() => import("./pages/EditEvento"));
const EventoDetail = lazy(() => import("./pages/EventoDetail"));

// LeadGen / Closers / Contactos / Chatter
const LeadGen = lazy(() => import("./pages/LeadGen"));
const LeadGenBaseDatos = lazy(() => import("./pages/LeadGenBaseDatos"));
const Closers = lazy(() => import("./pages/Closers"));
const Tickets = lazy(() => import("./pages/Tickets"));
const Promolog = lazy(() => import("./pages/Promolog"));
const ChatterEvaluator = lazy(() => import("./pages/ChatterEvaluator"));
const ChatterProfileDetail = lazy(() => import("./pages/ChatterProfileDetail"));
const ChatterProfileEdit = lazy(() => import("./pages/ChatterProfileEdit"));
const ChatterAdmin = lazy(() => import("./pages/ChatterAdmin"));
const ChatterWorkspace = lazy(() => import("./pages/ChatterWorkspace"));
const Contactos = lazy(() => import("./pages/Contactos"));
const NuevoContacto = lazy(() => import("./pages/NuevoContacto"));

// Tareas
const Tareas = lazy(() => import("./pages/Tareas"));
const TareaProject = lazy(() => import("./pages/TareaProject"));

// Admin
const AdminUsuarios = lazy(() => import("./pages/admin/AdminUsuarios"));
const AuditoriaRoles = lazy(() => import("./pages/admin/AuditoriaRoles"));

// Wishlist
const Wishlist = lazy(() => import("./pages/SuperContacts"));
const WishlistProfile = lazy(() => import("./pages/supercontacts/SuperContactProfile"));

// Misc
const Roadmap = lazy(() => import("./pages/Roadmap"));
const Messenger = lazy(() => import("./pages/Messenger"));
const Notificaciones = lazy(() => import("./pages/Notificaciones"));
const NotificacionesSettings = lazy(() => import("./pages/ajustes/NotificacionesSettings"));
const Settings = lazy(() => import("./pages/Settings"));

// HR
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
const HRDirectoryLookup = lazy(() => import("./pages/hr/HRDirectoryLookup"));
const HROrganigrama = lazy(() => import("./pages/hr/HROrganigrama"));
const HRDeductions = lazy(() => import("./pages/hr/HRDeductions"));
const HRDeductionNew = lazy(() => import("./pages/hr/HRDeductionNew"));
const HRAnnouncements = lazy(() => import("./pages/hr/HRAnnouncements"));

// Finanzas
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

// Background preloader — once the app has been idle for ~2s after the
// initial render (long enough for the first interaction to feel snappy)
// we kick off chunk downloads for the most common in-app destinations
// so the user doesn't wait for them on click.
const preloadCommonPages = () => {
  // Use requestIdleCallback when available so we don't fight the main
  // thread, fall back to a small setTimeout otherwise.
  const schedule =
    typeof window !== "undefined" && "requestIdleCallback" in window
      ? (cb: () => void) => (window as unknown as {
          requestIdleCallback: (cb: () => void) => void;
        }).requestIdleCallback(cb)
      : (cb: () => void) => setTimeout(cb, 2000);
  schedule(() => {
    // Pages people actually open right after Dashboard.
    void import("./pages/Messenger");
    void import("./pages/Contactos");
    void import("./pages/Tareas");
    void import("./pages/Settings");
    void import("./pages/Notificaciones");
  });
};

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
      className="fixed inset-0 z-[99] flex items-center justify-center bg-background opacity-0"
      style={{ animation: "delayed-fade-in 0.25s ease-out 0.18s forwards" }}
    >
      <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-primary/15 border-t-primary" />
    </div>
  </>
);

const App = () => {
  useEffect(() => {
    preloadCommonPages();
  }, []);
  return (
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
              <Route path="/credentials" element={<Credentials />} />
              
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
                  and the full-screen video/cowork pages stay outside. */}
              <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/dashboard2" element={<AdminRoute><Dashboard2 /></AdminRoute>} />
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
                <Route path="/tickets" element={<PermissionRoute module="Tickets"><Tickets /></PermissionRoute>} />
                <Route path="/promolog" element={<PermissionRoute module="Promolog"><Promolog /></PermissionRoute>} />
                {/* Sales Overview */}
                <Route path="/sales-overview" element={<PermissionRoute module="Creator Sales"><SalesOverview /></PermissionRoute>} />
                <Route path="/sales-overview/comparativas" element={<PermissionRoute module="Creator Sales"><ComparativasPage /></PermissionRoute>} />
                <Route path="/sales-overview/top10" element={<PermissionRoute module="Creator Sales"><Top10Page /></PermissionRoute>} />
                <Route path="/sales-overview/subiendo" element={<PermissionRoute module="Creator Sales"><SubiendoPage /></PermissionRoute>} />
                <Route path="/sales-overview/bajando" element={<PermissionRoute module="Creator Sales"><BajandoPage /></PermissionRoute>} />
                <Route path="/sales-overview/alto-potencial" element={<PermissionRoute module="Creator Sales"><AltoPotencialPage /></PermissionRoute>} />
                <Route path="/sales-overview/en-riesgo" element={<PermissionRoute module="Creator Sales"><EnRiesgoPage /></PermissionRoute>} />
                <Route path="/salesdashboard" element={<PermissionRoute module="Creator Sales"><SalesDashboard /></PermissionRoute>} />
                <Route path="/sales-audit" element={<PermissionRoute module="Creator Sales"><SalesAudit /></PermissionRoute>} />
                <Route path="/aisales" element={<PermissionRoute module="Creator Sales"><AiSales /></PermissionRoute>} />
                <Route path="/ai-sales-config" element={<PermissionRoute module="Creator Sales"><AiSalesConfig /></PermissionRoute>} />
                {/* Chatter Evaluator: gated with ProtectedRoute on the staging branch
                    (where user_roles isn't populated). Swap to PermissionRoute
                    module="Chatters" when merging to prod. */}
                <Route path="/chatter-evaluator" element={<ChatterEvaluator />} />
                <Route path="/chatter-evaluator/admin" element={<ChatterAdmin />} />
                <Route path="/chatter-evaluator/workspace" element={<ChatterWorkspace />} />
                <Route path="/chatter-evaluator/:profileKey" element={<ChatterProfileDetail />} />
                <Route path="/chatter-evaluator/:profileKey/edit" element={<ChatterProfileEdit />} />
                <Route path="/tareas" element={<Tareas />} />
                <Route path="/tareas/:projectId" element={<TareaProject />} />
                <Route path="/roadmap" element={<Roadmap />} />
                <Route path="/messenger" element={<Messenger />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/notificaciones" element={<Notificaciones />} />
                <Route path="/ajustes/notificaciones" element={<NotificacionesSettings />} />
                <Route path="/wishlist" element={<Wishlist />} />
                <Route path="/wishlist/:id" element={<WishlistProfile />} />
                {/* HR routes */}
                <Route path="/hr" element={<PermissionRoute module="HR"><HRLayout><HRDashboard /></HRLayout></PermissionRoute>} />
                <Route path="/hr/directorio" element={<PermissionRoute module="HR"><HRLayout><EmployeeDirectory /></HRLayout></PermissionRoute>} />
                <Route path="/hr/empleado/nuevo" element={<PermissionRoute module="HR"><HRLayout><EmployeeNew /></HRLayout></PermissionRoute>} />
                <Route path="/hr/empleado/:id" element={<PermissionRoute module="HR"><HRLayout><EmployeeProfile /></HRLayout></PermissionRoute>} />
                <Route path="/hr/ausencias" element={<PermissionRoute module="HR"><HRLayout><HRAbsences /></HRLayout></PermissionRoute>} />
                <Route path="/hr/incidentes" element={<PermissionRoute module="HR"><HRLayout><HRIncidents /></HRLayout></PermissionRoute>} />
                <Route path="/hr/incidentes/nuevo" element={<PermissionRoute module="HR"><HRLayout><HRIncidentNew /></HRLayout></PermissionRoute>} />
                <Route path="/hr/candidatos" element={<PermissionRoute module="HR"><HRLayout><HRApplicants /></HRLayout></PermissionRoute>} />
                <Route path="/hr/candidatos/nuevo" element={<PermissionRoute module="HR"><HRLayout><HRApplicantNew /></HRLayout></PermissionRoute>} />
                <Route path="/hr/onboarding" element={<PermissionRoute module="HR"><HRLayout><HROnboarding /></HRLayout></PermissionRoute>} />
                <Route path="/hr/onboarding/nuevo" element={<PermissionRoute module="HR"><HRLayout><HROnboardingNew /></HRLayout></PermissionRoute>} />
                <Route path="/hr/offboarding" element={<PermissionRoute module="HR"><HRLayout><HROffboarding /></HRLayout></PermissionRoute>} />
                <Route path="/hr/offboarding/nuevo" element={<PermissionRoute module="HR"><HRLayout><HROffboardingNew /></HRLayout></PermissionRoute>} />
                <Route path="/hr/capacitacion" element={<PermissionRoute module="HR"><HRLayout><HRTraining /></HRLayout></PermissionRoute>} />
                <Route path="/hr/capacitacion/chatters" element={<PermissionRoute module="HR"><HRLayout><HRTrainingChatters /></HRLayout></PermissionRoute>} />
                <Route path="/hr/capacitacion/tecnologia" element={<PermissionRoute module="HR"><HRLayout><HRTrainingTech /></HRLayout></PermissionRoute>} />
                <Route path="/hr/desempeno" element={<PermissionRoute module="HR"><HRLayout><HRPerformance /></HRLayout></PermissionRoute>} />
                <Route path="/hr/desempeno/nuevo" element={<PermissionRoute module="HR"><HRLayout><HRPerformanceNew /></HRLayout></PermissionRoute>} />
                <Route path="/hr/asistencia" element={<PermissionRoute module="HR"><HRLayout><HRAttendance /></HRLayout></PermissionRoute>} />
                <Route path="/hr/vacaciones" element={<PermissionRoute module="HR"><HRLayout><HRVacations /></HRLayout></PermissionRoute>} />
                <Route path="/hr/permisos" element={<PermissionRoute module="HR"><HRLayout><HRPermisos /></HRLayout></PermissionRoute>} />
                <Route path="/hr/permisos/nuevo" element={<PermissionRoute module="HR"><HRLayout><HRPermisoNew /></HRLayout></PermissionRoute>} />
                <Route path="/hr/horarios" element={<PermissionRoute module="HR"><HRLayout><HRSchedules /></HRLayout></PermissionRoute>} />
                <Route path="/hr/horarios/horas-extras" element={<PermissionRoute module="HR"><HRLayout><HROvertimeDetail /></HRLayout></PermissionRoute>} />
                <Route path="/hr/horarios/banco-horas" element={<PermissionRoute module="HR"><HRLayout><HRHourBank /></HRLayout></PermissionRoute>} />
                <Route path="/hr/horarios-chatters" element={<PermissionRoute module="HR"><HRLayout><HRChatterSchedules /></HRLayout></PermissionRoute>} />
                <Route path="/hr/monitoreo" element={<PermissionRoute module="HR"><HRLayout><HRMonitoring /></HRLayout></PermissionRoute>} />
                <Route path="/hr/organizacion/directorio" element={<PermissionRoute module="HR"><HRLayout><HRDirectoryLookup /></HRLayout></PermissionRoute>} />
                <Route path="/hr/organizacion/organigrama" element={<PermissionRoute module="HR"><HRLayout><HROrganigrama /></HRLayout></PermissionRoute>} />
                <Route path="/hr/deducciones" element={<PermissionRoute module="HR"><HRLayout><HRDeductions /></HRLayout></PermissionRoute>} />
                <Route path="/hr/deducciones/nuevo" element={<PermissionRoute module="HR"><HRLayout><HRDeductionNew /></HRLayout></PermissionRoute>} />
                <Route path="/hr/anuncios" element={<PermissionRoute module="HR"><HRLayout><HRAnnouncements /></HRLayout></PermissionRoute>} />
                {/* Finanzas routes */}
                <Route path="/finanzas" element={<PermissionRoute module="Finanzas"><FinanzasLayout><FinanzasDashboard /></FinanzasLayout></PermissionRoute>} />
                <Route path="/finanzas/nomina" element={<PermissionRoute module="Finanzas"><FinanzasLayout><NominaPage /></FinanzasLayout></PermissionRoute>} />
                <Route path="/finanzas/facturacion/invoices" element={<PermissionRoute module="Finanzas"><FinanzasLayout><FacturacionPage /></FinanzasLayout></PermissionRoute>} />
                <Route path="/finanzas/facturacion" element={<Navigate to="/finanzas/facturacion/invoices" replace />} />
                <Route path="/finanzas/facturacion/facturas/nueva" element={<PermissionRoute module="Finanzas"><NuevoInvoice /></PermissionRoute>} />
                <Route path="/finanzas/facturacion/notasdepago/nueva" element={<PermissionRoute module="Finanzas"><NuevaNotaPago /></PermissionRoute>} />
                <Route path="/finanzas/facturacion/templates" element={<PermissionRoute module="Finanzas"><FinanzasLayout><TemplatesPage /></FinanzasLayout></PermissionRoute>} />
                <Route path="/finanzas/control" element={<PermissionRoute module="Finanzas"><FinanzasLayout><ControlFinancieroPage /></FinanzasLayout></PermissionRoute>} />
                <Route path="/finanzas/reportes" element={<PermissionRoute module="Finanzas"><FinanzasLayout><ReportesPage /></FinanzasLayout></PermissionRoute>} />
                <Route path="/finanzas/collections" element={<PermissionRoute module="Finanzas"><FinanzasLayout><CollectionsPage /></FinanzasLayout></PermissionRoute>} />
                <Route path="/finanzas/horas-variables" element={<PermissionRoute module="Finanzas"><FinanzasLayout><HorasVariablesPage /></FinanzasLayout></PermissionRoute>} />
                <Route path="/finanzas/configuracion" element={<PermissionRoute module="Finanzas"><FinanzasLayout><ConfiguracionPage /></FinanzasLayout></PermissionRoute>} />
                {/* Admin routes */}
                <Route path="/admin/usuarios" element={<AdminRoute><AdminUsuarios /></AdminRoute>} />
                <Route path="/admin/auditoria" element={<AdminRoute><AuditoriaRoles /></AdminRoute>} />
              </Route>

              {/* Full-screen routes that intentionally bypass the shell */}
              <Route path="/call/:roomName" element={<ProtectedRoute><VideoCallPage /></ProtectedRoute>} />
              <Route path="/cowork" element={<ProtectedRoute><CoworkPage /></ProtectedRoute>} />

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
};

export default App;
