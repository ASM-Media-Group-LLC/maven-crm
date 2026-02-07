export const LayoutPatternsSection = () => (
  <>
    {/* 3.1 Page Layouts */}
    <section id="layouts" className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold mb-2">3.1 Page Layouts</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Patrones de página completa usados en el proyecto. Siempre usar Tailwind utilities, nunca CSS custom para layout.
        </p>
      </div>

      <div className="space-y-6">
        {/* Sidebar + Content */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-lg font-medium">Sidebar + Content</h3>
          <p className="text-sm text-muted-foreground">
            Sidebar fija con <code className="bg-muted px-1.5 py-0.5 rounded text-xs">sticky top-0</code> y área de contenido scrollable. Usado en esta misma página del Design System.
          </p>
          <div className="rounded border border-border bg-background p-3">
            <div className="flex gap-2 h-32">
              <div className="w-16 shrink-0 rounded bg-muted flex items-center justify-center">
                <span className="text-[10px] text-muted-foreground writing-vertical">Sidebar</span>
              </div>
              <div className="flex-1 rounded bg-muted/50 flex items-center justify-center">
                <span className="text-xs text-muted-foreground">Content (scrollable)</span>
              </div>
            </div>
          </div>
          <code className="block text-xs bg-muted px-3 py-2 rounded">
            flex → nav.w-60.sticky.top-0.h-screen + main.flex-1.min-w-0
          </code>
          <p className="text-xs text-muted-foreground">
            <strong>Usar:</strong> Páginas con navegación lateral (settings, docs, dashboards).
            <br />
            <strong>No usar:</strong> Páginas simples de contenido, landing pages.
          </p>
        </div>

        {/* Centrado */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-lg font-medium">Centrado con max-width</h3>
          <p className="text-sm text-muted-foreground">
            Layout por defecto para páginas de contenido. Centra el contenido con un ancho máximo para legibilidad.
          </p>
          <div className="rounded border border-border bg-background p-3">
            <div className="h-24 flex items-center justify-center">
              <div className="w-2/3 h-16 rounded bg-muted flex items-center justify-center">
                <span className="text-xs text-muted-foreground">max-w-5xl mx-auto</span>
              </div>
            </div>
          </div>
          <code className="block text-xs bg-muted px-3 py-2 rounded">
            max-w-5xl mx-auto px-6 py-12
          </code>
          <p className="text-xs text-muted-foreground">
            <strong>Usar:</strong> Páginas de contenido, formularios, artículos.
            <br />
            <strong>No usar:</strong> Dashboards que necesitan ancho completo.
          </p>
        </div>

        {/* Fullscreen */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-lg font-medium">Fullscreen sin sidebar</h3>
          <p className="text-sm text-muted-foreground">
            Página a pantalla completa centrada vertical y horizontalmente. Para login, landing, errores.
          </p>
          <div className="rounded border border-border bg-background p-3">
            <div className="h-24 flex items-center justify-center">
              <div className="w-40 h-12 rounded bg-muted flex items-center justify-center">
                <span className="text-[10px] text-muted-foreground">Centrado V+H</span>
              </div>
            </div>
          </div>
          <code className="block text-xs bg-muted px-3 py-2 rounded">
            min-h-screen flex items-center justify-center
          </code>
          <p className="text-xs text-muted-foreground">
            <strong>Usar:</strong> Login, signup, 404, páginas de error, splash screens.
            <br />
            <strong>No usar:</strong> Páginas con mucho contenido scrollable.
          </p>
        </div>
      </div>
    </section>

    {/* 3.2 Patrones de composición */}
    <section id="composition" className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold mb-2">3.2 Patrones de composición</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Patrones de estructura interna para organizar contenido dentro de las páginas.
        </p>
      </div>

      <div className="space-y-6">
        {/* Stack vertical */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-lg font-medium">Stack vertical</h3>
          <p className="text-sm text-muted-foreground">
            Bloques apilados con espaciado consistente. El patrón más común del proyecto.
          </p>
          <div className="rounded border border-border bg-background p-3">
            <div className="space-y-2">
              <div className="h-6 rounded bg-muted" />
              <div className="h-6 rounded bg-muted" />
              <div className="h-6 rounded bg-muted" />
            </div>
          </div>
          <code className="block text-xs bg-muted px-3 py-2 rounded">
            space-y-4 · space-y-6 · space-y-8
          </code>
          <p className="text-xs text-muted-foreground">
            <strong>Usar:</strong> Formularios, listas de contenido, secciones apiladas.
            <br />
            <strong>Valores comunes:</strong> <code className="bg-muted px-1 py-0.5 rounded">space-y-4</code> (elementos relacionados),
            <code className="bg-muted px-1 py-0.5 rounded"> space-y-8</code> (secciones),
            <code className="bg-muted px-1 py-0.5 rounded"> space-y-20</code> (secciones principales).
          </p>
        </div>

        {/* Grid responsive */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-lg font-medium">Grid responsive</h3>
          <p className="text-sm text-muted-foreground">
            Grid que adapta columnas según el viewport. Para galerías, cards y dashboards.
          </p>
          <div className="rounded border border-border bg-background p-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="h-10 rounded bg-muted" />
              <div className="h-10 rounded bg-muted" />
              <div className="h-10 rounded bg-muted" />
              <div className="h-10 rounded bg-muted" />
              <div className="h-10 rounded bg-muted" />
              <div className="h-10 rounded bg-muted" />
            </div>
          </div>
          <code className="block text-xs bg-muted px-3 py-2 rounded">
            grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
          </code>
          <p className="text-xs text-muted-foreground">
            <strong>Usar:</strong> Galerías de cards, dashboards, grids de datos.
            <br />
            <strong>No usar:</strong> Contenido secuencial que debe leerse en orden.
          </p>
        </div>

        {/* Flex con alineación */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-lg font-medium">Flex con alineación</h3>
          <p className="text-sm text-muted-foreground">
            Distribución horizontal con alineación. Para headers, toolbars y filas de acción.
          </p>
          <div className="rounded border border-border bg-background p-3">
            <div className="flex items-center justify-between">
              <div className="h-6 w-24 rounded bg-muted" />
              <div className="flex gap-2">
                <div className="h-6 w-12 rounded bg-muted" />
                <div className="h-6 w-12 rounded bg-muted" />
              </div>
            </div>
          </div>
          <code className="block text-xs bg-muted px-3 py-2 rounded">
            flex items-center justify-between
          </code>
          <p className="text-xs text-muted-foreground">
            <strong>Usar:</strong> Headers con título + acciones, toolbars, filas de formulario inline.
            <br />
            <strong>No usar:</strong> Contenido que debe fluir verticalmente en mobile (usar flex-col en su lugar).
          </p>
        </div>

        {/* Container con max-width */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h3 className="text-lg font-medium">Container con max-width</h3>
          <p className="text-sm text-muted-foreground">
            Reglas de anchos máximos para mantener legibilidad según el tipo de contenido.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-medium text-foreground">Clase</th>
                  <th className="text-left py-2 pr-4 font-medium text-foreground">Ancho</th>
                  <th className="text-left py-2 font-medium text-foreground">Uso</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4"><code className="bg-muted px-1.5 py-0.5 rounded">max-w-md</code></td>
                  <td className="py-2 pr-4">448px</td>
                  <td className="py-2">Formularios de login, modales pequeños</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4"><code className="bg-muted px-1.5 py-0.5 rounded">max-w-2xl</code></td>
                  <td className="py-2 pr-4">672px</td>
                  <td className="py-2">Texto largo, artículos, formularios medianos</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4"><code className="bg-muted px-1.5 py-0.5 rounded">max-w-5xl</code></td>
                  <td className="py-2 pr-4">1024px</td>
                  <td className="py-2">Páginas de contenido general (default)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4"><code className="bg-muted px-1.5 py-0.5 rounded">max-w-7xl</code></td>
                  <td className="py-2 pr-4">1280px</td>
                  <td className="py-2">Dashboards, páginas con mucha información</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Reglas */}
      <div>
        <h3 className="text-xl font-medium mb-4 text-muted-foreground">Reglas</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
          <li>Siempre usar Tailwind utilities — nunca CSS custom para layout</li>
          <li>Breakpoints del sistema: <code className="font-mono text-foreground">sm</code> (640px), <code className="font-mono text-foreground">md</code> (768px), <code className="font-mono text-foreground">lg</code> (1024px), <code className="font-mono text-foreground">xl</code> (1280px)</li>
          <li>No usar <code className="font-mono text-foreground">position: absolute/fixed</code> excepto para overlays, tooltips y elementos flotantes</li>
          <li>Usar siempre <code className="font-mono text-foreground">mx-auto</code> para centrar containers — nunca margins manuales</li>
          <li>Mobile-first: empezar con 1 columna y escalar con breakpoints</li>
        </ul>
      </div>
    </section>
  </>
);
