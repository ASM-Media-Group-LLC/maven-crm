import { Check, Eye, Keyboard, MousePointer, Monitor, FileText, Type, Palette } from "lucide-react";

const a11yChecklist = [
  { label: "Focusable con Tab", description: "Todo elemento interactivo debe ser alcanzable con Tab" },
  { label: "Label accesible", description: "Usar aria-label, aria-labelledby, o texto visible" },
  { label: "Contraste WCAG AA", description: "4.5:1 para texto normal, 3:1 para texto grande" },
  { label: "Responsivo", description: "Funcional en viewports de 320px a 1920px" },
  { label: "Navegación por teclado", description: "Enter para activar, Escape para cerrar, flechas para navegar" },
  { label: "Focus visible", description: "Anillo de focus visible con focus-visible:ring-2" },
  { label: "Sin dependencia de color", description: "La información no debe depender solo del color" },
  { label: "Orden de lectura", description: "El DOM refleja el orden visual de lectura" },
];

const namingRules = [
  { pattern: "PascalCase", usage: "Componentes", example: "UserCard, LoginForm" },
  { pattern: "kebab-case", usage: "Archivos", example: "user-card.tsx, login-form.tsx" },
  { pattern: "camelCase", usage: "Props y variables", example: "userName, isLoading" },
  { pattern: "UPPER_SNAKE", usage: "Constantes", example: "MAX_RETRIES, API_URL" },
];

export const DocumentationSection = () => (
  <section id="documentation" className="space-y-8">
    <div>
      <h2 className="text-3xl font-bold tracking-tight">5.1 Documentación y Accesibilidad</h2>
      <p className="text-muted-foreground mt-1">
        Guía de buenas prácticas de accesibilidad y reglas para documentar nuevos componentes.
      </p>
    </div>

    {/* Accesibilidad */}
    <div className="space-y-4">
      <h3 className="text-xl font-semibold flex items-center gap-2">
        <Eye className="h-5 w-5 text-primary" aria-hidden="true" />
        Accesibilidad (a11y)
      </h3>

      {/* Contraste */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Palette className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Contraste mínimo
        </h4>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>Los tokens del sistema están diseñados para cumplir WCAG AA:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <div className="rounded border border-border p-3">
              <p className="font-medium text-foreground">4.5:1</p>
              <p className="text-xs text-muted-foreground">Texto normal (&lt; 18px)</p>
            </div>
            <div className="rounded border border-border p-3">
              <p className="font-medium text-foreground">3:1</p>
              <p className="text-xs text-muted-foreground">Texto grande (≥ 18px bold / ≥ 24px)</p>
            </div>
          </div>
          <p className="text-xs mt-2">
            Nunca usar <code className="bg-muted px-1 py-0.5 rounded">text-muted-foreground</code> sobre fondos que reduzcan el contraste por debajo de estos umbrales.
          </p>
        </div>
      </div>

      {/* Navegación por teclado */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Navegación por teclado
        </h4>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>Todos los componentes interactivos deben ser navegables:</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-medium text-foreground">Tecla</th>
                  <th className="text-left py-2 font-medium text-foreground">Acción</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4"><code className="bg-muted px-1.5 py-0.5 rounded">Tab</code></td>
                  <td className="py-2">Mover focus al siguiente elemento interactivo</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4"><code className="bg-muted px-1.5 py-0.5 rounded">Shift+Tab</code></td>
                  <td className="py-2">Mover focus al elemento anterior</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4"><code className="bg-muted px-1.5 py-0.5 rounded">Enter</code></td>
                  <td className="py-2">Activar el elemento con focus (botón, enlace)</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4"><code className="bg-muted px-1.5 py-0.5 rounded">Space</code></td>
                  <td className="py-2">Toggle de checkbox/switch, activar botón</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4"><code className="bg-muted px-1.5 py-0.5 rounded">Escape</code></td>
                  <td className="py-2">Cerrar modal, popover, dropdown</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4"><code className="bg-muted px-1.5 py-0.5 rounded">↑ ↓</code></td>
                  <td className="py-2">Navegar entre opciones en select/dropdown</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs">
            Los componentes Radix/shadcn ya implementan estos patrones. No sobreescribir con handlers custom.
          </p>
        </div>
      </div>

      {/* Focus visible */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <MousePointer className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Focus visible
        </h4>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>Patrón estándar para indicador de focus:</p>
          <code className="block bg-muted px-3 py-2 rounded text-xs">
            focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
          </code>
          <p className="text-xs">
            Usar <code className="bg-muted px-1 py-0.5 rounded">focus-visible</code> (no <code className="bg-muted px-1 py-0.5 rounded">focus</code>) para que solo aparezca con navegación por teclado.
          </p>
        </div>
      </div>

      {/* ARIA */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Monitor className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ARIA labels
        </h4>
        <div className="text-sm text-muted-foreground space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-medium text-foreground">Atributo</th>
                  <th className="text-left py-2 font-medium text-foreground">Cuándo usar</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4"><code className="bg-muted px-1.5 py-0.5 rounded">aria-label</code></td>
                  <td className="py-2">Botón con solo icono, sin texto visible</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4"><code className="bg-muted px-1.5 py-0.5 rounded">aria-describedby</code></td>
                  <td className="py-2">Input con texto de ayuda o error asociado</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4"><code className="bg-muted px-1.5 py-0.5 rounded">aria-hidden="true"</code></td>
                  <td className="py-2">Iconos decorativos que no aportan información</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4"><code className="bg-muted px-1.5 py-0.5 rounded">sr-only</code></td>
                  <td className="py-2">Texto solo para lectores de pantalla (visualmente oculto)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    {/* Reglas de documentación */}
    <div className="space-y-4">
      <h3 className="text-xl font-semibold flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
        Reglas de documentación
      </h3>

      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">Todo componente nuevo debe documentarse antes de usarse en producción.</p>
          <p>Estructura requerida para cada componente documentado:</p>
          <ol className="list-decimal ml-5 space-y-1 text-xs">
            <li>Nombre del componente y descripción breve</li>
            <li>Variantes disponibles (con ejemplo visual)</li>
            <li>Props aceptadas (tipo, default, descripción)</li>
            <li>Estados (default, hover, focus, disabled, loading, error)</li>
            <li>Reglas de uso (cuándo sí, cuándo no)</li>
            <li>Ejemplo de código mínimo</li>
          </ol>
        </div>
      </div>

      {/* Naming conventions */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Type className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Convenciones de naming
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-medium text-foreground">Patrón</th>
                <th className="text-left py-2 pr-4 font-medium text-foreground">Uso</th>
                <th className="text-left py-2 font-medium text-foreground">Ejemplo</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {namingRules.map((rule) => (
                <tr key={rule.pattern} className="border-b border-border/50">
                  <td className="py-2 pr-4"><code className="bg-muted px-1.5 py-0.5 rounded">{rule.pattern}</code></td>
                  <td className="py-2 pr-4">{rule.usage}</td>
                  <td className="py-2"><code className="bg-muted px-1.5 py-0.5 rounded">{rule.example}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Token rules */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-2 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Reglas de tokens</p>
        <div className="flex items-start gap-2">
          <Check className="h-4 w-4 text-[hsl(var(--success))] mt-0.5 shrink-0" aria-hidden="true" />
          <span>Usar siempre variables CSS del design system — nunca hardcodear colores hex/rgb</span>
        </div>
        <div className="flex items-start gap-2">
          <Check className="h-4 w-4 text-[hsl(var(--success))] mt-0.5 shrink-0" aria-hidden="true" />
          <span>Usar clases semánticas de Tailwind (<code className="bg-muted px-1 py-0.5 rounded text-xs">bg-primary</code>, <code className="bg-muted px-1 py-0.5 rounded text-xs">text-muted-foreground</code>)</span>
        </div>
        <div className="flex items-start gap-2">
          <Check className="h-4 w-4 text-[hsl(var(--success))] mt-0.5 shrink-0" aria-hidden="true" />
          <span>Documentar cualquier token nuevo en <code className="bg-muted px-1 py-0.5 rounded text-xs">index.css</code> y <code className="bg-muted px-1 py-0.5 rounded text-xs">tailwind.config.ts</code></span>
        </div>
      </div>
    </div>

    {/* Checklist de accesibilidad */}
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Checklist de accesibilidad</h3>
      <p className="text-sm text-muted-foreground">
        Verificar antes de considerar un componente listo para producción:
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {a11yChecklist.map((item) => (
          <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-start gap-3">
            <div className="h-5 w-5 rounded border-2 border-muted-foreground/30 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="h-3 w-3 text-muted-foreground/30" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);
