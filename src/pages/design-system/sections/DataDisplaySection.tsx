import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
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
import { Info } from "lucide-react";

const solidBadges = ["default", "secondary", "destructive", "success", "warning", "info"] as const;
const softBadges = ["primary-soft", "secondary-soft", "destructive-soft", "success-soft", "warning-soft"] as const;

const tableData = [
  { id: "INV-001", nombre: "Plan Pro", estado: "success", monto: "$29.00" },
  { id: "INV-002", nombre: "Plan Business", estado: "warning", monto: "$99.00" },
  { id: "INV-003", nombre: "Add-on Storage", estado: "destructive", monto: "$9.00" },
];

export const DataDisplaySection = () => (
  <section id="data-display" className="space-y-8">
    <div>
      <h2 className="text-3xl font-semibold mb-2">2.7 Data Display</h2>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Componentes para mostrar datos estructurados y metadatos.
      </p>
    </div>

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
