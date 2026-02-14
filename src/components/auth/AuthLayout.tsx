import { ReactNode } from "react";
import Logo from "@/components/Logo";
import AnimatedGradientBackground from "./AnimatedGradientBackground";

interface AuthLayoutProps {
  children: ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div className="min-h-screen relative overflow-hidden bg-[hsl(240,8%,6%)]">
      <AnimatedGradientBackground />
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-8">
        <Logo size="lg" />
        <p className="text-white/50 mt-2 mb-8 text-lg font-light tracking-wide">
          Gestiona tus creadores
        </p>
        <div className="w-full max-w-md backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
