import { ReactNode } from "react";
import Logo from "@/components/Logo";
import AnimatedGradientBackground from "./AnimatedGradientBackground";

interface AuthLayoutProps {
  children: ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div className="flex min-h-screen">
      {/* Decorative left panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[hsl(240,8%,6%)]">
        <AnimatedGradientBackground />
        <div className="relative z-10 flex flex-col items-center justify-center w-full px-12">
          <Logo size="lg" />
          <p className="text-white/50 mt-4 text-lg font-light tracking-wide">
            Gestiona tus creadores
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-background px-4 py-8">
        {children}
      </div>
    </div>
  );
};

export default AuthLayout;
