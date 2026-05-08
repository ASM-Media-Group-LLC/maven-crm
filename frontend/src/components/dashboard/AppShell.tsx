import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import BackToDashboardBar from "@/components/dashboard/BackToDashboardBar";
import ClariAiFab from "@/components/ClariAiFab";
import AnnouncementPopup from "@/components/dashboard/AnnouncementPopup";
import { useAnnouncementsByChannel } from "@/hooks/useAnnouncements";
import { useUserRole } from "@/hooks/useUserRole";

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
