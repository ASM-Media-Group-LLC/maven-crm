import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import DesignSystem from "./pages/DesignSystem";
import SalesDashboard from "./pages/SalesDashboard";
import SalesOverview from "./pages/SalesOverview";
import ComparativasPage from "./pages/sales-overview/ComparativasPage";
import Top10Page from "./pages/sales-overview/Top10Page";
import SubiendoPage from "./pages/sales-overview/SubiendoPage";
import BajandoPage from "./pages/sales-overview/BajandoPage";
import AltoPotencialPage from "./pages/sales-overview/AltoPotencialPage";
import EnRiesgoPage from "./pages/sales-overview/EnRiesgoPage";
import SalesPerformanceCreator from "./pages/SalesPerformanceCreator";
import AiSales from "./pages/AiSales";
import AiSalesConfig from "./pages/AiSalesConfig";
import Dashboard from "./pages/Dashboard";
import Creadores from "./pages/Creadores";
import NuevoCreador from "./pages/NuevoCreador";
import CreadorProfile from "./pages/CreadorProfile";
import Eventos from "./pages/Eventos";
import NuevoEvento from "./pages/NuevoEvento";
import EditEvento from "./pages/EditEvento";
import EventoDetail from "./pages/EventoDetail";
import EventoSharePage from "./pages/eventos/EventoSharePage";
import LeadGen from "./pages/LeadGen";
import Promolog from "./pages/Promolog";
import Contactos from "./pages/Contactos";
import NuevoContacto from "./pages/NuevoContacto";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/eventos/share/:token" element={<EventoSharePage />} />

              {/* Protected routes */}
              <Route path="/design-system" element={<ProtectedRoute><DesignSystem /></ProtectedRoute>} />
              <Route path="/sales-overview" element={<ProtectedRoute><SalesOverview /></ProtectedRoute>} />
              <Route path="/sales-overview/comparativas" element={<ProtectedRoute><ComparativasPage /></ProtectedRoute>} />
              <Route path="/sales-overview/top10" element={<ProtectedRoute><Top10Page /></ProtectedRoute>} />
              <Route path="/sales-overview/subiendo" element={<ProtectedRoute><SubiendoPage /></ProtectedRoute>} />
              <Route path="/sales-overview/bajando" element={<ProtectedRoute><BajandoPage /></ProtectedRoute>} />
              <Route path="/sales-overview/alto-potencial" element={<ProtectedRoute><AltoPotencialPage /></ProtectedRoute>} />
              <Route path="/sales-overview/en-riesgo" element={<ProtectedRoute><EnRiesgoPage /></ProtectedRoute>} />
              <Route path="/salesdashboard" element={<ProtectedRoute><SalesDashboard /></ProtectedRoute>} />
              <Route path="/salesperformancecreator" element={<ProtectedRoute><SalesPerformanceCreator /></ProtectedRoute>} />
              <Route path="/aisales" element={<ProtectedRoute><AiSales /></ProtectedRoute>} />
              <Route path="/ai-sales-config" element={<ProtectedRoute><AiSalesConfig /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/contactos" element={<ProtectedRoute><Contactos /></ProtectedRoute>} />
              <Route path="/contactos/nuevo" element={<ProtectedRoute><NuevoContacto /></ProtectedRoute>} />
              <Route path="/creadores" element={<ProtectedRoute><Creadores /></ProtectedRoute>} />
              <Route path="/creadores/nuevo" element={<ProtectedRoute><NuevoCreador /></ProtectedRoute>} />
              <Route path="/creadores/:id" element={<ProtectedRoute><CreadorProfile /></ProtectedRoute>} />
              <Route path="/eventos" element={<ProtectedRoute><Eventos /></ProtectedRoute>} />
              <Route path="/leadgen" element={<ProtectedRoute><LeadGen /></ProtectedRoute>} />
              <Route path="/promolog" element={<ProtectedRoute><Promolog /></ProtectedRoute>} />
              <Route path="/eventos/nuevo" element={<ProtectedRoute><NuevoEvento /></ProtectedRoute>} />
              <Route path="/eventos/:id/editar" element={<ProtectedRoute><EditEvento /></ProtectedRoute>} />
              <Route path="/eventos/:id" element={<ProtectedRoute><EventoDetail /></ProtectedRoute>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
