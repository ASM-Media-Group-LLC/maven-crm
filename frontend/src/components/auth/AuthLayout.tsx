import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Logo from "@/components/Logo";
import AnimatedGradientBackground from "./AnimatedGradientBackground";
import AnimatedWaves from "./AnimatedWaves";
import { useLanguage } from "@/hooks/useLanguage";

interface AuthLayoutProps {
  children: ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen relative overflow-hidden bg-[hsl(240,10%,2%)]">
      <AnimatedGradientBackground />
      <AnimatedWaves />
      {/* Topbar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-start px-6 py-4">
        <Link to="/" className="inline-flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm">
          <ArrowLeft className="h-4 w-4" />
          <span>{t("shared.authLayout.backHome")}</span>
        </Link>
      </div>
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-8">
        <Logo size="md" />
        <p className="text-white/60 mt-2 mb-8 text-sm font-light tracking-wide text-center max-w-xs">
          {t("shared.authLayout.tagline")}
        </p>
        <div className="w-full max-w-md backdrop-blur-2xl bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8 shadow-[0_0_80px_-20px_hsl(271,91%,50%,0.3)]">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
