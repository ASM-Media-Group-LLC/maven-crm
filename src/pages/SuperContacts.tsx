import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import SuperContactsContent from "./supercontacts/SuperContactsContent";

const SuperContacts = () => (
  <SidebarProvider>
    <div className="flex h-screen w-full overflow-hidden">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <DashboardTopbar />
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <h1 className="text-2xl font-bold mb-6">SuperContacts</h1>
          <SuperContactsContent />
        </div>
      </div>
    </div>
  </SidebarProvider>
);

export default SuperContacts;
