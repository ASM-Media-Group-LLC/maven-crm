import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import AnimatedGradientBackground from "@/components/auth/AnimatedGradientBackground";
import AnimatedWaves from "@/components/auth/AnimatedWaves";
import { Zap, Users, DollarSign, Briefcase, MessageSquare } from "lucide-react";
import LandingModules from "./landing/LandingModules";
import LandingHowItWorks from "./landing/LandingHowItWorks";
import LandingBenefits from "./landing/LandingBenefits";
import LandingStats from "./landing/LandingStats";
import LandingFAQ from "./landing/LandingFAQ";
import LandingFooter from "./landing/LandingFooter";
import ScrollReveal from "@/components/landing/ScrollReveal";

const heroPills = [
  { icon: Users, label: "Gestión de creadores" },
  { icon: DollarSign, label: "Sales tracking" },
  { icon: Briefcase, label: "HR completo" },
  { icon: MessageSquare, label: "Messenger interno" },
];

const Landing = () => {
  return (
    <div className="min-h-screen bg-[hsl(240,10%,2%)] text-white">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[hsl(240,10%,2%)]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo size="sm" />
          <div className="hidden items-center gap-6 md:flex">
            {[
              { href: "#modulos", label: "Módulos" },
              { href: "#beneficios", label: "Beneficios" },
              { href: "#metricas", label: "Métricas" },
              { href: "#faq", label: "FAQ" },
            ].map((link) => (
              <a key={link.href} href={link.href} className="text-sm text-white/50 transition-colors hover:text-white">
                {link.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" asChild className="border-white/10 text-white hover:bg-white/10">
              <Link to="/login">Iniciar Sesión</Link>
            </Button>
            <Button asChild>
              <Link to="/register">Registrarse</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pb-20 pt-16 md:pt-24">
        <AnimatedGradientBackground />
        <AnimatedWaves />
        <div className="relative z-10 flex flex-col items-center px-4 text-center">
          <Badge variant="secondary" className="glass-card-subtle mb-8 animate-fade-in-up animate-float border-white/10 bg-white/5 text-sm font-normal text-white/80">
            Plataforma completa para agencias de creadores
          </Badge>
          <div className="animate-fade-in-up" style={{ animationDelay: "100ms" }}>
            <Logo size="lg" className="mb-6" />
          </div>
          <p className="mx-auto mb-6 max-w-2xl animate-fade-in-up text-lg text-white/60 md:text-xl" style={{ animationDelay: "200ms" }}>
            La plataforma todo-en-uno para gestionar creadores, ventas, leads, HR, finanzas, eventos y comunicación de tu agencia.
          </p>
          {/* Hero pills */}
          <div className="mb-8 flex animate-fade-in-up flex-wrap justify-center gap-3" style={{ animationDelay: "250ms" }}>
            {heroPills.map((pill) => (
              <span key={pill.label} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition-all duration-300 hover:border-white/20 hover:bg-white/10">
                <pill.icon className="h-3.5 w-3.5 text-primary" />
                {pill.label}
              </span>
            ))}
          </div>
          <div className="flex animate-fade-in-up items-center gap-4" style={{ animationDelay: "350ms" }}>
            <Button size="lg" asChild className="transition-all duration-300 hover:scale-105 hover:shadow-[0_0_25px_hsl(var(--primary)/0.4)]">
              <Link to="/register">Crear cuenta gratis</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="border-white/10 text-white transition-all duration-300 hover:scale-105 hover:bg-white/10">
              <Link to="/login">Iniciar sesión</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Gradient divider */}
      <div className="mx-auto h-px max-w-4xl bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      {/* Modules */}
      <LandingModules />

      <div className="mx-auto h-px max-w-4xl bg-gradient-to-r from-transparent via-accent/20 to-transparent" />

      {/* How it works */}
      <LandingHowItWorks />

      <div className="mx-auto h-px max-w-4xl bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      {/* Benefits */}
      <LandingBenefits />

      <div className="mx-auto h-px max-w-4xl bg-gradient-to-r from-transparent via-accent/20 to-transparent" />

      {/* Stats */}
      <LandingStats />

      <div className="mx-auto h-px max-w-4xl bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      {/* FAQ */}
      <LandingFAQ />

      {/* CTA Section */}
      <section className="relative overflow-hidden py-20">
        <AnimatedGradientBackground />
        <div className="relative z-10 mx-auto max-w-3xl px-4 text-center">
          <ScrollReveal direction="scale">
            <div className="glass-card p-10 md:p-14">
              <Zap className="mx-auto mb-4 h-10 w-10 animate-float text-primary" />
              <h2 className="mb-4 text-2xl font-bold text-white md:text-3xl">
                ¿Listo para escalar tu agencia?
              </h2>
              <p className="mb-8 text-white/60">
                Únete a las agencias que ya optimizan sus operaciones con Maven.
              </p>
              <Button size="lg" asChild className="transition-all duration-300 hover:scale-105 hover:shadow-[0_0_25px_hsl(var(--primary)/0.4)]">
                <Link to="/register">Comenzar ahora</Link>
              </Button>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Footer */}
      <LandingFooter />
    </div>
  );
};

export default Landing;
