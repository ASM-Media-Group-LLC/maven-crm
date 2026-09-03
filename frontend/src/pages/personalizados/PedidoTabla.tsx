import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowDown, ArrowUp, ChevronsUpDown, Filter } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DIAS_VENCIDO, agenciaDe, alertaDe, estadoDe, tipoDe, usd, type Pedido } from "./types";
import { CLASE, TEXTOS, etiquetaValor, valoresDe, type ColumnaOrden, type Direccion, type Orden } from "./orden";

interface Props {
  pedidos: Pedido[];
  onAbrir: (p: Pedido) => void;
  /** Clic en el nombre del chatter → ficha de perfil (la del Messenger). */
  onVerChatter: (userId: string) => void;
  /** ¿Quien mira puede abrir el perfil de una creadora? (tab Creadoras) */
  puedeVerCreadora: boolean;
  orden: Orden | null;
  onOrdenar: (o: Orden | null) => void;
  /** Valor del filtro que corresponde a cada columna categórica (para el "ver solo"). */
  filtroDe: (col: ColumnaOrden) => string;
  onFiltrar: (col: ColumnaOrden, valor: string) => void;
}

const f = (d: string | null) => (d ? format(new Date(`${d}T12:00:00`), "d MMM yy", { locale: es }) : "—");

const COLUMNAS: Array<{ col: ColumnaOrden; label: string; alinear?: "der" }> = [
  { col: "creator_name", label: "Creadora" },
  { col: "requested_on", label: "Pedido" },
  { col: "status", label: "Estado" },
  { col: "chatter_name", label: "Chatter" },
  { col: "fan_handle", label: "Fan" },
  { col: "content_type", label: "Tipo" },
  { col: "price_usd", label: "Precio", alinear: "der" },
  { col: "paid_usd", label: "Pagado", alinear: "der" },
  { col: "sale_channel", label: "Canal" },
  { col: "due_on", label: "Entrega" },
  { col: "agency", label: "Agencia" },
];

/* Encabezado con menú: cómo ordenar y —en las columnas de categoría— ver solo un
   valor. El clic abre el menú (en vez de alternar a ciegas) porque en "Precio"
   hay que poder decir mayor o menor sin adivinar qué hace el primer clic. */
function Encabezado({ col, label, alinear, pedidos, orden, onOrdenar, filtroDe, onFiltrar }:
  { col: ColumnaOrden; label: string; alinear?: "der" }
  & Pick<Props, "pedidos" | "orden" | "onOrdenar" | "filtroDe" | "onFiltrar">) {
  const clase = CLASE[col];
  const activo = orden?.col === col;
  const filtro = filtroDe(col);
  const valores = clase === "categoria" ? valoresDe(pedidos, col) : [];
  const ordenar = (dir: Direccion) => onOrdenar({ col, dir });

  return (
    <TableHead className={alinear === "der" ? "text-right" : undefined}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button"
            className={`group inline-flex items-center gap-1 rounded-md px-1 -mx-1 py-0.5 transition-colors hover:text-foreground ${activo || filtro ? "text-foreground" : ""}`}
            title={`Ordenar o filtrar por ${label.toLowerCase()}`}>
            <span>{label}</span>
            {filtro && <Filter className="h-3 w-3 text-primary" />}
            {activo
              ? (orden!.dir === "desc" ? <ArrowDown className="h-3.5 w-3.5 text-primary" /> : <ArrowUp className="h-3.5 w-3.5 text-primary" />)
              : <ChevronsUpDown className="h-3.5 w-3.5 opacity-0 group-hover:opacity-50 transition-opacity" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={alinear === "der" ? "end" : "start"} className="w-56 max-h-[70vh] overflow-y-auto">
          <DropdownMenuItem onClick={() => ordenar("desc")}>
            <ArrowDown className="h-3.5 w-3.5 mr-2" /> {TEXTOS[clase].desc}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => ordenar("asc")}>
            <ArrowUp className="h-3.5 w-3.5 mr-2" /> {TEXTOS[clase].asc}
          </DropdownMenuItem>
          {activo && (
            <DropdownMenuItem onClick={() => onOrdenar(null)} className="text-muted-foreground">
              Quitar el orden
            </DropdownMenuItem>
          )}
          {valores.length > 1 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ver solo</DropdownMenuLabel>
              {valores.map((v) => (
                <DropdownMenuCheckboxItem key={v} checked={filtro === v}
                  onCheckedChange={(marcado) => onFiltrar(col, marcado ? v : "")}>
                  {etiquetaValor(col, v)}
                </DropdownMenuCheckboxItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </TableHead>
  );
}

// La vista "sheet": todo lo que la gente estaba acostumbrada a ver en columnas,
// pero filtrable, ordenable por columna y con clic para abrir la ficha.
export default function PedidoTabla({ pedidos, onAbrir, orden, onOrdenar, filtroDe, onFiltrar, onVerChatter, puedeVerCreadora }: Props) {
  return (
    <div className="rounded-2xl border border-border/60 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNAS.map((c) => (
              <Encabezado key={c.col} {...c} pedidos={pedidos} orden={orden} onOrdenar={onOrdenar} filtroDe={filtroDe} onFiltrar={onFiltrar} />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pedidos.length === 0 && (
            <TableRow>
              <TableCell colSpan={COLUMNAS.length} className="text-center text-sm text-muted-foreground py-12">
                No hay pedidos con esos filtros.
              </TableCell>
            </TableRow>
          )}
          {pedidos.map((p) => {
            const e = estadoDe(p.status); const ag = agenciaDe(p.agency); const t = tipoDe(p.content_type);
            // Reloj del plazo: barrita de color a la izquierda de la fila y los
            // días a la vista junto a la fecha del pedido. Ver `alertaDe`.
            const a = alertaDe(p);
            return (
              <TableRow key={p.id} className={`cursor-pointer border-l-2 ${a ? a.borde : "border-l-transparent"}`} onClick={() => onAbrir(p)}>
                <TableCell className="font-medium whitespace-nowrap">
                  {/* La creadora lleva a su perfil de Maven, solo si quien mira
                      tiene el tab Creadoras y el pedido está vinculado. */}
                  {puedeVerCreadora && p.creator_id ? (
                    <Link to={`/creadores/${p.creator_id}`} onClick={(e) => e.stopPropagation()}
                      className="hover:text-primary hover:underline decoration-dotted underline-offset-2">
                      {p.creator_name}
                    </Link>
                  ) : p.creator_name}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    {f(p.requested_on)}
                    {a && (
                      <span
                        title={a.nivel === "vencido"
                          ? `Pasó el plazo de ${DIAS_VENCIDO} días: abierto hace ${a.dias}.`
                          : `Abierto hace ${a.dias} días. El plazo es de ${DIAS_VENCIDO}.`}
                        className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${a.tono}`}
                      >
                        {a.dias} d
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell><Badge variant="outline" className={`rounded-full ${e.tono}`}>{e.corto}</Badge></TableCell>
                <TableCell className="whitespace-nowrap">
                  {/* El chatter abre su ficha (la misma del Messenger), desde
                      donde se le puede mandar un mensaje o un correo. Los
                      históricos sin usuario de Maven quedan como texto. */}
                  {p.chatter_id ? (
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); onVerChatter(p.chatter_id!); }}
                      className="hover:text-primary hover:underline decoration-dotted underline-offset-2">
                      {p.chatter_name || "Ver ficha"}
                    </button>
                  ) : (p.chatter_name || "—")}
                </TableCell>
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
