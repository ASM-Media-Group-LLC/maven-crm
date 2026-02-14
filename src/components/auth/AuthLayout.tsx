import { ReactNode } from "react";
import Logo from "@/components/Logo";
import AnimatedGradientBackground from "./AnimatedGradientBackground";

interface AuthLayoutProps {
  children: ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div className="min-h-screen relative overflow-hidden bg-[hsl(240,10%,2%)]">
      <AnimatedGradientBackground />
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-8">
        <Logo size="sm" />
        <p className="text-white/40 mt-2 mb-8 text-sm font-light tracking-wide text-center max-w-xs">
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
