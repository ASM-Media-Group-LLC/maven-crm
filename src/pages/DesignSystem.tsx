import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const colors = [
  { name: "background", variable: "--background", value: "240 8% 10%", desc: "Fondo principal de la app" },
  { name: "foreground", variable: "--foreground", value: "240 5% 96%", desc: "Color de texto principal" },
  { name: "card", variable: "--card", value: "240 6% 13%", desc: "Fondo de tarjetas" },
  { name: "card-foreground", variable: "--card-foreground", value: "240 5% 96%", desc: "Texto en tarjetas" },
  { name: "primary", variable: "--primary", value: "211 100% 50%", desc: "Color principal de acción" },
  { name: "primary-foreground", variable: "--primary-foreground", value: "0 0% 100%", desc: "Texto sobre primary" },
  { name: "secondary", variable: "--secondary", value: "240 6% 15%", desc: "Color secundario" },
  { name: "secondary-foreground", variable: "--secondary-foreground", value: "240 5% 96%", desc: "Texto sobre secondary" },
  { name: "muted", variable: "--muted", value: "240 6% 15%", desc: "Fondos atenuados" },
  { name: "muted-foreground", variable: "--muted-foreground", value: "240 5% 65%", desc: "Texto atenuado" },
  { name: "accent", variable: "--accent", value: "271 91% 50%", desc: "Color de énfasis" },
  { name: "accent-foreground", variable: "--accent-foreground", value: "0 0% 100%", desc: "Texto sobre accent" },
  { name: "destructive", variable: "--destructive", value: "0 84% 60%", desc: "Acciones destructivas" },
  { name: "destructive-foreground", variable: "--destructive-foreground", value: "0 0% 100%", desc: "Texto sobre destructive" },
  { name: "success", variable: "--success", value: "145 63% 32%", desc: "Estados exitosos" },
  { name: "success-foreground", variable: "--success-foreground", value: "0 0% 100%", desc: "Texto sobre success" },
  { name: "border", variable: "--border", value: "240 6% 18%", desc: "Bordes por defecto" },
  { name: "input", variable: "--input", value: "240 6% 18%", desc: "Bordes de inputs" },
  { name: "ring", variable: "--ring", value: "211 100% 50%", desc: "Anillo de focus" },
];

const sidebarColors = [
  { name: "sidebar-background", value: "240 8% 10%" },
  { name: "sidebar-foreground", value: "240 5% 96%" },
  { name: "sidebar-primary", value: "211 100% 50%" },
  { name: "sidebar-primary-foreground", value: "0 0% 100%" },
  { name: "sidebar-accent", value: "240 6% 15%" },
  { name: "sidebar-accent-foreground", value: "240 5% 96%" },
  { name: "sidebar-border", value: "240 6% 12%" },
  { name: "sidebar-ring", value: "211 100% 50%" },
];

const instagramColors = [
  { name: "instagram-pink", variable: "--instagram-pink", value: "340 82% 59%" },
  { name: "instagram-purple", variable: "--instagram-purple", value: "271 91% 50%" },
  { name: "instagram-orange", variable: "--instagram-orange", value: "25 95% 53%" },
];

const typographyScale = [
  { name: "5xl", size: "3rem / 48px", className: "text-5xl" },
  { name: "4xl", size: "2.25rem / 36px", className: "text-4xl" },
  { name: "3xl", size: "1.875rem / 30px", className: "text-3xl" },
  { name: "2xl", size: "1.5rem / 24px", className: "text-2xl" },
  { name: "xl", size: "1.25rem / 20px", className: "text-xl" },
  { name: "lg", size: "1.125rem / 18px", className: "text-lg" },
  { name: "base", size: "1rem / 16px", className: "text-base" },
  { name: "sm", size: "0.875rem / 14px", className: "text-sm" },
  { name: "xs", size: "0.75rem / 12px", className: "text-xs" },
];

const fontWeights = [
  { name: "thin", value: "100", className: "font-thin" },
  { name: "light", value: "300", className: "font-light" },
  { name: "normal", value: "400", className: "font-normal" },
  { name: "medium", value: "500", className: "font-medium" },
  { name: "semibold", value: "600", className: "font-semibold" },
  { name: "bold", value: "700", className: "font-bold" },
  { name: "extrabold", value: "800", className: "font-extrabold" },
  { name: "black", value: "900", className: "font-black" },
];

const spacingScale = [
  { name: "0", value: "0px" },
  { name: "0.5", value: "2px" },
  { name: "1", value: "4px" },
  { name: "1.5", value: "6px" },
  { name: "2", value: "8px" },
  { name: "2.5", value: "10px" },
  { name: "3", value: "12px" },
  { name: "4", value: "16px" },
  { name: "5", value: "20px" },
  { name: "6", value: "24px" },
  { name: "8", value: "32px" },
  { name: "10", value: "40px" },
  { name: "12", value: "48px" },
  { name: "16", value: "64px" },
];

const borderRadii = [
  { name: "none", className: "rounded-none", value: "0" },
  { name: "sm", className: "rounded-sm", value: "calc(var(--radius) - 4px)" },
  { name: "md", className: "rounded-md", value: "calc(var(--radius) - 2px)" },
  { name: "lg", className: "rounded-lg", value: "var(--radius)" },
  { name: "xl", className: "rounded-xl", value: "0.75rem" },
  { name: "2xl", className: "rounded-2xl", value: "1rem" },
  { name: "full", className: "rounded-full", value: "9999px" },
];

const shadows = [
  { name: "minimal", value: "0 1px 3px rgba(0,0,0,0.06)" },
  { name: "card", value: "0 2px 8px rgba(0,0,0,0.08)" },
  { name: "elevated", value: "0 4px 16px rgba(0,0,0,0.1)" },
];

const badgeVariants = [
  "default", "secondary", "destructive", "outline", "success", "warning", "info",
  "success-soft", "warning-soft", "destructive-soft", "primary-soft", "secondary-soft",
] as const;

const buttonVariants = ["default", "destructive", "outline", "secondary", "ghost", "link"] as const;
const buttonSizes = ["default", "sm", "lg", "icon"] as const;

const DesignSystem = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-6 py-12 space-y-16">
        {/* Header */}
        <header className="space-y-2">
          <h1 className="text-5xl font-bold tracking-tight">Design System</h1>
          <p className="text-muted-foreground text-lg">
            v1.0.0 · Exportado el 6 de febrero de 2026
          </p>
          <p className="text-muted-foreground">React + Tailwind CSS</p>
        </header>

        {/* Colors */}
        <section className="space-y-6">
          <h2 className="text-3xl font-semibold">Colores</h2>

          <div>
            <h3 className="text-xl font-medium mb-4 text-muted-foreground">Principales</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {colors.map((c) => (
                <div key={c.name} className="space-y-2">
                  <div
                    className="h-20 rounded-lg border border-border"
                    style={{ backgroundColor: `hsl(${c.value})` }}
                  />
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{c.value}</p>
                  <p className="text-xs text-muted-foreground">{c.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-4 text-muted-foreground">Sidebar</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {sidebarColors.map((c) => (
                <div key={c.name} className="space-y-2">
                  <div
                    className="h-16 rounded-lg border border-border"
                    style={{ backgroundColor: `hsl(${c.value})` }}
                  />
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{c.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-4 text-muted-foreground">Instagram</h3>
            <div className="grid grid-cols-3 gap-4 max-w-md">
              {instagramColors.map((c) => (
                <div key={c.name} className="space-y-2">
                  <div
                    className="h-16 rounded-lg border border-border"
                    style={{ backgroundColor: `hsl(${c.value})` }}
                  />
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{c.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Typography */}
        <section className="space-y-6">
          <h2 className="text-3xl font-semibold">Tipografía</h2>

          <div>
            <h3 className="text-xl font-medium mb-4 text-muted-foreground">Escala</h3>
            <div className="space-y-4">
              {typographyScale.map((t) => (
                <div key={t.name} className="flex items-baseline gap-4 border-b border-border pb-3">
                  <span className="text-xs text-muted-foreground font-mono w-20 shrink-0">
                    {t.name}
                  </span>
                  <span className="text-xs text-muted-foreground w-32 shrink-0">{t.size}</span>
                  <span className={t.className}>
                    El veloz murciélago hindú
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-4 text-muted-foreground">Pesos</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {fontWeights.map((w) => (
                <div key={w.name} className="space-y-1">
                  <p className={`text-lg ${w.className}`}>Maven Aa</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {w.name} ({w.value})
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Spacing */}
        <section className="space-y-6">
          <h2 className="text-3xl font-semibold">Espaciado</h2>
          <div className="space-y-2">
            {spacingScale.map((s) => (
              <div key={s.name} className="flex items-center gap-4">
                <span className="text-xs text-muted-foreground font-mono w-12 text-right shrink-0">
                  {s.name}
                </span>
                <span className="text-xs text-muted-foreground w-12 shrink-0">{s.value}</span>
                <div
                  className="h-3 rounded-sm bg-primary"
                  style={{ width: s.value }}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Border Radius */}
        <section className="space-y-6">
          <h2 className="text-3xl font-semibold">Border Radius</h2>
          <div className="flex flex-wrap gap-6">
            {borderRadii.map((r) => (
              <div key={r.name} className="flex flex-col items-center gap-2">
                <div
                  className={`w-20 h-20 bg-primary ${r.className}`}
                />
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{r.className}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Shadows */}
        <section className="space-y-6">
          <h2 className="text-3xl font-semibold">Sombras</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {shadows.map((s) => (
              <Card key={s.name} style={{ boxShadow: s.value }}>
                <CardHeader>
                  <CardTitle className="text-lg">{s.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground font-mono break-all">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Badges */}
        <section className="space-y-6">
          <h2 className="text-3xl font-semibold">Componentes — Badge</h2>
          <div className="flex flex-wrap gap-3">
            {badgeVariants.map((v) => (
              <Badge key={v} variant={v}>{v}</Badge>
            ))}
          </div>
        </section>

        {/* Buttons */}
        <section className="space-y-6">
          <h2 className="text-3xl font-semibold">Componentes — Button</h2>

          <div>
            <h3 className="text-xl font-medium mb-4 text-muted-foreground">Variantes</h3>
            <div className="flex flex-wrap gap-3">
              {buttonVariants.map((v) => (
                <Button key={v} variant={v}>{v}</Button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-4 text-muted-foreground">Tamaños</h3>
            <div className="flex flex-wrap items-center gap-3">
              {buttonSizes.map((s) => (
                <Button key={s} size={s}>
                  {s === "icon" ? "◆" : s}
                </Button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default DesignSystem;
