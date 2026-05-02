// Thin wrapper — see the note in HRLayout. The real shell (Sidebar +
// Topbar) is in <AppShell />.
const FinanzasLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="flex-1 overflow-auto">{children}</div>
);

export default FinanzasLayout;
