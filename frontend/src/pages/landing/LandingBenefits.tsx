import { Layers, Zap, BarChart3, ShieldCheck } from "lucide-react";
import ScrollReveal from "@/components/landing/ScrollReveal";

const benefits = [
  {
    icon: Layers,
    title: "Todo centralizado",
    description: "Elimina la fragmentación de herramientas. Creadores, ventas, HR, finanzas y comunicación en un solo lugar.",
  },
  {
    icon: Zap,
    title: "Automatización inteligente",
    description: "Procesos automáticos de nómina, comisiones, notificaciones y seguimiento que ahorran horas de trabajo manual.",
  },
  {
    icon: BarChart3,
    title: "Reportes en tiempo real",
    description: "Dashboards interactivos con métricas actualizadas para tomar decisiones basadas en datos.",
  },
  {
    icon: ShieldCheck,
    title: "Seguridad y control de roles",
    description: "Sistema granular de permisos y roles con auditoría completa de cada acción en la plataforma.",
  },
];

const LandingBenefits = () => (
  <section id="beneficios" className="py-20">
    <div className="mx-auto max-w-5xl px-4">
      <ScrollReveal>
        <h2 className="mb-3 text-center text-2xl font-bold text-white md:text-3xl">
          Beneficios clave
        </h2>
        <p className="mx-auto mb-12 max-w-xl text-center text-white/50">
          Diseñado para agencias que quieren operar al siguiente nivel.
        </p>
      </ScrollReveal>
      <div className="grid gap-6 sm:grid-cols-2">
        {benefits.map((b, i) => (
          <ScrollReveal key={b.title} delay={i * 120} direction={i % 2 === 0 ? "left" : "right"} className="h-full">
            <div className="glass-card-subtle group flex h-full gap-4 p-6 transition-all duration-500 hover:border-white/15 hover:shadow-[0_0_25px_-5px_hsl(211_100%_50%/0.15)]">
              <div className="shrink-0 rounded-lg bg-primary/10 p-3 transition-all duration-500 group-hover:bg-primary/20 group-hover:shadow-[0_0_20px_hsl(211_100%_50%/0.3)]">
                <b.icon className="h-6 w-6 text-primary transition-transform duration-500 group-hover:scale-110" />
              </div>
              <div>
                <h3 className="mb-1 text-base font-semibold text-white">{b.title}</h3>
                <p className="text-sm leading-relaxed text-white/55">{b.description}</p>
              </div>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </div>
  </section>
);

export default LandingBenefits;
