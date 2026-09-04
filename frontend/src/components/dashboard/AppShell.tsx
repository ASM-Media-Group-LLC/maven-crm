import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import BackToDashboardBar from "@/components/dashboard/BackToDashboardBar";
import { ChatProvider } from "@/hooks/ChatProvider";
import { MessengerDockProvider } from "@/components/messenger/MessengerDock";
import AnnouncementPopup from "@/components/dashboard/AnnouncementPopup";
import { useAnnouncementsByChannel } from "@/hooks/useAnnouncements";
import { useWaInboxNotifications } from "@/hooks/useWaInboxNotifications";
import { useTgInboxNotifications } from "@/hooks/useTgInboxNotifications";
import { useMessengerNotifications } from "@/hooks/useMessengerNotifications";

// Persistent shell for protected pages. Mounting Sidebar + Topbar (plus
// global overlays like the ClariAi FAB and announcement popups) at the
// route layout level — instead of inside every page wrapper — lets
// React Router swap only the inner content via <Outlet />.
//
// Casi todas las páginas del sidebar se importan eager en App.tsx, así que
// la navegación entre ellas es instantánea. Las lazy (/inbox, /correo,
// /grabaciones, etc.) se cubren con el Suspense de acá abajo: el fallback
// vive DENTRO del área de contenido, con sidebar y topbar montados, para
// que cargar un chunk se sienta como cambio de tab y no como reload
// completo (el Suspense raíz de App.tsx tapaba toda la pantalla con el
// splash del logo a los 180ms — exactamente lo que quería evitar).

// Fallback liviano solo para el área de contenido: barra fina arriba +
// skeleton, con el mismo fade retrasado del splash para que un chunk
// cacheado no flashee nada.
const ContentLoadingFallback = () => (
  <div className="relative flex-1 min-h-0 overflow-hidden">
    <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden">
      <div className="h-full w-1/3 animate-[loading-bar_1.2s_ease-in-out_infinite] bg-primary" />
    </div>
    <div
      className="space-y-4 p-6 opacity-0"
      style={{ animation: "delayed-fade-in 0.25s ease-out 0.18s forwards" }}
    >
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  </div>
);
const AppShell = () => {
  const { popups } = useAnnouncementsByChannel();
  // Aviso global de WhatsApp/Telegram entrante (sonido + notificación del navegador),
  // funcione donde funcione el usuario dentro de Maven (no solo en las bandejas).
  useWaInboxNotifications();
  useTgInboxNotifications();
  // Messenger interno global: ack "entregado" (✓✓ gris aunque no estés en /messenger) +
  // sonido y notificación del navegador al llegar un mensaje (salvo conversación silenciada).
  useMessengerNotifications();

  return (
    <ChatProvider>
    <MessengerDockProvider>
    <SidebarProvider>
      {/* h-dvh (no h-screen): en mobile el alto dinámico descuenta el teclado virtual y la
          barra del navegador, así el composer del Messenger no queda tapado. */}
      <div className="flex h-dvh w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <BackToDashboardBar />
          <Suspense fallback={<ContentLoadingFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
      {popups.length > 0 && <AnnouncementPopup popups={popups} />}
    </SidebarProvider>
    </MessengerDockProvider>
    </ChatProvider>
  );
};

export default AppShell;
