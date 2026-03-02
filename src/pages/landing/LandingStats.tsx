import { Users, BarChart3, Clock, TrendingUp, Globe, Shield } from "lucide-react";

const stats = [
  { icon: Users, value: "215+", label: "Creadores activos" },
  { icon: BarChart3, value: "2.3M+", label: "Revenue tracked" },
  { icon: Clock, value: "24/7", label: "Monitoreo continuo" },
  { icon: TrendingUp, value: "↑ 32%", label: "Crecimiento mensual" },
  { icon: Globe, value: "12+", label: "Países cubiertos" },
  { icon: Shield, value: "99.9%", label: "Uptime garantizado" },
];

const LandingStats = () => (
  <section id="metricas" className="py-20">
    <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-4 md:grid-cols-3 lg:grid-cols-6">
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className="glass-card-subtle flex animate-fade-in-up flex-col items-center p-5 text-center"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <stat.icon className="mb-2 h-7 w-7 animate-float text-primary" />
          <span className="text-2xl font-bold text-white">{stat.value}</span>
          <span className="mt-1 text-xs text-white/50">{stat.label}</span>
        </div>
      ))}
    </div>
  </section>
);

export default LandingStats;
