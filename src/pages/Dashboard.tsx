import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import DashboardContent from "@/components/dashboard/DashboardContent";
import ClariAiFab from "@/components/ClariAiFab";
import AnnouncementPopup from "@/components/dashboard/AnnouncementPopup";
import { useAnnouncementsByChannel } from "@/hooks/useAnnouncements";

const Dashboard = () => {
  const { popups } = useAnnouncementsByChannel();

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <DashboardContent />
        </div>
      </div>
      <ClariAiFab />
      {popups.length > 0 && <AnnouncementPopup popups={popups} />}
    </SidebarProvider>
  );
};

export default Dashboard;
