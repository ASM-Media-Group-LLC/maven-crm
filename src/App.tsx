import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import ProtectedRoute from "@/components/ProtectedRoute";
import PermissionRoute from "@/components/PermissionRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import DesignSystem from "./pages/DesignSystem";
import Docs from "./pages/Docs";
import SalesDashboard from "./pages/SalesDashboard";
import SalesOverview from "./pages/SalesOverview";
import ComparativasPage from "./pages/sales-overview/ComparativasPage";
import Top10Page from "./pages/sales-overview/Top10Page";
import SubiendoPage from "./pages/sales-overview/SubiendoPage";
import BajandoPage from "./pages/sales-overview/BajandoPage";
import AltoPotencialPage from "./pages/sales-overview/AltoPotencialPage";
import EnRiesgoPage from "./pages/sales-overview/EnRiesgoPage";

import AiSales from "./pages/AiSales";
import AiSalesConfig from "./pages/AiSalesConfig";
import Dashboard from "./pages/Dashboard";
import Creadores from "./pages/Creadores";
import ProspectosPage from "./pages/creadores/prospectos/ProspectosPage";
import OnboardingPage from "./pages/creadores/onboarding/OnboardingPage";
import OnboardingWizardPage from "./pages/creadores/onboarding/OnboardingWizardPage";
import CreadorasDashboardPage from "./pages/creadores/CreadorasDashboardPage";
import NuevoCreador from "./pages/NuevoCreador";
import CreadorProfile from "./pages/CreadorProfile";
import Eventos from "./pages/Eventos";
import NuevoEvento from "./pages/NuevoEvento";
import EditEvento from "./pages/EditEvento";
import EventoDetail from "./pages/EventoDetail";
import EventoSharePage from "./pages/eventos/EventoSharePage";
import SharedAgendaPage from "./pages/eventos/SharedAgendaPage";
import LeadGen from "./pages/LeadGen";
import LeadGenBaseDatos from "./pages/LeadGenBaseDatos";
import Closers from "./pages/Closers";
import Tickets from "./pages/Tickets";
import Promolog from "./pages/Promolog";
import Contactos from "./pages/Contactos";
import NuevoContacto from "./pages/NuevoContacto";
import Tareas from "./pages/Tareas";
import TareaProject from "./pages/TareaProject";
import TaskSharePage from "./pages/tareas/TaskSharePage";
import ProjectSharePage from "./pages/tareas/ProjectSharePage";
import AdminUsuarios from "./pages/admin/AdminUsuarios";
import AuditoriaRoles from "./pages/admin/AuditoriaRoles";
import AdminRoute from "./components/AdminRoute";
import Roadmap from "./pages/Roadmap";
import Messenger from "./pages/Messenger";
import Notificaciones from "./pages/Notificaciones";
import NotificacionesSettings from "./pages/ajustes/NotificacionesSettings";
import NotFound from "./pages/NotFound";
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
import HRLayout from "./pages/hr/HRLayout";
import HRAttendance from "./pages/hr/HRAttendance";
import HRVacations from "./pages/hr/HRVacations";
import HRPermisos from "./pages/hr/HRPermisos";
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
import FinanzasLayout from "./pages/finanzas/FinanzasLayout";
import FinanzasDashboard from "./pages/finanzas/FinanzasDashboard";
import NominaPage from "./pages/finanzas/nomina/NominaPage";
import FacturacionPage from "./pages/finanzas/facturacion/FacturacionPage";
import ControlFinancieroPage from "./pages/finanzas/control/ControlFinancieroPage";
import ReportesPage from "./pages/finanzas/reportes/ReportesPage";
import ConfiguracionPage from "./pages/finanzas/configuracion/ConfiguracionPage";
import CollectionsPage from "./pages/finanzas/collections/CollectionsPage";
import HorasVariablesPage from "./pages/finanzas/horas-variables/HorasVariablesPage";
import PersonalizadosPage from "./pages/creadores/personalizados/PersonalizadosPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <LanguageProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/eventos/share/:token" element={<EventoSharePage />} />
              <Route path="/shared/agenda/:token" element={<SharedAgendaPage />} />
              <Route path="/tareas/share/:token" element={<TaskSharePage />} />
              <Route path="/tareas/project-share/:token" element={<ProjectSharePage />} />

              {/* Protected routes */}
              <Route path="/design-system" element={<ProtectedRoute><DesignSystem /></ProtectedRoute>} />
              <Route path="/docs" element={<ProtectedRoute><Docs /></ProtectedRoute>} />
              <Route path="/sales-overview" element={<PermissionRoute module="Creator Sales"><SalesOverview /></PermissionRoute>} />
              <Route path="/sales-overview/comparativas" element={<PermissionRoute module="Creator Sales"><ComparativasPage /></PermissionRoute>} />
              <Route path="/sales-overview/top10" element={<PermissionRoute module="Creator Sales"><Top10Page /></PermissionRoute>} />
              <Route path="/sales-overview/subiendo" element={<PermissionRoute module="Creator Sales"><SubiendoPage /></PermissionRoute>} />
              <Route path="/sales-overview/bajando" element={<PermissionRoute module="Creator Sales"><BajandoPage /></PermissionRoute>} />
              <Route path="/sales-overview/alto-potencial" element={<PermissionRoute module="Creator Sales"><AltoPotencialPage /></PermissionRoute>} />
              <Route path="/sales-overview/en-riesgo" element={<PermissionRoute module="Creator Sales"><EnRiesgoPage /></PermissionRoute>} />
              <Route path="/salesdashboard" element={<PermissionRoute module="Creator Sales"><SalesDashboard /></PermissionRoute>} />
              
              <Route path="/aisales" element={<PermissionRoute module="Creator Sales"><AiSales /></PermissionRoute>} />
              <Route path="/ai-sales-config" element={<PermissionRoute module="Creator Sales"><AiSalesConfig /></PermissionRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/contactos" element={<PermissionRoute module="Contactos"><Contactos /></PermissionRoute>} />
              <Route path="/contactos/nuevo" element={<PermissionRoute module="Contactos"><NuevoContacto /></PermissionRoute>} />
              <Route path="/creadores/dashboard" element={<PermissionRoute module="Creadores"><CreadorasDashboardPage /></PermissionRoute>} />
              <Route path="/creadores" element={<PermissionRoute module="Creadores"><Creadores /></PermissionRoute>} />
              <Route path="/creadores/prospectos" element={<PermissionRoute module="Creadores"><ProspectosPage /></PermissionRoute>} />
              <Route path="/creadores/onboarding" element={<PermissionRoute module="Creadores"><OnboardingPage /></PermissionRoute>} />
              <Route path="/creadores/onboarding/nuevo" element={<PermissionRoute module="Creadores"><OnboardingWizardPage /></PermissionRoute>} />
              <Route path="/creadores/onboarding/:id" element={<PermissionRoute module="Creadores"><OnboardingWizardPage /></PermissionRoute>} />
              <Route path="/creadores/nuevo" element={<PermissionRoute module="Creadores"><NuevoCreador /></PermissionRoute>} />
              <Route path="/creadores/:id" element={<PermissionRoute module="Creadores"><CreadorProfile /></PermissionRoute>} />
              <Route path="/eventos" element={<PermissionRoute module="Eventos"><Eventos /></PermissionRoute>} />
              <Route path="/leadgen" element={<PermissionRoute module="LeadGen"><LeadGen /></PermissionRoute>} />
              <Route path="/leadgen/base-datos" element={<PermissionRoute module="LeadGen"><LeadGenBaseDatos /></PermissionRoute>} />
              <Route path="/closers" element={<PermissionRoute module="Closers"><Closers /></PermissionRoute>} />
              <Route path="/tickets" element={<PermissionRoute module="Tickets"><Tickets /></PermissionRoute>} />
              <Route path="/promolog" element={<PermissionRoute module="Promolog"><Promolog /></PermissionRoute>} />
              <Route path="/tareas" element={<ProtectedRoute><Tareas /></ProtectedRoute>} />
              <Route path="/tareas/:projectId" element={<ProtectedRoute><TareaProject /></ProtectedRoute>} />
              <Route path="/eventos/nuevo" element={<PermissionRoute module="Eventos"><NuevoEvento /></PermissionRoute>} />
              <Route path="/eventos/:id/editar" element={<PermissionRoute module="Eventos"><EditEvento /></PermissionRoute>} />
              <Route path="/eventos/:id" element={<PermissionRoute module="Eventos"><EventoDetail /></PermissionRoute>} />
              <Route path="/roadmap" element={<ProtectedRoute><Roadmap /></ProtectedRoute>} />
              <Route path="/messenger" element={<ProtectedRoute><Messenger /></ProtectedRoute>} />
              <Route path="/notificaciones" element={<ProtectedRoute><Notificaciones /></ProtectedRoute>} />
              <Route path="/ajustes/notificaciones" element={<ProtectedRoute><NotificacionesSettings /></ProtectedRoute>} />
              <Route path="/creadores/personalizados" element={<PermissionRoute module="Creadores"><PersonalizadosPage /></PermissionRoute>} />
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
              <Route path="/finanzas/facturacion" element={<PermissionRoute module="Finanzas"><FinanzasLayout><FacturacionPage /></FinanzasLayout></PermissionRoute>} />
              <Route path="/finanzas/control" element={<PermissionRoute module="Finanzas"><FinanzasLayout><ControlFinancieroPage /></FinanzasLayout></PermissionRoute>} />
              <Route path="/finanzas/reportes" element={<PermissionRoute module="Finanzas"><FinanzasLayout><ReportesPage /></FinanzasLayout></PermissionRoute>} />
              <Route path="/finanzas/collections" element={<PermissionRoute module="Finanzas"><FinanzasLayout><CollectionsPage /></FinanzasLayout></PermissionRoute>} />
              <Route path="/finanzas/horas-variables" element={<PermissionRoute module="Finanzas"><FinanzasLayout><HorasVariablesPage /></FinanzasLayout></PermissionRoute>} />
              <Route path="/finanzas/configuracion" element={<PermissionRoute module="Finanzas"><FinanzasLayout><ConfiguracionPage /></FinanzasLayout></PermissionRoute>} />
              {/* Admin routes */}
              <Route path="/admin/usuarios" element={<AdminRoute><AdminUsuarios /></AdminRoute>} />
              <Route path="/admin/auditoria" element={<AdminRoute><AuditoriaRoles /></AdminRoute>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
        </LanguageProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
