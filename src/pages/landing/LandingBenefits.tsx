import { Layers, Zap, BarChart3, ShieldCheck } from "lucide-react";

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
      <h2 className="mb-3 animate-fade-in-up text-center text-2xl font-bold text-white md:text-3xl">
        Beneficios clave
      </h2>
      <p className="mx-auto mb-12 max-w-xl text-center text-white/50">
        Diseñado para agencias que quieren operar al siguiente nivel.
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        {benefits.map((b, i) => (
          <div
            key={b.title}
            className="glass-card-subtle group animate-fade-in-up flex gap-4 p-6 transition-all duration-300 hover:border-white/15"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="shrink-0 rounded-lg bg-primary/10 p-3">
              <b.icon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="mb-1 text-base font-semibold text-white">{b.title}</h3>
              <p className="text-sm leading-relaxed text-white/55">{b.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default LandingBenefits;
