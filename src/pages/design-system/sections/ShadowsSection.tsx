import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const shadows = [
  { name: "minimal", value: "0 1px 3px rgba(0,0,0,0.06)", usage: "Elevación mínima: botones, badges, elementos inline." },
  { name: "card (shadow-sm)", value: "0 2px 8px rgba(0,0,0,0.08)", usage: "Cards estándar, contenedores de contenido." },
  { name: "elevated", value: "0 4px 16px rgba(0,0,0,0.1)", usage: "Elementos flotantes: dropdowns, popovers, modales." },
];

export const ShadowsSection = () => (
  <section id="shadows" className="space-y-8">
    <div>
      <h2 className="text-3xl font-semibold mb-2">1.5 Sombras</h2>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Las sombras se usan con moderación. En dark mode tienen menor impacto visual; en light mode son más evidentes.
        Para estados de focus se usa <code className="font-mono text-primary">ring</code> en lugar de sombras.
      </p>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
      {shadows.map((s) => (
        <Card key={s.name} style={{ boxShadow: s.value }}>
          <CardHeader>
            <CardTitle className="text-lg">{s.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground font-mono break-all">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.usage}</p>
          </CardContent>
        </Card>
      ))}
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Estados con ring</h3>
      <div className="flex flex-wrap gap-6">
        <div className="space-y-2">
          <div className="w-32 h-12 rounded-md bg-card border border-input ring-2 ring-ring ring-offset-2 ring-offset-background" />
          <p className="text-sm font-medium">Focus</p>
          <p className="text-xs text-muted-foreground font-mono">ring-2 ring-ring ring-offset-2</p>
        </div>
        <div className="space-y-2">
          <div className="w-32 h-12 rounded-md bg-card border border-input ring-2 ring-destructive ring-offset-2 ring-offset-background" />
          <p className="text-sm font-medium">Error</p>
          <p className="text-xs text-muted-foreground font-mono">ring-2 ring-destructive</p>
        </div>
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Reglas</h3>
      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
        <li><span className="text-foreground">✓ Permitido:</span> shadow-sm en cards, sombras elevadas en dropdowns/modales</li>
        <li><span className="text-foreground">✓ Permitido:</span> ring para focus-visible en todos los elementos interactivos</li>
        <li><span className="text-destructive">✗ Prohibido:</span> Sombras de color (ej: shadow-primary), box-shadows arbitrarias</li>
        <li><span className="text-destructive">✗ Prohibido:</span> Usar sombras como indicador de hover (usar cambio de background)</li>
      </ul>
    </div>
  </section>
);
