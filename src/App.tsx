import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import ProtectedRoute from "@/components/ProtectedRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
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
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/eventos/share/:token" element={<EventoSharePage />} />
              <Route path="/shared/agenda/:token" element={<SharedAgendaPage />} />
              <Route path="/tareas/share/:token" element={<TaskSharePage />} />
              <Route path="/tareas/project-share/:token" element={<ProjectSharePage />} />

              {/* Protected routes */}
              <Route path="/design-system" element={<ProtectedRoute><DesignSystem /></ProtectedRoute>} />
              <Route path="/docs" element={<ProtectedRoute><Docs /></ProtectedRoute>} />
              <Route path="/sales-overview" element={<ProtectedRoute><SalesOverview /></ProtectedRoute>} />
              <Route path="/sales-overview/comparativas" element={<ProtectedRoute><ComparativasPage /></ProtectedRoute>} />
              <Route path="/sales-overview/top10" element={<ProtectedRoute><Top10Page /></ProtectedRoute>} />
              <Route path="/sales-overview/subiendo" element={<ProtectedRoute><SubiendoPage /></ProtectedRoute>} />
              <Route path="/sales-overview/bajando" element={<ProtectedRoute><BajandoPage /></ProtectedRoute>} />
              <Route path="/sales-overview/alto-potencial" element={<ProtectedRoute><AltoPotencialPage /></ProtectedRoute>} />
              <Route path="/sales-overview/en-riesgo" element={<ProtectedRoute><EnRiesgoPage /></ProtectedRoute>} />
              <Route path="/salesdashboard" element={<ProtectedRoute><SalesDashboard /></ProtectedRoute>} />
              
              <Route path="/aisales" element={<ProtectedRoute><AiSales /></ProtectedRoute>} />
              <Route path="/ai-sales-config" element={<ProtectedRoute><AiSalesConfig /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/contactos" element={<ProtectedRoute><Contactos /></ProtectedRoute>} />
              <Route path="/contactos/nuevo" element={<ProtectedRoute><NuevoContacto /></ProtectedRoute>} />
              <Route path="/creadores/dashboard" element={<ProtectedRoute><CreadorasDashboardPage /></ProtectedRoute>} />
              <Route path="/creadores" element={<ProtectedRoute><Creadores /></ProtectedRoute>} />
              <Route path="/creadores/prospectos" element={<ProtectedRoute><ProspectosPage /></ProtectedRoute>} />
              <Route path="/creadores/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
              <Route path="/creadores/onboarding/nuevo" element={<ProtectedRoute><OnboardingWizardPage /></ProtectedRoute>} />
              <Route path="/creadores/onboarding/:id" element={<ProtectedRoute><OnboardingWizardPage /></ProtectedRoute>} />
              <Route path="/creadores/nuevo" element={<ProtectedRoute><NuevoCreador /></ProtectedRoute>} />
              <Route path="/creadores/:id" element={<ProtectedRoute><CreadorProfile /></ProtectedRoute>} />
              <Route path="/eventos" element={<ProtectedRoute><Eventos /></ProtectedRoute>} />
              <Route path="/leadgen" element={<ProtectedRoute><LeadGen /></ProtectedRoute>} />
              <Route path="/leadgen/base-datos" element={<ProtectedRoute><LeadGenBaseDatos /></ProtectedRoute>} />
              <Route path="/closers" element={<ProtectedRoute><Closers /></ProtectedRoute>} />
              <Route path="/tickets" element={<ProtectedRoute><Tickets /></ProtectedRoute>} />
              <Route path="/promolog" element={<ProtectedRoute><Promolog /></ProtectedRoute>} />
              <Route path="/tareas" element={<ProtectedRoute><Tareas /></ProtectedRoute>} />
              <Route path="/tareas/:projectId" element={<ProtectedRoute><TareaProject /></ProtectedRoute>} />
              <Route path="/eventos/nuevo" element={<ProtectedRoute><NuevoEvento /></ProtectedRoute>} />
              <Route path="/eventos/:id/editar" element={<ProtectedRoute><EditEvento /></ProtectedRoute>} />
              <Route path="/eventos/:id" element={<ProtectedRoute><EventoDetail /></ProtectedRoute>} />
              <Route path="/roadmap" element={<ProtectedRoute><Roadmap /></ProtectedRoute>} />
              <Route path="/messenger" element={<ProtectedRoute><Messenger /></ProtectedRoute>} />
              {/* HR routes */}
              <Route path="/hr" element={<ProtectedRoute><HRLayout><HRDashboard /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/directorio" element={<ProtectedRoute><HRLayout><EmployeeDirectory /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/empleado/nuevo" element={<ProtectedRoute><HRLayout><EmployeeNew /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/empleado/:id" element={<ProtectedRoute><HRLayout><EmployeeProfile /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/ausencias" element={<ProtectedRoute><HRLayout><HRAbsences /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/incidentes" element={<ProtectedRoute><HRLayout><HRIncidents /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/incidentes/nuevo" element={<ProtectedRoute><HRLayout><HRIncidentNew /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/candidatos" element={<ProtectedRoute><HRLayout><HRApplicants /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/candidatos/nuevo" element={<ProtectedRoute><HRLayout><HRApplicantNew /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/onboarding" element={<ProtectedRoute><HRLayout><HROnboarding /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/onboarding/nuevo" element={<ProtectedRoute><HRLayout><HROnboardingNew /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/offboarding" element={<ProtectedRoute><HRLayout><HROffboarding /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/offboarding/nuevo" element={<ProtectedRoute><HRLayout><HROffboardingNew /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/capacitacion" element={<ProtectedRoute><HRLayout><HRTraining /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/capacitacion/chatters" element={<ProtectedRoute><HRLayout><HRTrainingChatters /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/capacitacion/tecnologia" element={<ProtectedRoute><HRLayout><HRTrainingTech /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/desempeno" element={<ProtectedRoute><HRLayout><HRPerformance /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/desempeno/nuevo" element={<ProtectedRoute><HRLayout><HRPerformanceNew /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/asistencia" element={<ProtectedRoute><HRLayout><HRAttendance /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/vacaciones" element={<ProtectedRoute><HRLayout><HRVacations /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/permisos" element={<ProtectedRoute><HRLayout><HRPermisos /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/horarios" element={<ProtectedRoute><HRLayout><HRSchedules /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/horarios/horas-extras" element={<ProtectedRoute><HRLayout><HROvertimeDetail /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/horarios/banco-horas" element={<ProtectedRoute><HRLayout><HRHourBank /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/horarios-chatters" element={<ProtectedRoute><HRLayout><HRChatterSchedules /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/monitoreo" element={<ProtectedRoute><HRLayout><HRMonitoring /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/organizacion/directorio" element={<ProtectedRoute><HRLayout><HRDirectoryLookup /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/organizacion/organigrama" element={<ProtectedRoute><HRLayout><HROrganigrama /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/deducciones" element={<ProtectedRoute><HRLayout><HRDeductions /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/deducciones/nuevo" element={<ProtectedRoute><HRLayout><HRDeductionNew /></HRLayout></ProtectedRoute>} />
              <Route path="/hr/anuncios" element={<ProtectedRoute><HRLayout><HRAnnouncements /></HRLayout></ProtectedRoute>} />
              {/* Finanzas routes */}
              <Route path="/finanzas" element={<ProtectedRoute><FinanzasLayout><FinanzasDashboard /></FinanzasLayout></ProtectedRoute>} />
              <Route path="/finanzas/nomina" element={<ProtectedRoute><FinanzasLayout><NominaPage /></FinanzasLayout></ProtectedRoute>} />
              <Route path="/finanzas/facturacion" element={<ProtectedRoute><FinanzasLayout><FacturacionPage /></FinanzasLayout></ProtectedRoute>} />
              <Route path="/finanzas/control" element={<ProtectedRoute><FinanzasLayout><ControlFinancieroPage /></FinanzasLayout></ProtectedRoute>} />
              <Route path="/finanzas/reportes" element={<ProtectedRoute><FinanzasLayout><ReportesPage /></FinanzasLayout></ProtectedRoute>} />
              <Route path="/finanzas/collections" element={<ProtectedRoute><FinanzasLayout><CollectionsPage /></FinanzasLayout></ProtectedRoute>} />
              <Route path="/finanzas/horas-variables" element={<ProtectedRoute><FinanzasLayout><HorasVariablesPage /></FinanzasLayout></ProtectedRoute>} />
              <Route path="/finanzas/configuracion" element={<ProtectedRoute><FinanzasLayout><ConfiguracionPage /></FinanzasLayout></ProtectedRoute>} />
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
