const spacingRanges = [
  {
    name: "xs",
    range: "0.5–1 (2–4px)",
    usage: "Padding interno de badges, gap entre iconos y texto, separación mínima entre elementos inline.",
    items: [
      { token: "0.5", px: "2px" },
      { token: "1", px: "4px" },
    ],
  },
  {
    name: "sm",
    range: "1.5–2.5 (6–10px)",
    usage: "Padding de botones small, gap en grupos de badges, separación entre items de lista compacta.",
    items: [
      { token: "1.5", px: "6px" },
      { token: "2", px: "8px" },
      { token: "2.5", px: "10px" },
    ],
  },
  {
    name: "md",
    range: "3–5 (12–20px)",
    usage: "Padding estándar de componentes (inputs, cards), gap en grids, margen entre secciones menores.",
    items: [
      { token: "3", px: "12px" },
      { token: "4", px: "16px" },
      { token: "5", px: "20px" },
    ],
  },
  {
    name: "lg",
    range: "6–8 (24–32px)",
    usage: "Padding de cards y modales, separación entre grupos de contenido, margen lateral de contenedores.",
    items: [
      { token: "6", px: "24px" },
      { token: "8", px: "32px" },
    ],
  },
  {
    name: "xl",
    range: "10–16 (40–64px)",
    usage: "Separación entre secciones principales, padding de página, espacio vertical entre bloques de contenido.",
    items: [
      { token: "10", px: "40px" },
      { token: "12", px: "48px" },
      { token: "16", px: "64px" },
    ],
  },
];

export const SpacingSection = () => (
  <section id="spacing" className="space-y-8">
    <div>
      <h2 className="text-3xl font-semibold mb-2">1.3 Espaciado</h2>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Escala de espaciado basada en múltiplos de 4px. Todos los valores son tokens de Tailwind.
        <span className="text-destructive font-medium"> Prohibido usar valores arbitrarios fuera de esta escala</span> (ej: p-[13px]).
      </p>
    </div>

    {spacingRanges.map((range) => (
      <div key={range.name}>
        <h3 className="text-xl font-medium mb-1 text-muted-foreground">
          {range.name.toUpperCase()} — {range.range}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">{range.usage}</p>
        <div className="space-y-2">
          {range.items.map((s) => (
            <div key={s.token} className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground font-mono w-10 text-right shrink-0">
                {s.token}
              </span>
              <span className="text-xs text-muted-foreground w-12 shrink-0">{s.px}</span>
              <div
                className="h-3 rounded-sm bg-primary"
                style={{ width: s.px }}
              />
            </div>
          ))}
        </div>
      </div>
    ))}
  </section>
);
