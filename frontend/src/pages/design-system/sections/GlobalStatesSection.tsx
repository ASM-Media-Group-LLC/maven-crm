import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const states = [
  {
    name: "Hover",
    pattern: "hover:bg-{color}/90 (botones sólidos) · hover:bg-accent (menús) · hover:bg-secondary/80 (secondary)",
    code: "hover:bg-primary/90",
    desc: "Feedback visual inmediato al pasar el cursor. Siempre cambiar background, nunca usar sombra.",
  },
  {
    name: "Focus",
    pattern: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    code: "focus-visible:ring-2 ring-ring ring-offset-2",
    desc: "Indicador de accesibilidad para navegación por teclado. Usar ring, nunca outline o border.",
  },
  {
    name: "Disabled",
    pattern: "disabled:pointer-events-none disabled:opacity-50",
    code: "disabled:pointer-events-none disabled:opacity-50",
    desc: "Elemento no interactivo. Siempre combinar ambas propiedades. Aplicar a botones, inputs, selects.",
  },
  {
    name: "Active",
    pattern: "data-[state=active]:bg-background · data-[state=selected]:bg-accent",
    code: "data-[state=active]:bg-background",
    desc: "Estado activo/seleccionado en tabs, toggles y radio groups. Usar data-attributes de Radix.",
  },
];

export const GlobalStatesSection = () => (
  <section id="global-states" className="space-y-8">
    <div>
      <h2 className="text-3xl font-semibold mb-2">1.7 Estados globales</h2>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Patrones de estado consistentes que se aplican en todos los componentes interactivos del sistema.
        Estos patrones ya están implementados en los componentes base — no modificar.
      </p>
    </div>

    <div className="space-y-6">
      {states.map((s) => (
        <div key={s.name} className="border border-border rounded-lg p-4 space-y-2">
          <h3 className="text-lg font-medium">{s.name}</h3>
          <p className="text-sm text-muted-foreground">{s.desc}</p>
          <p className="text-xs font-mono text-primary bg-muted px-3 py-2 rounded-md">{s.pattern}</p>
        </div>
      ))}
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Loading (Skeleton)</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Usar el componente <code className="font-mono text-primary">Skeleton</code> con <code className="font-mono text-primary">animate-pulse</code> para
        estados de carga. Replicar la estructura visual del contenido final.
      </p>
      <div className="flex items-center gap-4 p-4 border border-border rounded-lg">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Ejemplo interactivo</h3>
      <div className="flex flex-wrap gap-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Normal</p>
          <Button>Hover me</Button>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Disabled</p>
          <Button disabled>Disabled</Button>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Focus (Tab)</p>
          <Input placeholder="Focus con Tab" className="w-48" />
        </div>
      </div>
    </div>

    {/* Card Hover Animations */}
    <div>
      <h3 className="text-xl font-medium mb-2 text-muted-foreground">Card Hover Animations</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
        Patrones de hover para cards de contenido y KPI. Elevan la card sin usar sombra, combinando translate y transiciones de borde/gradiente.
      </p>
      <div className="space-y-4">
        <div className="border border-border rounded-lg p-4 space-y-2">
          <h4 className="text-sm font-medium">Elevación + borde</h4>
          <p className="text-xs text-muted-foreground">Cards de contenido (gráficos, tablas, feeds). Translate-y con cambio de borde.</p>
          <p className="text-xs font-mono text-primary bg-muted px-3 py-2 rounded-md">transition-all duration-300 hover:border-primary/30</p>
        </div>
        <div className="border border-border rounded-lg p-4 space-y-2">
          <h4 className="text-sm font-medium">Elevación + gradiente temático</h4>
          <p className="text-xs text-muted-foreground">Cards operacionales con borde superior de color. Gradiente del color asociado.</p>
          <p className="text-xs font-mono text-primary bg-muted px-3 py-2 rounded-md">transition-all duration-300 hover:bg-gradient-to-b hover:from-[color]/5 hover:to-transparent</p>
        </div>
        <div className="border border-border rounded-lg p-4 space-y-2">
          <h4 className="text-sm font-medium">Scale + gradiente (KPI)</h4>
          <p className="text-xs text-muted-foreground">KPI cards con hover de escala y gradiente radial del color asociado.</p>
          <p className="text-xs font-mono text-primary bg-muted px-3 py-2 rounded-md"> hover:bg-gradient-to-br hover:from-[color]/15 hover:to-transparent hover:border-[color]/40</p>
        </div>
      </div>
    </div>

    {/* Auth Animations Reference */}
    <div>
      <h3 className="text-xl font-medium mb-2 text-muted-foreground">Animaciones de fondo (Auth)</h3>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Las pantallas de autenticación usan animaciones <code className="font-mono text-primary">blob-move-*</code> y{" "}
        <code className="font-mono text-primary">wave-drift-*</code> definidas en <code className="font-mono text-primary">index.css</code>.
        No reutilizar fuera del contexto de auth sin aprobación de diseño.
      </p>
    </div>
  </section>
);
