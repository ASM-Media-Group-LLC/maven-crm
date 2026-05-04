import { UserPlus, Settings2, Rocket } from "lucide-react";
import ScrollReveal from "@/components/landing/ScrollReveal";

const steps = [
  {
    icon: UserPlus,
    step: "01",
    title: "Registra tu agencia",
    description: "Crea tu cuenta en segundos y configura tu equipo con roles y permisos personalizados.",
  },
  {
    icon: Settings2,
    step: "02",
    title: "Configura tus módulos",
    description: "Activa solo los módulos que necesitas: creadores, ventas, HR, finanzas y más.",
  },
  {
    icon: Rocket,
    step: "03",
    title: "Escala tus operaciones",
    description: "Automatiza procesos, monitorea métricas en tiempo real y haz crecer tu agencia.",
  },
];

const directions = ["left", "up", "right"] as const;

const LandingHowItWorks = () => (
  <section className="py-20">
    <div className="mx-auto max-w-5xl px-4">
      <ScrollReveal>
        <h2 className="mb-3 text-center text-2xl font-bold text-white md:text-3xl">
          ¿Cómo funciona?
        </h2>
        <p className="mx-auto mb-14 max-w-xl text-center text-white/50">
          Tres pasos para transformar la operación de tu agencia.
        </p>
      </ScrollReveal>
      <div className="grid gap-8 md:grid-cols-3">
        {steps.map((s, i) => (
          <ScrollReveal key={s.step} delay={i * 150} direction={directions[i]} className="h-full">
            <div className="glass-card-subtle group relative h-full p-6 text-center transition-all duration-500 hover:border-white/15 hover:shadow-[0_0_30px_-5px_hsl(211_100%_50%/0.2)]">
              <span className="absolute -top-4 left-6 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-[0_0_15px_hsl(211_100%_50%/0.4)]">
                {s.step}
              </span>
              <s.icon className="mx-auto mb-4 mt-2 h-10 w-10 text-primary transition-all duration-500 group-hover:scale-110 group-hover:drop-shadow-[0_0_12px_hsl(211_100%_50%/0.5)]" />
              <h3 className="mb-2 text-lg font-semibold text-white">{s.title}</h3>
              <p className="text-sm leading-relaxed text-white/55">{s.description}</p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </div>
  </section>
);

export default LandingHowItWorks;
