// Banco: la barra de arriba de la app de computador (18/11/2026).
// /harness.html?ver=app-barra[&mac=1] → riel angosto (sin logo en la app) y la
// barra con «Maven» + versión. Abierto DENTRO de la app de Mac se ve el semáforo
// real encima. Sin sesión ni base.
import { Home, MessageSquare, Video } from "lucide-react";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import Logo from "@/components/Logo";
import { TituloDeLaApp } from "@/components/dashboard/DashboardTopbar";

export function prepararBarraFalsa(mac: boolean) {
  const raiz = document.documentElement;
  raiz.classList.add("en-escritorio", mac ? "escritorio-mac" : "escritorio-windows");
}

export function BancoAppBarra() {
  return (
    <SidebarProvider defaultOpen={false}>
      <div className="fondo-glass flex h-dvh w-full overflow-hidden text-foreground">
        <Sidebar collapsible="icon" variant="floating">
          <SidebarHeader className="riel-logo flex h-14 flex-row items-center justify-start px-5 border-b border-border shrink-0">
            <Logo size="sm" collapsed />
          </SidebarHeader>
          <SidebarContent className="gap-2 px-3 py-3">
            <SidebarMenu>
              {[Home, MessageSquare, Video].map((Icono, i) => (
                <SidebarMenuItem key={i}><SidebarMenuButton><Icono /></SidebarMenuButton></SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
        <div className="flex flex-1 flex-col min-w-0 gap-2 py-2 pr-2">
          <header className="barra-arrastrable vidrio-barra z-30 box-content flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-4 sm:px-4">
            <SidebarTrigger />
            <TituloDeLaApp version="2.1.2611181137" />
            <div className="flex shrink-0 items-center gap-1">
              <span className="h-8 w-8 rounded-full bg-foreground/[0.06]" />
              <span className="h-8 w-8 rounded-full bg-foreground/[0.06]" />
            </div>
          </header>
          <main className="vidrio-panel relative flex-1" />
        </div>
      </div>
    </SidebarProvider>
  );
}
