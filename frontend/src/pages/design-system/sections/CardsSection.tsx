import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";
import { Users, TrendingUp, Clock, AlertTriangle, DollarSign, BarChart3 } from "lucide-react";

export const CardsSection = () => (
  <section id="cards" className="space-y-8">
    <div>
      <h2 className="text-3xl font-semibold mb-2">2.4 Cards</h2>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Contenedor principal de contenido. Usa <code className="font-mono text-primary">bg-card</code>, 
        <code className="font-mono text-primary"> border-border</code> y <code className="font-mono text-primary">rounded-lg</code>.
        Estructura: Header (opcional) → Content → Footer (opcional).
      </p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Card completa</CardTitle>
          <CardDescription>Con header, content y footer</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Contenido principal de la card. Puede incluir texto, formularios, listas o cualquier componente.
          </p>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" size="sm">Cancelar</Button>
          <Button size="sm">Guardar</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Card simple</CardTitle>
          <CardDescription>Solo header y content</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Para mostrar información sin acciones. Ideal para dashboards, resúmenes y vistas de lectura.
          </p>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            Card sin header ni footer — solo contenido con padding uniforme. Útil para wrappers de contenido.
          </p>
        </CardContent>
      </Card>
    </div>

    {/* DashboardMetricCard */}
    <div>
      <h3 className="text-xl font-medium mb-2 text-muted-foreground">DashboardMetricCard</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
        Componente estándar para KPIs y métricas. Incluye <strong className="text-foreground">hover obligatorio</strong> con escala y gradiente 
        basado en el prop <code className="font-mono text-primary">color</code>. El icono y el valor toman automáticamente 
        el color semántico. <strong className="text-foreground">Nunca usar divs manuales para KPI cards.</strong>
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <DashboardMetricCard label="Primary" value="24" icon={Users} subtitle="Total activas" color="primary" />
        <DashboardMetricCard label="Accent" value="$12,450" icon={DollarSign} subtitle="Facturación neta" color="accent" />
        <DashboardMetricCard label="Success" value="98%" icon={TrendingUp} subtitle="Tasa de éxito" color="success" />
        <DashboardMetricCard label="Warning" value="8" icon={Clock} subtitle="Pendientes" color="warning" />
        <DashboardMetricCard label="Destructive" value="3" icon={AlertTriangle} subtitle="Críticos" color="destructive" />
        <DashboardMetricCard label="Muted (default)" value="42" icon={BarChart3} subtitle="Sin color especial" color="muted" />
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground space-y-2">
        <p><strong className="text-foreground">Props:</strong></p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1.5 pr-4 font-medium text-foreground">Prop</th>
                <th className="text-left py-1.5 pr-4 font-medium text-foreground">Tipo</th>
                <th className="text-left py-1.5 font-medium text-foreground">Descripción</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border/50">
                <td className="py-1.5 pr-4"><code className="text-foreground">label</code></td>
                <td className="py-1.5 pr-4">string</td>
                <td className="py-1.5">Título de la métrica</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-1.5 pr-4"><code className="text-foreground">value</code></td>
                <td className="py-1.5 pr-4">string</td>
                <td className="py-1.5">Valor principal (siempre string formateado)</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-1.5 pr-4"><code className="text-foreground">icon</code></td>
                <td className="py-1.5 pr-4">LucideIcon</td>
                <td className="py-1.5">Icono del indicador</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-1.5 pr-4"><code className="text-foreground">subtitle</code></td>
                <td className="py-1.5 pr-4">string?</td>
                <td className="py-1.5">Texto secundario debajo del valor</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-4"><code className="text-foreground">color</code></td>
                <td className="py-1.5 pr-4">"primary" | "accent" | "success" | "warning" | "destructive" | "muted"</td>
                <td className="py-1.5">Color semántico. Controla hover, icono y valor. Default: "muted"</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="pt-1"><strong className="text-foreground">Hover automático:</strong> <code className="font-mono text-foreground">hover:scale-[1.03] hover:bg-gradient-to-br hover:from-[color]/15 hover:to-transparent hover:border-[color]/40</code></p>
        <p><strong className="text-foreground">Reglas:</strong></p>
        <ul className="list-disc list-inside space-y-0.5 text-xs">
          <li>Siempre usar <code className="font-mono text-foreground">DashboardMetricCard</code> para KPIs — nunca divs manuales</li>
          <li>Elegir el <code className="font-mono text-foreground">color</code> según la semántica: success para positivos, warning para pendientes, destructive para críticos</li>
          <li>El valor formateado es responsabilidad del consumidor (ej: <code className="font-mono text-foreground">fmt(amount)</code>, <code className="font-mono text-foreground">{`\${hours}h`}</code>)</li>
        </ul>
      </div>
    </div>

    {/* Glass Cards */}
    <div>
      <h3 className="text-xl font-medium mb-2 text-muted-foreground">Glass Cards</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
        Efecto glassmorphism para cards premium. Usa <code className="font-mono text-primary">.glass-card</code> para
        modales y cards destacadas, y <code className="font-mono text-primary">.glass-card-subtle</code> para paneles secundarios.
        Requiere fondo oscuro para apreciarse correctamente.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 rounded-xl bg-[hsl(240,8%,10%)] p-8">
        <div className="glass-card p-6 space-y-2">
          <p className="text-sm font-medium text-white">glass-card</p>
          <p className="text-xs text-white/60">
            Backdrop blur intenso + sombra de acento. Ideal para modales, formularios de auth y cards hero.
          </p>
        </div>
        <div className="glass-card-subtle p-6 space-y-2">
          <p className="text-sm font-medium text-white">glass-card-subtle</p>
          <p className="text-xs text-white/60">
            Blur y opacidad reducidos, sin sombra de color. Para paneles, sidebars y cards de dashboard en dark mode.
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground space-y-1">
        <p><strong className="text-foreground">glass-card:</strong> <code className="font-mono text-foreground">backdrop-blur-2xl bg-white/[0.03] border-white/[0.08] shadow accent glow</code></p>
        <p><strong className="text-foreground">glass-card-subtle:</strong> <code className="font-mono text-foreground">backdrop-blur-md bg-white/[0.02] border-white/[0.06] sin shadow</code></p>
        <p><strong className="text-foreground">Regla:</strong> Solo usar sobre fondos oscuros. En light mode usar <code className="font-mono text-foreground">Card</code> estándar.</p>
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Reglas</h3>
      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
        <li>Usar siempre el componente <code className="font-mono text-foreground">Card</code> — no crear divs con estilos manuales</li>
        <li>Header: usar <code className="font-mono text-foreground">CardTitle</code> + <code className="font-mono text-foreground">CardDescription</code></li>
        <li>Footer con acciones: Primary a la derecha, Secondary/Cancel a la izquierda</li>
        <li>No anidar Cards dentro de Cards</li>
        <li>Padding estándar: <code className="font-mono text-foreground">p-6</code> (ya incluido en los sub-componentes)</li>
        <li>KPI Cards: siempre usar <code className="font-mono text-foreground">DashboardMetricCard</code> con prop <code className="font-mono text-foreground">color</code> semántico</li>
        <li>Glass Cards: solo sobre fondos oscuros, usar <code className="font-mono text-foreground">.glass-card</code> o <code className="font-mono text-foreground">.glass-card-subtle</code></li>
      </ul>
    </div>
  </section>
);
