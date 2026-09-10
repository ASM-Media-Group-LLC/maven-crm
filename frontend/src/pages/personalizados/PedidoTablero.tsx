import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { DIAS_VENCIDO, ESTADOS, SIGUIENTES, SOLO_SUPERVISOR, agenciaDe, alertaDe, estaCerrado, tipoDe, usd, type Estado, type Pedido } from "./types";
import { useMutacionesPedidos, usePermisosPersonalizados } from "./usePersonalizados";

interface Props {
  pedidos: Pedido[];
  onAbrir: (p: Pedido) => void;
}

const dias = (d: string) => Math.ceil((new Date(`${d}T23:59:59`).getTime() - Date.now()) / 86_400_000);

// Tarjeta de pedido: lo mínimo para decidir sin abrirla — quién, para quién,
// qué, cuánto y para cuándo.
export function PedidoCard({ p, onClick }: { p: Pedido; onClick: () => void }) {
  const tipo = tipoDe(p.content_type);
  const ag = agenciaDe(p.agency);
  const cerrado = estaCerrado(p.status);
  // Plazo de los 12 días (ver `alertaDe`). La cuenta de `due_on` queda solo
  // para lo que TODAVÍA no vence: el atraso ya lo dice la alerta.
  const alerta = alertaDe(p);
  const restan = p.due_on && !cerrado && !alerta ? dias(p.due_on) : null;
  const saldo = (p.price_usd ?? 0) - (p.paid_usd ?? 0);
  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left rounded-2xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-sm transition-all p-3 space-y-1.5 ${alerta ? `border-l-2 ${alerta.borde}` : ""}`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-medium text-sm truncate flex-1">{p.creator_name}</span>
        <Badge variant="outline" className={`rounded-full text-[10px] px-1.5 ${ag.tono}`}>{ag.label}</Badge>
        {p.sale_channel === "buster" && <span title="Hora Buster" className="text-xs">⚡</span>}
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">{tipo ? `${tipo.emoji} ` : ""}{p.description}</p>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="truncate">@{p.fan_handle}{p.chatter_name ? ` · ${p.chatter_name.split(" ")[0]}` : ""}</span>
        <span className="font-semibold text-foreground">{usd(p.price_usd)}</span>
      </div>
      {(alerta || restan !== null || saldo > 0 || p.flags.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {alerta && (
            <span
              title={alerta.nivel === "vencido"
                ? `Pasó el plazo de ${DIAS_VENCIDO} días: abierto hace ${alerta.dias}.`
                : `Abierto hace ${alerta.dias} días. El plazo es de ${DIAS_VENCIDO}.`}
              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${alerta.tono}`}
            >
              {alerta.texto}
            </span>
          )}
          {restan !== null && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${restan <= 2 ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>
              {restan === 0 ? "Vence hoy" : `${restan}d`}
            </span>
          )}
          {saldo > 0 && p.price_usd != null && p.paid_usd != null && <span className="rounded-full px-1.5 py-0.5 text-[10px] bg-warning/15 text-warning">Debe {usd(saldo)}</span>}
          {p.flags.length > 0 && <span className="rounded-full px-1.5 py-0.5 text-[10px] bg-warning/15 text-warning">⚠ {p.flags.length}</span>}
        </div>
      )}
    </button>
  );
}

// Tablero por estado. Arrastrar una tarjeta a otra columna = cambiar de estado,
// con las mismas reglas que los botones (solo transiciones válidas; aprobar y
// denegar solo supervisor+ — y la BD lo vuelve a exigir).
export default function PedidoTablero({ pedidos, onAbrir }: Props) {
  const { cambiarEstado } = useMutacionesPedidos();
  const { puedeAprobar } = usePermisosPersonalizados();

  const onDragEnd = async (r: DropResult) => {
    if (!r.destination) return;
    const destino = r.destination.droppableId as Estado;
    const p = pedidos.find((x) => x.id === r.draggableId);
    if (!p || p.status === destino) return;
    if (!SIGUIENTES[p.status].includes(destino)) {
      toast.error(`De ${ESTADOS.find((e) => e.id === p.status)?.label} no se pasa a ${ESTADOS.find((e) => e.id === destino)?.label}`);
      return;
    }
    if (SOLO_SUPERVISOR.includes(destino) && !puedeAprobar) {
      toast.error("Solo un supervisor puede aprobar o denegar");
      return;
    }
    try {
      await cambiarEstado.mutateAsync({ id: p.id, estado: destino });
    } catch (e) {
      toast.error("No se pudo mover el pedido", { description: (e as Error).message });
    }
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
        {ESTADOS.map((col) => {
          const items = pedidos.filter((p) => p.status === col.id);
          const total = items.reduce((s, p) => s + (p.price_usd ?? 0), 0);
          return (
            <Droppable droppableId={col.id} key={col.id}>
              {(prov, snap) => (
                <div ref={prov.innerRef} {...prov.droppableProps}
                  className={`shrink-0 w-[272px] rounded-2xl p-2 transition-colors ${snap.isDraggingOver ? "bg-primary/5 ring-1 ring-primary/30" : "bg-muted/30"} ${col.lateral ? "opacity-90" : ""}`}>
                  <div className="flex items-center justify-between px-1.5 pb-2">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={`rounded-full ${col.tono}`}>{col.label}</Badge>
                      <span className="text-xs text-muted-foreground">{items.length}</span>
                    </div>
                    {total > 0 && <span className="text-[11px] text-muted-foreground">{usd(total)}</span>}
                  </div>
                  <div className="space-y-2 min-h-[80px]">
                    {items.map((p, i) => (
                      <Draggable draggableId={p.id} index={i} key={p.id}>
                        {(dp, ds) => (
                          <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps} className={ds.isDragging ? "rotate-1" : ""}>
                            <PedidoCard p={p} onClick={() => onAbrir(p)} />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {prov.placeholder}
                    {items.length === 0 && !snap.isDraggingOver && (
                      <p className="text-[11px] text-muted-foreground/60 text-center py-6">Nada acá</p>
                    )}
                  </div>
                </div>
              )}
            </Droppable>
          );
        })}
      </div>
    </DragDropContext>
  );
}
