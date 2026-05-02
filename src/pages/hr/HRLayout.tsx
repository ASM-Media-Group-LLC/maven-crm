// Thin wrapper kept for legacy callers — the real shell (Sidebar +
// Topbar) is now provided by the parent <AppShell /> route layout, so
// HRLayout just adds the overflow container that HR pages depend on.
const HRLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="flex-1 overflow-hidden">{children}</div>
);

export default HRLayout;
