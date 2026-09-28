import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { useLanguage } from "@/hooks/useLanguage";

const Index = () => {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-8">
        <Logo size="lg" />
        <div className="flex items-center gap-4">
          <Button variant="outline" asChild>
            <Link to="/design-system">Design System</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/dashboard2">{t("page.index.salesDashboard")}</Link>

          </Button>
          <Button variant="outline" asChild>
            <Link to="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
