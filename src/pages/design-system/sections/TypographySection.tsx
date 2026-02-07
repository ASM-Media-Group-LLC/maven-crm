const hierarchy = [
  { role: "H1", size: "text-5xl", pixels: "48px", lineHeight: "1", letterSpacing: "tight (-0.025em)", usage: "Títulos principales de página. Solo uno por vista." },
  { role: "H2", size: "text-3xl", pixels: "30px", lineHeight: "1.2", letterSpacing: "normal", usage: "Títulos de sección dentro de una página." },
  { role: "H3", size: "text-2xl", pixels: "24px", lineHeight: "1.3", letterSpacing: "tight (-0.015em)", usage: "Subtítulos, headers de Cards." },
  { role: "H4", size: "text-xl", pixels: "20px", lineHeight: "1.4", letterSpacing: "normal", usage: "Encabezados terciarios, títulos de grupos." },
  { role: "Body", size: "text-base", pixels: "16px", lineHeight: "1.5", letterSpacing: "normal", usage: "Texto general, párrafos, contenido principal." },
  { role: "Body SM", size: "text-sm", pixels: "14px", lineHeight: "1.43", letterSpacing: "normal", usage: "Texto secundario, descripciones, metadata." },
  { role: "Caption", size: "text-xs", pixels: "12px", lineHeight: "1.33", letterSpacing: "normal", usage: "Etiquetas pequeñas, timestamps, hints." },
  { role: "Label", size: "text-sm font-medium", pixels: "14px", lineHeight: "1.43", letterSpacing: "normal", usage: "Labels de formulario, navegación, badges." },
];

const weights = [
  { name: "normal", value: "400", className: "font-normal", usage: "Texto body, descripciones" },
  { name: "medium", value: "500", className: "font-medium", usage: "Labels, navegación, badges" },
  { name: "semibold", value: "600", className: "font-semibold", usage: "Títulos de cards, H3-H4" },
  { name: "bold", value: "700", className: "font-bold", usage: "H1, H2, énfasis fuerte" },
];

export const TypographySection = () => (
  <section id="typography" className="space-y-8">
    <div>
      <h2 className="text-3xl font-semibold mb-2">1.2 Tipografía</h2>
      <p className="text-sm text-muted-foreground max-w-2xl">
        El sistema usa la familia tipográfica del sistema operativo (system-ui, sans-serif) para máximo rendimiento. 
        Toda la jerarquía se mapea a clases de Tailwind. Prohibido usar tamaños arbitrarios.
      </p>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Jerarquía semántica</h3>
      <div className="space-y-4">
        {hierarchy.map((t) => (
          <div key={t.role} className="border-b border-border pb-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-1">
              <span className="text-xs font-mono text-primary w-16 shrink-0">{t.role}</span>
              <span className="text-xs text-muted-foreground font-mono">{t.size}</span>
              <span className="text-xs text-muted-foreground">({t.pixels})</span>
            </div>
            <p className={`${t.size} mb-2`}>El veloz murciélago hindú</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>Line-height: <span className="font-mono">{t.lineHeight}</span></span>
              <span>Letter-spacing: <span className="font-mono">{t.letterSpacing}</span></span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">↳ {t.usage}</p>
          </div>
        ))}
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Pesos permitidos</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Solo se usan estos 4 pesos. Prohibido usar thin, light, extrabold o black en producción.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        {weights.map((w) => (
          <div key={w.name} className="space-y-2">
            <p className={`text-2xl ${w.className}`}>Aa</p>
            <p className="text-sm font-medium">{w.name} <span className="text-muted-foreground font-mono">({w.value})</span></p>
            <p className="text-xs text-muted-foreground">{w.usage}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
