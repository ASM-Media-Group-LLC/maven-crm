import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import BackToDashboardBar from "@/components/dashboard/BackToDashboardBar";
import ClariAiFab from "@/components/ClariAiFab";
import AnnouncementPopup from "@/components/dashboard/AnnouncementPopup";
import { useAnnouncementsByChannel } from "@/hooks/useAnnouncements";
import { useUserRole } from "@/hooks/useUserRole";
import { useAppPrefetch } from "@/hooks/useAppPrefetch";

// Persistent shell for protected pages. Mounting Sidebar + Topbar (plus
// global overlays like the ClariAi FAB and announcement popups) at the
// route layout level — instead of inside every page wrapper — lets
// React Router swap only the inner content via <Outlet />.
//
// Las páginas ahora son lazy() (ver App.tsx). Para que la nav siga
// sintiéndose nativa, useAppPrefetch carga en idle los chunks de los
// módulos a los que el user tiene acceso, después que cargan permisos.
// Cuando el user clickea HR/Finanzas/etc. el chunk ya está cacheado.
const AppShell = () => {
  const { popups } = useAnnouncementsByChannel();
  const { isAdmin } = useUserRole();
  useAppPrefetch();

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
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
