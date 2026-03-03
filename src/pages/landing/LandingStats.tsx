import { Users, BarChart3, Clock, TrendingUp, Globe, Shield } from "lucide-react";
import { useEffect, useState, useRef, useCallback } from "react";
import ScrollReveal from "@/components/landing/ScrollReveal";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const stats = [
  { icon: Users, value: "215+", label: "Creadores activos" },
  { icon: BarChart3, value: "2.3M+", label: "Revenue tracked" },
  { icon: Clock, value: "24/7", label: "Monitoreo continuo" },
  { icon: TrendingUp, value: "32%", label: "Crecimiento mensual", prefix: "↑ " },
  { icon: Globe, value: "12+", label: "Países cubiertos" },
  { icon: Shield, value: "99.9%", label: "Uptime garantizado" },
];

function parseNumeric(val: string): { num: number; suffix: string; prefix: string } {
  const match = val.match(/^([^\d]*)([\d.]+)(.*)$/);
  if (!match) return { num: 0, suffix: val, prefix: "" };
  return { prefix: match[1], num: parseFloat(match[2]), suffix: match[3] };
}

function AnimatedCounter({ value, isVisible, extraPrefix = "" }: { value: string; isVisible: boolean; extraPrefix?: string }) {
  const { num, suffix, prefix } = parseNumeric(value);
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>();

  const animate = useCallback(() => {
    const duration = 1500;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(eased * num);
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [num]);

  useEffect(() => {
    if (isVisible) animate();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isVisible, animate]);

  const formatted = num % 1 !== 0 ? display.toFixed(1) : Math.round(display).toString();

  return (
    <span className="text-2xl font-bold text-white">
      {extraPrefix}{prefix}{isVisible ? formatted : "0"}{suffix}
    </span>
  );
}

const LandingStats = () => {
  const { ref, isVisible } = useScrollReveal(0.2);

  return (
    <section id="metricas" className="py-20">
      <div ref={ref} className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-4 md:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat, i) => (
          <ScrollReveal key={stat.label} delay={i * 100} className="h-full">
            <div className="glass-card-subtle flex h-full flex-col items-center p-5 text-center transition-all duration-500 hover:border-white/15 hover:shadow-[0_0_20px_-5px_hsl(211_100%_50%/0.2)]">
              <stat.icon className="mb-2 h-7 w-7 animate-float text-primary" />
              <AnimatedCounter value={stat.value} isVisible={isVisible} extraPrefix={stat.prefix || ""} />
              <span className="mt-1 text-xs text-white/50">{stat.label}</span>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
};

export default LandingStats;
