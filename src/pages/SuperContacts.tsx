import DashboardLayout from "@/components/dashboard/DashboardLayout";
import SuperContactsContent from "./supercontacts/SuperContactsContent";

const SuperContacts = () => (
  <DashboardLayout>
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-6">SuperContacts</h1>
      <SuperContactsContent />
    </div>
  </DashboardLayout>
);

export default SuperContacts;
