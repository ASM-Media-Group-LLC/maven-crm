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
        {/* Dashboard Page (Standard) — PRIMARY PATTERN */}
        <div className="rounded-lg border-2 border-primary/30 bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium">Dashboard Page (Standard)</h3>
            <span className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">PATRÓN PRINCIPAL</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Layout de pantalla completa con header fijo y contenido scrolleable. Usado en <strong className="text-foreground">todas</strong> las
            páginas operativas (HR, Finanzas, Creadores, Lead Gen, etc).
          </p>
          <div className="rounded border border-border bg-background p-3">
            <div className="flex flex-col h-48 gap-0">
              <div className="shrink-0 rounded-t bg-muted border-b border-border px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-muted-foreground/30" />
                  <span className="text-[10px] text-muted-foreground font-medium">Título (text-xl)</span>
                </div>
                <div className="flex gap-1">
                  <div className="h-5 w-14 rounded bg-primary/20 flex items-center justify-center">
                    <span className="text-[8px] text-primary">CTA</span>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-hidden p-2 space-y-1.5">
                <div className="flex gap-1">
                  <div className="h-8 flex-1 rounded bg-primary/10 flex items-center justify-center">
                    <span className="text-[8px] text-muted-foreground">KPI</span>
                  </div>
                  <div className="h-8 flex-1 rounded bg-accent/10 flex items-center justify-center">
                    <span className="text-[8px] text-muted-foreground">KPI</span>
                  </div>
                  <div className="h-8 flex-1 rounded bg-warning/10 flex items-center justify-center">
                    <span className="text-[8px] text-muted-foreground">KPI</span>
                  </div>
                </div>
                <div className="h-4 rounded bg-muted/60 flex items-center px-2">
                  <span className="text-[8px] text-muted-foreground">Tabs · Filtros</span>
                </div>
                <div className="h-16 rounded bg-muted/30 flex items-center justify-center">
                  <span className="text-[8px] text-muted-foreground">Contenido (scrollable)</span>
                </div>
              </div>
            </div>
          </div>
          <pre className="text-[11px] bg-muted px-3 py-2 rounded overflow-x-auto whitespace-pre">{`<!-- Contenedor raíz -->
<div class="flex flex-col h-full overflow-hidden">

  <!-- Header fijo -->
  <header class="shrink-0 bg-background border-b px-6 pt-6 pb-4">
    <h1 class="text-xl font-semibold">Título</h1>
  </header>

  <!-- Contenido scrolleable -->
  <div class="flex-1 overflow-auto p-6 space-y-6">
    <!-- 1. KPIs (DashboardMetricCard) -->
    <!-- 2. Tabs de navegación -->
    <!-- 3. Filtros + buscador + toggle vista -->
    <!-- 4. Tabla/Grid de datos -->
  </div>

</div>`}</pre>
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong className="text-foreground">Jerarquía:</strong> Header → KPIs → Tabs → Filtros → Contenido</p>
            <p><strong className="text-foreground">Título:</strong> <code className="font-mono text-foreground">text-xl font-semibold</code> — sin icon box junto al título</p>
            <p><strong className="text-foreground">CTA Header:</strong> <code className="font-mono text-foreground">variant="default"</code> primario, <code className="font-mono text-foreground">variant="outline"</code> secundarios</p>
            <p><strong className="text-foreground">Navegación de retorno:</strong> <code className="font-mono text-foreground">ArrowLeft</code> ghost en el header</p>
          </div>
        </div>

        {/* Wizard / Form Page */}
        <div className="rounded-lg border-2 border-accent/30 bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium">Wizard / Form Page</h3>
            <span className="text-[10px] font-medium bg-accent/10 text-accent-foreground px-2 py-0.5 rounded-full">FORMULARIOS</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Layout para formularios complejos y wizards multi-paso. Header, stepper y footer permanecen fijos 
            mientras el contenido central es scrolleable.
          </p>
          <div className="rounded border border-border bg-background p-3">
            <div className="flex flex-col h-48 gap-0">
              <div className="shrink-0 rounded-t bg-muted border-b border-border px-3 py-1.5 flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-muted-foreground/30" />
                <span className="text-[10px] text-muted-foreground">Header fijo</span>
              </div>
              <div className="shrink-0 bg-muted/50 border-b border-border px-3 py-1.5 flex items-center justify-center gap-3">
                <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-[7px] text-primary-foreground">1</span>
                </div>
                <div className="h-0.5 w-6 bg-border" />
                <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-[7px] text-primary-foreground">2</span>
                </div>
                <div className="h-0.5 w-6 bg-border" />
                <div className="h-4 w-4 rounded-full bg-muted-foreground/30 flex items-center justify-center">
                  <span className="text-[7px] text-muted-foreground">3</span>
                </div>
              </div>
              <div className="flex-1 overflow-hidden p-2 flex items-center justify-center">
                <span className="text-[9px] text-muted-foreground">Contenido scrolleable (flex-1 overflow-auto)</span>
              </div>
              <div className="shrink-0 bg-muted border-t border-border px-3 py-1.5 flex items-center justify-end gap-1">
                <div className="h-5 w-14 rounded bg-muted-foreground/20 flex items-center justify-center">
                  <span className="text-[8px] text-muted-foreground">Cancelar</span>
                </div>
                <div className="h-5 w-14 rounded bg-primary/20 flex items-center justify-center">
                  <span className="text-[8px] text-primary">Guardar</span>
                </div>
              </div>
            </div>
          </div>
          <pre className="text-[11px] bg-muted px-3 py-2 rounded overflow-x-auto whitespace-pre">{`<div class="flex flex-col h-screen overflow-hidden">

  <!-- Header fijo -->
  <header class="shrink-0 bg-background border-b px-6 py-4">
    <ArrowLeft /> Título del Wizard
  </header>

  <!-- Stepper fijo (opcional) -->
  <div class="shrink-0 border-b px-6 py-3">
    Step 1 — Step 2 — Step 3
  </div>

  <!-- Contenido scrolleable -->
  <div class="flex-1 overflow-auto p-6">
    <!-- Campos del formulario -->
  </div>

  <!-- Footer fijo -->
  <footer class="shrink-0 border-t bg-background px-6 py-4">
    <Button variant="outline">Cancelar</Button>
    <Button>Guardar</Button>
  </footer>

</div>`}</pre>
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong className="text-foreground">Clave:</strong> <code className="font-mono text-foreground">h-screen overflow-hidden</code> en raíz + <code className="font-mono text-foreground">shrink-0</code> en header/stepper/footer</p>
            <p><strong className="text-foreground">Modales:</strong> Usar <code className="font-mono text-foreground">!flex !flex-col gap-0</code> en DialogContent + <code className="font-mono text-foreground">flex-1 min-h-0 overflow-y-auto</code> para contenido</p>
          </div>
        </div>

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

        {/* Centrado — deprecated for dashboards */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4 opacity-60">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium">Centrado con max-width</h3>
            <span className="text-[10px] font-medium bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">NO USAR EN DASHBOARDS</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Solo para páginas de contenido estático (artículos, formularios simples). <strong className="text-foreground">No usar en dashboards</strong> — 
            usar el patrón "Dashboard Page" con ancho completo.
          </p>
          <code className="block text-xs bg-muted px-3 py-2 rounded">
            max-w-5xl mx-auto px-6 py-12
          </code>
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
          <li><strong className="text-foreground">Dashboards:</strong> usar <code className="font-mono text-foreground">h-full overflow-hidden</code> + <code className="font-mono text-foreground">shrink-0</code> para headers — nunca <code className="font-mono text-foreground">max-w-*</code></li>
          <li><strong className="text-foreground">Wizards:</strong> header + stepper + footer fijos con <code className="font-mono text-foreground">shrink-0</code>, contenido con <code className="font-mono text-foreground">flex-1 overflow-auto</code></li>
        </ul>
      </div>
    </section>
  </>
);
