import MPTopbar from "./components/MPTopbar";
import MPSidebar from "./components/MPSidebar";

const ProyectoMPLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-screen w-full overflow-hidden">
    <MPSidebar />
    <div className="flex flex-1 flex-col min-w-0">
      <DashboardTopbar />
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  </div>
);

export default ProyectoMPLayout;
