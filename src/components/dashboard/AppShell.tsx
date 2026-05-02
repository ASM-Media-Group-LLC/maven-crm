import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import ClariAiFab from "@/components/ClariAiFab";
import AnnouncementPopup from "@/components/dashboard/AnnouncementPopup";
import { useAnnouncementsByChannel } from "@/hooks/useAnnouncements";
import { useUserRole } from "@/hooks/useUserRole";

// Pre-warm the chunks for the most-visited pages so the FIRST nav to
// each one doesn't pay a download cost. Runs after the current page is
// idle (requestIdleCallback) so the user's current view stays
// responsive. Each import() returns a promise that webpack/vite caches
// — once it resolves the chunk lives in memory and React.lazy resolves
// instantly when the user finally visits.
const prefetchCommonPages = () => {
  // Tabs the user reaches most often after landing on the dashboard.
  // Order matters loosely — we kick them off as parallel imports but
  // the network stack will queue them. Keep this list to ~10 to avoid
  // saturating the connection.
  void import("@/pages/Dashboard");
  void import("@/pages/ChatterEvaluator");
  void import("@/pages/ChatterWorkspace");
  void import("@/pages/Closers");
  void import("@/pages/Tickets");
  void import("@/pages/Promolog");
  void import("@/pages/Tareas");
  void import("@/pages/Contactos");
  void import("@/pages/Eventos");
  void import("@/pages/LeadGen");
};

// Persistent shell for protected pages. Mounting Sidebar + Topbar (plus
// global overlays like the ClariAi FAB and announcement popups) at the
// route layout level — instead of inside every page wrapper — lets
// React Router swap only the inner content via <Outlet />. The sidebar's
// queries (notifications, role, sidebar counts) don't refire on every
// nav and the page transition feels instantaneous.
const AppShell = () => {
  const { popups } = useAnnouncementsByChannel();
  const { isAdmin } = useUserRole();

  useEffect(() => {
    const idle =
      (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback;
    if (idle) {
      idle(prefetchCommonPages, { timeout: 3000 });
    } else {
      // Safari fallback — schedule a couple seconds out so it doesn't
      // race with the initial page render.
      setTimeout(prefetchCommonPages, 2000);
    }
  }, []);

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <Outlet />
        </div>
      </div>
      {isAdmin && <ClariAiFab />}
      {popups.length > 0 && <AnnouncementPopup popups={popups} />}
    </SidebarProvider>
  );
};

export default AppShell;
