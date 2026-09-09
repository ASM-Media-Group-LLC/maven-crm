// Tipografía del rediseño (09/2026): dos familias y una escala. Sora (font-display)
// en títulos y cifras, la sans del sistema en el cuerpo. La escala anterior
// (H1 text-5xl, seis tamaños de título en las pantallas) queda retirada.
const hierarchy = [
  { role: "Título de página", size: "font-display text-2xl font-bold tracking-tight", pixels: "24px", usage: "Uno por pantalla, siempre vía <PageHeader>." },
  { role: "Título grande", size: "font-display text-3xl font-bold tracking-tight", pixels: "30px", usage: "Saludo del Dashboard y cifras protagonistas. Con moderación." },
  { role: "Cifra", size: "font-display text-2xl font-bold tabular-nums", pixels: "24px", usage: "KPI en StatChip: Sora con dígitos tabulares." },
  { role: "Sección", size: "font-display text-xl font-semibold", pixels: "20px", usage: "Títulos de sección y de panel." },
  { role: "Cuerpo", size: "text-base", pixels: "16px", usage: "Texto general, párrafos, formularios." },
  { role: "Cuerpo compacto", size: "text-sm", pixels: "14px", usage: "Filas, descripciones, subtítulos." },
  { role: "Etiqueta", size: "text-xs text-muted-foreground", pixels: "12px", usage: "En oración, sin mayúsculas ni tracking: «Ventas hoy», no «VENTAS HOY»." },
  { role: "Código", size: "font-mono text-xs tabular-nums", pixels: "12px", usage: "Solo lo que es código: claves de sala, IDs, horas en columna." },
];

const weights = [
  { name: "normal", value: "400", className: "font-normal", usage: "Cuerpo, descripciones" },
  { name: "medium", value: "500", className: "font-medium", usage: "Labels de formulario, navegación, chips" },
  { name: "semibold", value: "600", className: "font-semibold", usage: "Títulos de sección, nombres en filas" },
  { name: "bold", value: "700", className: "font-bold", usage: "Títulos de página y cifras (Sora)" },
];

const retirados = [
  { que: "La ceja", como: "text-[10px] uppercase tracking-wider", porque: "422 usos en pantallas anteriores. Es el tic más visible de «panel de administración genérico»; la etiqueta va en oración." },
  { que: "Mono decorativa", como: "font-mono en etiquetas y metadatos", porque: "301 usos. La monoespaciada queda solo para códigos, IDs y horas en columna." },
  { que: "Títulos a mano", como: "text-lg / text-xl / text-3xl font-semibold en el h1", porque: "92 pantallas con seis tamaños distintos. El título lo pone <PageHeader>." },
];

export const TypographySection = () => (
  <section id="typography" className="space-y-8">
    <div>
      <h2 className="text-3xl font-semibold mb-2">1.2 Tipografía</h2>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Dos familias. <span className="font-display font-semibold text-foreground">Sora</span> (<code className="font-mono text-primary">font-display</code>)
        en títulos y cifras; la sans del sistema operativo en todo el cuerpo. Una sola escala de seis pasos mapeada a
        clases de Tailwind. Prohibido usar tamaños arbitrarios o una tercera familia.
      </p>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Escala</h3>
      <div className="space-y-4">
        {hierarchy.map((t) => (
          <div key={t.role} className="border-b border-border pb-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-1">
              <span className="text-xs text-primary w-32 shrink-0">{t.role}</span>
              <span className="text-xs text-muted-foreground font-mono">{t.size}</span>
              <span className="text-xs text-muted-foreground">({t.pixels})</span>
            </div>
            <p className={`${t.size} mb-2`}>{t.role === "Cifra" ? "1.284\u00a0\u00a0\u00a012 / 14\u00a0\u00a0\u00a0$41.2k" : t.role === "Código" ? "T2GEGG 09:03 8KLM2P" : "El veloz murciélago hindú"}</p>
            <p className="text-xs text-muted-foreground mt-1">{t.usage}</p>
          </div>
        ))}
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Pesos</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Solo estos cuatro. Sora carga 600, 700 y 800; el 800 se reserva para la portada.
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

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Retirado</h3>
      <div className="grid gap-3 md:grid-cols-3">
        {retirados.map((r) => (
          <div key={r.que} className="rounded-panel border border-border bg-card p-4 space-y-1.5">
            <p className="text-sm font-semibold">{r.que}</p>
            <p className="font-mono text-xs text-destructive line-through">{r.como}</p>
            <p className="text-xs text-muted-foreground">{r.porque}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
