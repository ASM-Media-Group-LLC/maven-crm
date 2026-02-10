import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import Index from "./pages/Index";
import DesignSystem from "./pages/DesignSystem";
import SalesDashboard from "./pages/SalesDashboard";
import SalesPerformanceCreator from "./pages/SalesPerformanceCreator";
import AiSales from "./pages/AiSales";
import AiSalesConfig from "./pages/AiSalesConfig";
import Dashboard from "./pages/Dashboard";
import Creadores from "./pages/Creadores";
import NuevoCreador from "./pages/NuevoCreador";
import CreadorProfile from "./pages/CreadorProfile";
import Eventos from "./pages/Eventos";
import NuevoEvento from "./pages/NuevoEvento";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/design-system" element={<DesignSystem />} />
            <Route path="/salesdashboard" element={<SalesDashboard />} />
            <Route path="/salesperformancecreator" element={<SalesPerformanceCreator />} />
            <Route path="/aisales" element={<AiSales />} />
            <Route path="/ai-sales-config" element={<AiSalesConfig />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/creadores" element={<Creadores />} />
            <Route path="/creadores/nuevo" element={<NuevoCreador />} />
            <Route path="/creadores/:id" element={<CreadorProfile />} />
            <Route path="/eventos" element={<Eventos />} />
            <Route path="/eventos/nuevo" element={<NuevoEvento />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
