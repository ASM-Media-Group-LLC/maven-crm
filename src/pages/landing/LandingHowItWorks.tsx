import { UserPlus, Settings2, Rocket } from "lucide-react";

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

const LandingHowItWorks = () => (
  <section className="py-20">
    <div className="mx-auto max-w-5xl px-4">
      <h2 className="mb-3 animate-fade-in-up text-center text-2xl font-bold text-white md:text-3xl">
        ¿Cómo funciona?
      </h2>
      <p className="mx-auto mb-14 max-w-xl text-center text-white/50">
        Tres pasos para transformar la operación de tu agencia.
      </p>
      <div className="grid gap-8 md:grid-cols-3">
        {steps.map((s, i) => (
          <div
            key={s.step}
            className="glass-card-subtle group animate-fade-in-up relative p-6 text-center transition-all duration-300 hover:border-white/15"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <span className="absolute -top-4 left-6 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
              {s.step}
            </span>
            <s.icon className="mx-auto mb-4 mt-2 h-10 w-10 text-primary transition-transform duration-300 group-hover:scale-110" />
            <h3 className="mb-2 text-lg font-semibold text-white">{s.title}</h3>
            <p className="text-sm leading-relaxed text-white/55">{s.description}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default LandingHowItWorks;
