import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import BackToDashboardBar from "@/components/dashboard/BackToDashboardBar";
import ClariAiFab from "@/components/ClariAiFab";
import AnnouncementPopup from "@/components/dashboard/AnnouncementPopup";
import { useAnnouncementsByChannel } from "@/hooks/useAnnouncements";
import { useUserRole } from "@/hooks/useUserRole";
import { useWaInboxNotifications } from "@/hooks/useWaInboxNotifications";
import { useTgInboxNotifications } from "@/hooks/useTgInboxNotifications";
import { useMessengerNotifications } from "@/hooks/useMessengerNotifications";

// Persistent shell for protected pages. Mounting Sidebar + Topbar (plus
// global overlays like the ClariAi FAB and announcement popups) at the
// route layout level — instead of inside every page wrapper — lets
// React Router swap only the inner content via <Outlet />.
//
// All sidebar-reachable pages are imported eagerly in App.tsx, so we
// don't need a runtime prefetch step here — the chunks are already in
// the initial bundle and nav is instant.
const AppShell = () => {
  const { popups } = useAnnouncementsByChannel();
  const { isAdmin } = useUserRole();
  // Aviso global de WhatsApp/Telegram entrante (sonido + notificación del navegador),
  // funcione donde funcione el usuario dentro de Maven (no solo en las bandejas).
  useWaInboxNotifications();
  useTgInboxNotifications();
  // Messenger interno global: ack "entregado" (✓✓ gris aunque no estés en /messenger) +
  // sonido y notificación del navegador al llegar un mensaje (salvo conversación silenciada).
  useMessengerNotifications();

  return (
    <SidebarProvider>
      {/* h-dvh (no h-screen): en mobile el alto dinámico descuenta el teclado virtual y la
          barra del navegador, así el composer del Messenger no queda tapado. */}
      <div className="flex h-dvh w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <BackToDashboardBar />
          <Outlet />
        </div>
      </div>
      {isAdmin && <ClariAiFab />}
      {popups.length > 0 && <AnnouncementPopup popups={popups} />}
    </SidebarProvider>
  );
};

export default AppShell;
