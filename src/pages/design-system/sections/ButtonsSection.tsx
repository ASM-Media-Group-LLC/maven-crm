import { Button } from "@/components/ui/button";
import { Loader2, Trash2, ExternalLink } from "lucide-react";

const variants = [
  { name: "default (Primary)", variant: "default" as const, usage: "Acción principal de la sección. Solo un botón primary por grupo." },
  { name: "secondary", variant: "secondary" as const, usage: "Acciones secundarias. Cancelar, cerrar, acciones complementarias." },
  { name: "destructive", variant: "destructive" as const, usage: "Acciones destructivas: eliminar, revocar, desconectar." },
  { name: "outline", variant: "outline" as const, usage: "Acciones neutras, filtros, acciones terciarias." },
  { name: "ghost", variant: "ghost" as const, usage: "Acciones sutiles: iconos de toolbar, acciones inline en listas." },
  { name: "link", variant: "link" as const, usage: "Navegación inline, enlaces semánticos dentro de texto." },
];

export const ButtonsSection = () => (
  <section id="buttons" className="space-y-8">
    <div>
      <h2 className="text-3xl font-semibold mb-2">2.1 Botones</h2>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Componente <code className="font-mono text-primary">Button</code> con 6 variantes y 4 tamaños.
        Siempre usar la variante semántica correcta — no estilizar con clases manuales.
      </p>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Variantes</h3>
      <div className="space-y-4">
        {variants.map((v) => (
          <div key={v.name} className="flex flex-wrap items-center gap-4 border-b border-border pb-4">
            <Button variant={v.variant} className="min-w-[140px]">{v.name}</Button>
            <p className="text-sm text-muted-foreground flex-1">{v.usage}</p>
          </div>
        ))}
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Tamaños</h3>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1 text-center">
          <Button size="sm">Small</Button>
          <p className="text-xs text-muted-foreground font-mono">sm</p>
        </div>
        <div className="space-y-1 text-center">
          <Button size="default">Default</Button>
          <p className="text-xs text-muted-foreground font-mono">default</p>
        </div>
        <div className="space-y-1 text-center">
          <Button size="lg">Large</Button>
          <p className="text-xs text-muted-foreground font-mono">lg</p>
        </div>
        <div className="space-y-1 text-center">
          <Button size="icon"><ExternalLink /></Button>
          <p className="text-xs text-muted-foreground font-mono">icon</p>
        </div>
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Estados especiales</h3>
      <div className="flex flex-wrap gap-4">
        <div className="space-y-1">
          <Button disabled>Disabled</Button>
          <p className="text-xs text-muted-foreground">disabled</p>
        </div>
        <div className="space-y-1">
          <Button disabled><Loader2 className="animate-spin" /> Cargando...</Button>
          <p className="text-xs text-muted-foreground">loading</p>
        </div>
        <div className="space-y-1">
          <Button variant="destructive"><Trash2 /> Eliminar</Button>
          <p className="text-xs text-muted-foreground">con icono</p>
        </div>
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Uso contextual</h3>
      <div className="space-y-3">
        {[
          { context: "Acción principal del header de página", variant: "outline", example: "Crear Evento, Agregar Creador, Nuevo Ticket" },
          { context: "Toggle activo (list/grid, tabs)", variant: "secondary", example: "Icono List seleccionado" },
          { context: "Toggle inactivo", variant: "ghost", example: "Icono Grid no seleccionado" },
          { context: "Acción principal dentro de modal/form", variant: "default", example: "Guardar, Crear" },
          { context: "Acciones destructivas", variant: "destructive", example: "Eliminar" },
          { context: "Acciones secundarias en modales", variant: "outline", example: "Cancelar" },
        ].map((rule) => (
          <div key={rule.context} className="flex flex-wrap items-center gap-4 border-b border-border pb-3">
            <code className="font-mono text-xs text-primary bg-muted px-2 py-1 rounded min-w-[100px]">{rule.variant}</code>
            <p className="text-sm font-medium flex-1 min-w-[200px]">{rule.context}</p>
            <p className="text-sm text-muted-foreground">{rule.example}</p>
          </div>
        ))}
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Reglas</h3>
      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
        <li>Máximo un botón <code className="font-mono text-foreground">default</code> (primary) por sección/grupo de acciones</li>
        <li>Siempre usar la variante semántica — <code className="font-mono text-destructive">✗ className="bg-red-500"</code></li>
        <li>Para loading: deshabilitar + icono <code className="font-mono text-foreground">Loader2</code> con <code className="font-mono text-foreground">animate-spin</code></li>
        <li>Botones con icono solo: usar <code className="font-mono text-foreground">size="icon"</code>, no padding manual</li>
        <li>Header de página: siempre <code className="font-mono text-foreground">variant="outline"</code>, nunca <code className="font-mono text-foreground">default</code></li>
        <li>Toggles (list/grid): activo = <code className="font-mono text-foreground">secondary</code>, inactivo = <code className="font-mono text-foreground">ghost</code></li>
      </ul>
    </div>
  </section>
);
