import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { agenciaDe, estadoDe, tipoDe, usd, type Pedido } from "./types";

interface Props {
  pedidos: Pedido[];
  onAbrir: (p: Pedido) => void;
}

const f = (d: string | null) => (d ? format(new Date(`${d}T12:00:00`), "d MMM yy", { locale: es }) : "—");

// La vista "sheet": todo lo que la gente estaba acostumbrada a ver en columnas,
// pero filtrable y con clic para abrir la ficha.
export default function PedidoTabla({ pedidos, onAbrir }: Props) {
  if (pedidos.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-12">No hay pedidos con esos filtros.</p>;
  }
  return (
    <div className="rounded-2xl border border-border/60 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Creadora</TableHead>
            <TableHead>Pedido</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Chatter</TableHead>
            <TableHead>Fan</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Precio</TableHead>
            <TableHead className="text-right">Pagado</TableHead>
            <TableHead>Canal</TableHead>
            <TableHead>Entrega</TableHead>
            <TableHead>Agencia</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pedidos.map((p) => {
            const e = estadoDe(p.status); const ag = agenciaDe(p.agency); const t = tipoDe(p.content_type);
            return (
              <TableRow key={p.id} className="cursor-pointer" onClick={() => onAbrir(p)}>
                <TableCell className="font-medium whitespace-nowrap">{p.creator_name}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{f(p.requested_on)}</TableCell>
                <TableCell><Badge variant="outline" className={`rounded-full ${e.tono}`}>{e.corto}</Badge></TableCell>
                <TableCell className="whitespace-nowrap">{p.chatter_name || "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">@{p.fan_handle}</TableCell>
                <TableCell className="whitespace-nowrap">{t ? `${t.emoji} ${t.label}` : "—"}</TableCell>
                <TableCell className="text-right font-medium">{usd(p.price_usd)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{usd(p.paid_usd)}</TableCell>
                <TableCell>{p.sale_channel === "buster" ? "⚡ Buster" : p.sale_channel === "normal" ? "Normal" : "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{f(p.due_on)}</TableCell>
                <TableCell><Badge variant="outline" className={`rounded-full ${ag.tono}`}>{ag.label}</Badge></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
