// Documenta dos componentes chicos pero omnipresentes del reskin:
// StatChip (components/StatChip.tsx) y EmptyState (components/EmptyState.tsx).
// Los ejemplos usan los componentes reales.
import StatChip from "@/components/StatChip";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Inbox, Users } from "lucide-react";

export const StatChipEmptyStateSection = () => (
  <section id="statchip-emptystate" className="space-y-8">
    <div>
      <h2 className="text-3xl font-bold tracking-tight">2.8 StatChip y EmptyState</h2>
      <p className="text-muted-foreground mt-1">
        Estadística compacta y estado vacío estándar. Nunca armar estos patrones con divs manuales.
      </p>
    </div>

    {/* StatChip */}
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">StatChip</h3>
      <p className="text-sm text-muted-foreground">
        <code className="bg-muted px-1 py-0.5 rounded text-xs">components/StatChip.tsx</code> — la misma información
        que una KpiCard grande en mucho menos espacio. Pensado para grillas tipo{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-xs">grid-cols-2 sm:grid-cols-3 lg:grid-cols-6</code>.
        Props: <code className="bg-muted px-1 py-0.5 rounded text-xs">label</code> ·{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-xs">value</code> ·{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-xs">hint</code> ·{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-xs">color</code> (clase del puntito, ej.{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-xs">bg-success</code>) ·{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-xs">icon</code> ·{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-xs">onClick</code> (lo vuelve botón).
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatChip label="Creadoras" value={63} hint="59 activas" color="bg-primary" />
        <StatChip label="Promos hoy" value={41} hint="+12%" color="bg-success" />
        <StatChip label="Pendientes" value={8} color="bg-warning" icon={<Users className="h-3.5 w-3.5" />} />
        <StatChip label="Clickeable" value="→" hint="con onClick" onClick={() => {}} />
      </div>
    </div>

    {/* EmptyState */}
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">EmptyState</h3>
      <p className="text-sm text-muted-foreground">
        <code className="bg-muted px-1 py-0.5 rounded text-xs">components/EmptyState.tsx</code> — el "no hay X"
        estándar: columna centrada con muñequito DiceBear (por{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-xs">seed</code> fijo por pantalla → mismo muñequito
        siempre) o un <code className="bg-muted px-1 py-0.5 rounded text-xs">icon</code> propio. Props:{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-xs">title</code> ·{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-xs">description</code> ·{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-xs">icon</code> ·{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-xs">seed</code> ·{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-xs">action</code>. En modales o popovers compactos usar{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-xs">icon</code> (sin muñequito) para no agigantar el modal.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            seed="ds-empty-demo"
            title="No hay resultados"
            description="Variante con muñequito (seed fijo por pantalla) y acción opcional."
            action={<Button size="sm" variant="outline">Crear el primero</Button>}
          />
        </div>
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={<Inbox className="h-8 w-8 text-muted-foreground" />}
            title="Bandeja vacía"
            description="Variante con icono — la indicada para modales y popovers compactos."
          />
        </div>
      </div>
    </div>
  </section>
);
