import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import DataTableShell from "@/components/ui/data-table-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info, ArrowUpDown, MoreHorizontal } from "lucide-react";
import OutcomeBadge from "@/components/agency-qa/OutcomeBadge";

const solidBadges = ["default", "secondary", "destructive", "success", "warning", "info"] as const;
const softBadges = ["primary-soft", "secondary-soft", "destructive-soft", "success-soft", "warning-soft"] as const;

const tableData = [
  { id: "INV-001", nombre: "Plan Pro", estado: "success", monto: "$29.00" },
  { id: "INV-002", nombre: "Plan Business", estado: "warning", monto: "$99.00" },
  { id: "INV-003", nombre: "Add-on Storage", estado: "destructive", monto: "$9.00" },
];

const STICKY_HEADER_CLASS = "sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]";
const STICKY_ACTION_CLASS = "sticky right-0 z-10 bg-card";
const STICKY_ACTION_HEADER_CLASS = "sticky top-0 right-0 z-30 bg-card shadow-[0_1px_0_0_hsl(var(--border))]";

const standardColumns = [
  { name: "Creación", desc: "Fecha dd/MM/yyyy, ordenable" },
  { name: "Handle / Instagram", desc: "Con icono + link externo" },
  { name: "Agente / Creado por", desc: "Nombre del usuario responsable" },
  { name: "Estado", desc: "Solo si la tabla es de gestión (pipeline)" },
  { name: "Categoría", desc: "Badge soft: A+, A, B+, B, C" },
  { name: "Contacto", desc: "Teléfono + link WhatsApp" },
  { name: "Acciones", desc: "Sticky right, DropdownMenu con 3-dot trigger" },
];

const allMockRows = Array.from({ length: 24 }, (_, i) => ({
  date: `${String(24 - i).padStart(2, "0")}/03/2026`,
  ig: `@creadora_${i + 1}`,
  agent: ["María G.", "Carlos R.", "Ana L.", "Luis M.", "Sara P.", "Pedro J."][i % 6],
  status: ["Nuevo", "Asignada", "Confirmada", "Nuevo", "Asignada", "Completada"][i % 6],
  cat: (["A+", "A", "B+", "B", "C"] as const)[i % 5],
  phone: ["+52 55 1234", "+57 300 5678", "+34 612 9012", "—", "+1 305 3456", "+52 55 7890"][i % 6],
  email: [`ejemplo${i + 1}@mail.com`],
  platform: ["OnlyFans", "Fansly", "OnlyFans", "Fansly"][i % 4],
  notes: ["Contacto vía DM", "Pendiente llamada", "—", "Revisar perfil", "Interesada en plan", "Referida por agencia", "Seguimiento semanal", "Primera interacción"][i % 8],
}));

export const DataDisplaySection = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const totalCount = allMockRows.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const rows = useMemo(() => allMockRows.slice((page - 1) * pageSize, page * pageSize), [page, pageSize]);

  return (
  <section id="data-display" className="space-y-8">
    <div>
      <h2 className="text-3xl font-semibold mb-2">2.7 Data Display</h2>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Componentes para mostrar datos estructurados y metadatos.
      </p>
    </div>

    {/* ── Data Table Standard ── */}
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-medium mb-2 text-muted-foreground">
          Data Table Standard
        </h3>
        <p className="text-sm text-muted-foreground max-w-2xl mb-4">
          Patrón canónico para todas las tablas de alto volumen en la plataforma.
          Referencia: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">ContactosTable.tsx</code>
        </p>
      </div>

      {/* Layout diagram */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-muted/50 px-4 py-2 border-b border-border">
          <span className="text-xs font-mono text-muted-foreground">Layout Structure</span>
        </div>
        <div className="p-4 space-y-2 font-mono text-xs">
          <div className="rounded border border-dashed border-border p-3 space-y-2">
            <p className="text-muted-foreground">{"<DataTableShell className=\"flex-1 min-h-0\">"}</p>
            <div className="ml-4 space-y-1.5">
              <div className="rounded bg-primary/10 px-3 py-1.5 text-primary">
                ↕ Scrollable area (flex-1 overflow-auto)
              </div>
              <div className="ml-4 space-y-1">
                <div className="rounded bg-accent/50 px-3 py-1">
                  TableHeader — sticky top-0 z-20, per-cell
                </div>
                <div className="rounded bg-accent/30 px-3 py-1">
                  TableBody — rows with sticky right actions
                </div>
              </div>
              <div className="rounded bg-secondary px-3 py-1.5 text-secondary-foreground">
                Pagination footer — shrink-0, always visible
              </div>
            </div>
            <p className="text-muted-foreground">{"</DataTableShell>"}</p>
          </div>
        </div>
      </div>

      {/* Column order */}
      <div>
        <h4 className="text-sm font-medium mb-3">Orden de columnas estándar</h4>
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Columna</TableHead>
                <TableHead>Descripción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {standardColumns.map((col) => (
                <TableRow key={col.name}>
                  <TableCell className="font-medium text-sm">{col.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{col.desc}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* CSS Classes reference */}
      <div>
        <h4 className="text-sm font-medium mb-3">Clases CSS estándar</h4>
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Elemento</TableHead>
                <TableHead>Clase</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium text-sm">Header cell</TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">
                    {STICKY_HEADER_CLASS}
                  </code>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-sm">Action header</TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">
                    {STICKY_ACTION_HEADER_CLASS}
                  </code>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-sm">Action cell (row)</TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">
                    {STICKY_ACTION_CLASS}
                  </code>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-sm">Sort header button</TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">
                    variant="ghost" size="sm" className="-ml-3 h-8 text-xs"
                  </code>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-sm">Table min-width</TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">
                    min-w-[1000px]
                  </code>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-sm">Empty state</TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">
                    {"colSpan={totalColumns} className=\"h-24 text-center text-muted-foreground\""}
                  </code>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Live example with DataTableShell */}
      <div>
        <h4 className="text-sm font-medium mb-3">Ejemplo interactivo — DataTableShell con paginación y scroll</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Desplaza horizontalmente para ver todas las columnas. El paginador inferior siempre es visible.
        </p>
        <div className="max-w-4xl">
          <DataTableShell
            currentPage={page}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            className="h-[420px]"
          >
            <Table className="min-w-[1200px]">
              <TableHeader>
                <TableRow>
                  <TableHead className={STICKY_HEADER_CLASS}>
                    <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs">
                      Creación <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className={STICKY_HEADER_CLASS}>
                    <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs">
                      Instagram <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className={STICKY_HEADER_CLASS}>Agente</TableHead>
                  <TableHead className={STICKY_HEADER_CLASS}>Estado</TableHead>
                  <TableHead className={STICKY_HEADER_CLASS}>Categoría</TableHead>
                  <TableHead className={STICKY_HEADER_CLASS}>Contacto</TableHead>
                  <TableHead className={STICKY_HEADER_CLASS}>Email</TableHead>
                  <TableHead className={STICKY_HEADER_CLASS}>Plataforma</TableHead>
                  <TableHead className={STICKY_HEADER_CLASS}>Notas</TableHead>
                  <TableHead className={STICKY_ACTION_HEADER_CLASS}>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                      Sin resultados.
                    </TableCell>
                  </TableRow>
                ) : rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{r.date}</TableCell>
                    <TableCell className="text-sm font-medium">{r.ig}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.agent}</TableCell>
                    <TableCell>
                      <Badge variant={
                        r.status === "Nuevo" ? "secondary" :
                        r.status === "Asignada" ? "default" :
                        r.status === "Completada" ? "success" : "success-soft"
                      } className="font-normal">{r.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        r.cat === "A+" ? "success-soft" :
                        r.cat === "A" ? "primary-soft" :
                        r.cat === "B+" ? "warning-soft" :
                        r.cat === "B" ? "secondary-soft" : "destructive-soft"
                      } className="font-normal">{r.cat}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.phone}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.email}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.platform}</TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[150px]">{r.notes}</TableCell>
                    <TableCell className={STICKY_ACTION_CLASS}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableShell>
        </div>
      </div>

      {/* Rules */}
      <div>
        <h4 className="text-sm font-medium mb-3">Reglas de implementación</h4>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li>
            <strong>DataTableShell</strong>: usar siempre como wrapper. Modo internal scroll con{" "}
            <code className="text-xs bg-muted px-1 rounded">className="flex-1 min-h-0"</code>.
          </li>
          <li>
            <strong>Sticky headers</strong>: aplicar por celda (<code className="text-xs bg-muted px-1 rounded">TableHead</code>),
            no en <code className="text-xs bg-muted px-1 rounded">TableHeader</code>.
          </li>
          <li>
            <strong>Acciones</strong>: siempre <code className="text-xs bg-muted px-1 rounded">sticky right-0</code> con
            fondo sólido <code className="text-xs bg-muted px-1 rounded">bg-card</code>.
          </li>
          <li>
            <strong>Terminología</strong>: siempre "Categoría" (no "Calidad"). Valores: A+, A, B+, B, C.
          </li>
          <li>
            <strong>Orden de columnas</strong>: Creación siempre precede al Handle/Instagram.
          </li>
          <li>
            <strong>Edición inline</strong>: usar <code className="text-xs bg-muted px-1 rounded">InlineCategorySelect</code> e{" "}
            <code className="text-xs bg-muted px-1 rounded">InlineStageSelect</code> en tablas de gestión (pipelines).
          </li>
           <li>
276:             <strong>Paginación server-side</strong>: obligatorio para datasets {">"} 100 registros. Todas las tablas de alto volumen <strong>deben usar DataTableShell</strong> con paginación inferior siempre visible.
           </li>
           <li>
             <strong>Scroll horizontal</strong>: usar <code className="text-xs bg-muted px-1 rounded">min-w-[1000px+]</code> en la tabla dentro del contenedor <code className="text-xs bg-muted px-1 rounded">overflow-auto</code> de DataTableShell para garantizar scroll lateral.
           </li>
          <li>
            <strong>No usar TabsContent</strong>: para evitar romper el flujo flex, usar renderizado condicional manual.
          </li>
        </ul>
      </div>
    </div>

    {/* ── Original sections below ── */}
    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Table</h3>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableData.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-sm">{row.id}</TableCell>
                <TableCell>{row.nombre}</TableCell>
                <TableCell>
                  <Badge variant={row.estado as any}>{row.estado}</Badge>
                </TableCell>
                <TableCell className="text-right">{row.monto}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3}>Total</TableCell>
              <TableCell className="text-right font-medium">$137.00</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Badges — Solid</h3>
      <div className="flex flex-wrap gap-3">
        {solidBadges.map((v) => (
          <Badge key={v} variant={v}>{v}</Badge>
        ))}
        <Badge variant="outline">outline</Badge>
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Badges — Soft</h3>
      <p className="text-sm text-muted-foreground mb-3">
        Variantes con fondo sutil (opacidad /15). Para contextos donde el badge necesita menos peso visual.
      </p>
      <div className="flex flex-wrap gap-3">
        {softBadges.map((v) => (
          <Badge key={v} variant={v}>{v}</Badge>
        ))}
      </div>
    </div>

    {/* OutcomeBadge (QA) */}
    <div>
      <h3 className="text-xl font-medium mb-2 text-muted-foreground">OutcomeBadge (QA)</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
        Pill estandarizada para mostrar el outcome de una llamada de QA (cerro / en_espera / no_cerro). Color y label
        vienen de <code className="font-mono text-primary">OUTCOME_META</code> en{" "}
        <code className="font-mono text-primary">hooks/useAgencyQa.ts</code>. Antes había 4 implementaciones duplicadas
        (AgencyCalls, CallDetailDrawer, CallDetailPage, panel popup) — ahora un único componente con size variants.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <OutcomeBadge outcome="cerro" size="xs" />
        <OutcomeBadge outcome="en_espera" size="xs" />
        <OutcomeBadge outcome="no_cerro" size="xs" />
        <span className="text-[10px] text-muted-foreground">xs</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <OutcomeBadge outcome="cerro" size="sm" />
        <OutcomeBadge outcome="en_espera" size="sm" />
        <OutcomeBadge outcome="no_cerro" size="sm" />
        <span className="text-[10px] text-muted-foreground">sm — default, usado en tabla de Calls</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <OutcomeBadge outcome="cerro" size="md" />
        <OutcomeBadge outcome="en_espera" size="md" />
        <OutcomeBadge outcome="no_cerro" size="md" />
        <span className="text-[10px] text-muted-foreground">md — drawer y detail</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <OutcomeBadge outcome="cerro" size="lg" shadow />
        <OutcomeBadge outcome="en_espera" size="lg" shadow />
        <OutcomeBadge outcome="no_cerro" size="lg" shadow />
        <span className="text-[10px] text-muted-foreground">lg + shadow — header de detalle</span>
      </div>
      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-muted-foreground space-y-1">
        <p><strong className="text-foreground">Props:</strong></p>
        <ul className="list-disc list-inside space-y-0.5 text-xs">
          <li><code className="font-mono text-foreground">outcome</code> — <code>"cerro" | "en_espera" | "no_cerro" | null</code>. Si es null o no matchea, no renderea nada.</li>
          <li><code className="font-mono text-foreground">size</code> — <code>"xs" | "sm" | "md" | "lg"</code>. Default <code>sm</code>.</li>
          <li><code className="font-mono text-foreground">shadow</code> — boolean. Agrega shadow-md (úsalo solo en lg).</li>
          <li><code className="font-mono text-foreground">labelOverride</code> — <code>Partial&lt;Record&lt;string, string&gt;&gt;</code> opcional. Permite override del label por outcome — ej. el panel usa <code>{`{ cerro: "Cerró" }`}</code> en vez de "Exitoso".</li>
        </ul>
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Tooltip</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Información contextual al hover. Usar para hints breves, nunca para contenido esencial.
      </p>
      <div className="flex flex-wrap gap-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm">
              <Info className="mr-1 h-4 w-4" /> Con tooltip
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Este es un tooltip informativo</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon">
              <Info />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Más información</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>

    <div>
      <h3 className="text-xl font-medium mb-4 text-muted-foreground">Progress</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Indicador de progreso lineal. Usar para procesos con progreso cuantificable.
      </p>
      <div className="space-y-4 max-w-md">
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progreso</span>
            <span>25%</span>
          </div>
          <Progress value={25} />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Completado</span>
            <span>75%</span>
          </div>
          <Progress value={75} />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Completo</span>
            <span>100%</span>
          </div>
          <Progress value={100} />
        </div>
      </div>
    </div>
  </section>
  );
};
