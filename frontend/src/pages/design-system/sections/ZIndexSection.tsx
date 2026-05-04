const layers = [
  { name: "Base content", value: "auto / 0", className: "z-0", desc: "Contenido normal de la página. No requiere z-index explícito." },
  { name: "Sticky elements", value: "10", className: "z-10", desc: "Headers sticky, barras de navegación fijas dentro del scroll." },
  { name: "Dropdown / Select / Popover", value: "50", className: "z-50", desc: "Menús desplegables, selectores, popovers. Componentes Radix." },
  { name: "Dialog overlay", value: "50", className: "z-50", desc: "Overlay y contenido de modales/diálogos. Se apilan sobre dropdowns." },
  { name: "Toast viewport", value: "100", className: "z-[100]", desc: "Notificaciones toast. Siempre visibles sobre todo el contenido." },
];

export const ZIndexSection = () => (
  <section id="z-index" className="space-y-8">
    <div>
      <h2 className="text-3xl font-semibold mb-2">1.6 Z-Index</h2>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Escala de z-index extraída de los componentes Radix/shadcn del proyecto.
        <span className="text-destructive font-medium"> Prohibido usar valores arbitrarios fuera de esta escala.</span>
      </p>
    </div>

    <div className="space-y-1">
      {layers.map((layer, i) => (
        <div
          key={layer.name}
          className="flex items-start gap-4 p-4 rounded-lg border border-border"
          style={{ marginLeft: `${i * 16}px` }}
        >
          <div className="shrink-0 w-20">
            <span className="font-mono text-sm text-primary">{layer.className}</span>
          </div>
          <div>
            <p className="text-sm font-medium">{layer.name}</p>
            <p className="text-xs text-muted-foreground">{layer.desc}</p>
          </div>
        </div>
      ))}
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Reglas</h3>
      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
        <li>Nunca usar <code className="font-mono text-destructive">z-[999]</code> o valores arbitrarios altos</li>
        <li>Si un nuevo componente necesita un z-index, debe documentarse aquí primero</li>
        <li>Los componentes Radix ya manejan su z-index internamente — no sobreescribir</li>
        <li>El contexto de apilamiento (<code className="font-mono">stacking context</code>) se crea con <code className="font-mono">relative</code> o <code className="font-mono">isolate</code></li>
      </ul>
    </div>
  </section>
);
