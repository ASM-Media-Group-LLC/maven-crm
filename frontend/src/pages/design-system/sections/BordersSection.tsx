const radii = [
  { name: "none", className: "rounded-none", value: "0", usage: "Elementos sin redondeo. Uso excepcional." },
  { name: "sm", className: "rounded-sm", value: "calc(var(--radius) - 4px)", usage: "Inputs, badges, elementos compactos." },
  { name: "md", className: "rounded-md", value: "calc(var(--radius) - 2px)", usage: "Botones, selects, dropdowns." },
  { name: "lg", className: "rounded-lg", value: "var(--radius)", usage: "Cards, modales, contenedores principales." },
  { name: "xl", className: "rounded-xl", value: "0.75rem", usage: "Cards destacadas, elementos hero." },
  { name: "2xl", className: "rounded-2xl", value: "1rem", usage: "Contenedores grandes, secciones." },
  { name: "full", className: "rounded-full", value: "9999px", usage: "Avatares, badges circulares, indicadores." },
];

export const BordersSection = () => (
  <section id="borders" className="space-y-8">
    <div>
      <h2 className="text-3xl font-semibold mb-2">1.4 Bordes y Radius</h2>
      <p className="text-sm text-muted-foreground max-w-2xl">
        El radius base se define con el token <code className="font-mono text-primary">--radius: 0.5rem</code>. 
        Todos los demás valores se calculan a partir de este.
        <span className="text-destructive font-medium"> Prohibido mezclar distintos radios sin justificación.</span>
      </p>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Escala de radius</h3>
      <div className="flex flex-wrap gap-8">
        {radii.map((r) => (
          <div key={r.name} className="flex flex-col items-center gap-2 max-w-[120px]">
            <div className={`w-20 h-20 bg-primary ${r.className}`} />
            <p className="text-sm font-medium">{r.name}</p>
            <p className="text-xs text-muted-foreground font-mono text-center">{r.className}</p>
            <p className="text-xs text-muted-foreground text-center">{r.usage}</p>
          </div>
        ))}
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Reglas</h3>
      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
        <li>Borde por defecto: <code className="font-mono text-foreground">border border-border</code></li>
        <li>Borde de inputs: <code className="font-mono text-foreground">border border-input</code></li>
        <li>Un componente debe mantener un radio consistente — no mezclar <code className="font-mono">rounded-sm</code> con <code className="font-mono">rounded-lg</code> sin motivo</li>
        <li>Los hijos nunca deben tener un radio mayor que el padre</li>
      </ul>
    </div>
  </section>
);
