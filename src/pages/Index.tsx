import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";

const Index = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-8">
        <Logo size="lg" />
        <Button variant="outline" asChild>
          <Link to="/design-system">Design System</Link>
        </Button>
      </div>
    </div>
  );
};

export default Index;
