import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import AnimatedGradientBackground from "./AnimatedGradientBackground";
import AnimatedWaves from "./AnimatedWaves";

interface AuthLayoutProps {
  children: ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div className="min-h-screen relative overflow-hidden bg-[hsl(240,10%,2%)]">
      <AnimatedGradientBackground />
      <AnimatedWaves />
      {/* Topbar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-4">
        <Link to="/">
          <Button type="button" variant="ghost" size="icon" className="text-white/50 hover:text-white hover:bg-white/10">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <Logo size="xs" />
      </div>
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-8">
        <Logo size="md" />
        <p className="text-white/60 mt-2 mb-8 text-sm font-light tracking-wide text-center max-w-xs">
          La plataforma integral para gestionar, escalar y optimizar tus operaciones.
        </p>
        <div className="w-full max-w-md backdrop-blur-2xl bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8 shadow-[0_0_80px_-20px_hsl(271,91%,50%,0.3)]">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
