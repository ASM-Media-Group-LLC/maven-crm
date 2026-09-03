import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  AGENCIAS, CANALES, FLAGS, TIPOS, FLAG_MONTO, TECHO_GASTO_FAN, TECHO_PRECIO, montoSospechoso, usd,
  type Agency, type CanalVenta, type Pedido, type TipoContenido,
} from "./types";
import { useCatalogos, useMutacionesPedidos, type PedidoInput } from "./usePersonalizados";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  // Con pedido → editar; sin pedido → crear.
  pedido?: Pedido | null;
  agenciaPorDefecto?: Agency;
  onCreado?: (p: Pedido) => void;
}

const hoy = () => new Date().toISOString().slice(0, 10);
const num = (v: string): number | null => (v.trim() === "" ? null : Number(v.replace(/[^0-9.-]/g, "")) || 0);

// El formulario del pedido: los mismos datos del sheet, más lo que le faltaba
// (fecha límite, adelanto/saldo, banderas tipadas en vez de celdas amarillas).
export default function PedidoFormDialog({ open, onOpenChange, pedido, agenciaPorDefecto = "plus", onCreado }: Props) {
  const { user } = useAuth();
  const { creadoras, perfiles, nombreDe } = useCatalogos();
  const { crear, editar } = useMutacionesPedidos();
  const editando = !!pedido;

  const [agency, setAgency] = useState<Agency>(agenciaPorDefecto);
  const [creatorId, setCreatorId] = useState<string>("");
  const [creatorName, setCreatorName] = useState("");
  const [chatterId, setChatterId] = useState<string>("");
  const [fan, setFan] = useState("");
  const [requestedOn, setRequestedOn] = useState(hoy());
  const [dueOn, setDueOn] = useState("");
  const [tipo, setTipo] = useState<TipoContenido | "">("");
  const [canal, setCanal] = useState<CanalVenta | "">("normal");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [gastoFan, setGastoFan] = useState("");
  const [precio, setPrecio] = useState("");
  const [pagado, setPagado] = useState("");
  const [flags, setFlags] = useState<string[]>([]);
  const [notas, setNotas] = useState("");

  // Al abrir: cargar el pedido a editar, o limpiar para uno nuevo (el chatter
  // por defecto es quien está creando).
  useEffect(() => {
    if (!open) return;
    if (pedido) {
      setAgency(pedido.agency); setCreatorId(pedido.creator_id ?? ""); setCreatorName(pedido.creator_name);
      setChatterId(pedido.chatter_id ?? ""); setFan(pedido.fan_handle); setRequestedOn(pedido.requested_on);
      setDueOn(pedido.due_on ?? ""); setTipo(pedido.content_type ?? ""); setCanal(pedido.sale_channel ?? "");
      setDescripcion(pedido.description); setCantidad(pedido.duration_or_qty ?? "");
      setGastoFan(pedido.fan_total_spent_usd?.toString() ?? ""); setPrecio(pedido.price_usd?.toString() ?? "");
      setPagado(pedido.paid_usd?.toString() ?? ""); setFlags(pedido.flags ?? []); setNotas(pedido.notes ?? "");
    } else {
      // El chatter arranca en quien está creando SOLO si tiene el rol Chatter
      // (un supervisor que registra un pedido ajeno no debe quedar como vendedor).
      const miId = user?.id ?? "";
      const yoSoyChatter = !!miId && perfiles.some((p) => p.id === miId);
      setAgency(agenciaPorDefecto); setCreatorId(""); setCreatorName(""); setChatterId(yoSoyChatter ? miId : "");
      setFan(""); setRequestedOn(hoy()); setDueOn(""); setTipo(""); setCanal("normal"); setDescripcion("");
      setCantidad(""); setGastoFan(""); setPrecio(""); setPagado(""); setFlags([]); setNotas("");
    }
  }, [open, pedido, agenciaPorDefecto, user?.id, perfiles]);

  // El catálogo ya viene con SOLO creadoras activas. Si el pedido que se edita
  // apunta a una que ya no está activa, se la agrega igual para no perder el dato.
  const creadorasOrdenadas = useMemo(() => {
    const lista = [...creadoras].sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (pedido?.creator_id && !lista.some((c) => c.id === pedido.creator_id)) {
      lista.unshift({ id: pedido.creator_id, nombre: `${pedido.creator_name} · ya no activa`, status: "inactiva" });
    }
    return lista;
  }, [creadoras, pedido?.creator_id, pedido?.creator_name]);

  // Igual con el chatter: los pedidos viejos tienen chatters que ya no están.
  const chattersDelSelector = useMemo(() => {
    const lista = perfiles.map((p) => ({ id: p.id, nombre: p.full_name as string }));
    if (pedido?.chatter_id && !lista.some((c) => c.id === pedido.chatter_id)) {
      lista.unshift({ id: pedido.chatter_id, nombre: `${pedido.chatter_name ?? "Chatter"} · ya no es chatter` });
    }
    return lista;
  }, [perfiles, pedido?.chatter_id, pedido?.chatter_name]);

  const precioRaro = montoSospechoso(num(precio), TECHO_PRECIO);
  const gastoRaro = montoSospechoso(num(gastoFan), TECHO_GASTO_FAN);

  const guardando = crear.isPending || editar.isPending;
  const valido = creatorName.trim().length > 0 && fan.trim().length > 0 && descripcion.trim().length > 0;

  const guardar = async () => {
    if (!valido) return;
    const input: PedidoInput = {
      agency,
      creator_id: creatorId || null,
      creator_name: creatorName.trim(),
      chatter_id: chatterId || null,
      chatter_name: chatterId ? nombreDe(chatterId) : null,
      fan_handle: fan.trim().replace(/^@/, ""),
      requested_on: requestedOn || hoy(),
      due_on: dueOn || null,
      content_type: (tipo || null) as TipoContenido | null,
      sale_channel: (canal || null) as CanalVenta | null,
      description: descripcion.trim(),
      duration_or_qty: cantidad.trim() || null,
      fan_total_spent_usd: num(gastoFan),
      price_usd: num(precio),
      paid_usd: num(pagado),
      flags: precioRaro || gastoRaro ? [...new Set([...flags, FLAG_MONTO])] : flags.filter((f) => f !== FLAG_MONTO),
      notes: notas.trim() || null,
      denied_reason: pedido?.denied_reason ?? null,
    };
    try {
      if (editando && pedido) {
        await editar.mutateAsync({ id: pedido.id, patch: input });
        toast.success("Pedido actualizado");
      } else {
        const creado = await crear.mutateAsync(input);
        toast.success("Pedido creado", { description: `${creado.creator_name} · @${creado.fan_handle}` });
        onCreado?.(creado);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error("No se pudo guardar el pedido", { description: (e as Error).message });
    }
  };

  const saldo = (num(precio) ?? 0) - (num(pagado) ?? 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!guardando) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar pedido" : "Nuevo personalizado"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Quién y para quién */}
          <div className="space-y-1.5">
            <Label>Agencia</Label>
            <Select value={agency} onValueChange={(v) => setAgency(v as Agency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{AGENCIAS.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Creadora *</Label>
            <Select
              value={creatorId || (creatorName ? "__libre__" : "")}
              onValueChange={(v) => {
                if (v === "__libre__") { setCreatorId(""); return; }
                setCreatorId(v); setCreatorName(creadoras.find((c) => c.id === v)?.nombre ?? "");
              }}
            >
              <SelectTrigger><SelectValue placeholder="Elegir creadora" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {creadorasOrdenadas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                ))}
                <SelectItem value="__libre__">Otra (escribir nombre)</SelectItem>
              </SelectContent>
            </Select>
            {!creatorId && (
              <Input value={creatorName} onChange={(e) => setCreatorName(e.target.value)} placeholder="Nombre de la creadora" />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Chatter</Label>
            <Select value={chatterId} onValueChange={setChatterId}>
              <SelectTrigger><SelectValue placeholder="Quién vendió el pedido" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {chattersDelSelector.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                {chattersDelSelector.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Nadie con el rol Chatter todavía</div>}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fan (usuario) *</Label>
            <Input value={fan} onChange={(e) => setFan(e.target.value)} placeholder="@u85422765" />
          </div>

          {/* Qué pide */}
          <div className="space-y-1.5">
            <Label>Tipo de contenido</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoContenido)}>
              <SelectTrigger><SelectValue placeholder="Foto, video, audio…" /></SelectTrigger>
              <SelectContent>{TIPOS.map((t) => <SelectItem key={t.id} value={t.id}>{t.emoji} {t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tiempo o cantidad</Label>
            <Input value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="8 min · 3 fotos · a discreción de la cc" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Descripción del pedido *</Label>
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={5}
              placeholder="Qué pidió el fan, con sus palabras si hace falta: nombre que quiere oír, ropa, poses, duración…" />
          </div>

          {/* Venta */}
          <div className="space-y-1.5">
            <Label>Canal de venta</Label>
            <Select value={canal} onValueChange={(v) => setCanal(v as CanalVenta)}>
              <SelectTrigger><SelectValue placeholder="Normal / Hora Buster" /></SelectTrigger>
              <SelectContent>{CANALES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{CANALES.find((c) => c.id === canal)?.ayuda}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label>Precio (USD)</Label>
              <Input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="200"
                className={precioRaro ? "border-amber-500/60 focus-visible:ring-amber-500/40" : undefined} />
            </div>
            <div className="space-y-1.5">
              <Label>Pagado</Label>
              <Input inputMode="decimal" value={pagado} onChange={(e) => setPagado(e.target.value)} placeholder="200" />
            </div>
            <div className="space-y-1.5">
              <Label>Gasto del fan</Label>
              <Input inputMode="decimal" value={gastoFan} onChange={(e) => setGastoFan(e.target.value)} placeholder="5850"
                className={gastoRaro ? "border-amber-500/60 focus-visible:ring-amber-500/40" : undefined} />
            </div>
            {num(precio) != null && num(pagado) != null && saldo > 0 && (
              <p className="col-span-3 text-[11px] text-amber-500">Saldo pendiente: ${saldo.toFixed(0)}</p>
            )}
            {/* Del sheet llegaron precios de "$5.500.000": si el monto es imposible
                se avisa acá y el pedido queda marcado para revisar. */}
            {(precioRaro || gastoRaro) && (
              <p className="col-span-3 text-[11px] text-amber-500">
                ¿{precioRaro ? usd(num(precio)) : usd(num(gastoFan))}? Parece un error de tipeo
                ({precioRaro ? `un personalizado ronda los $150; el techo son ${usd(TECHO_PRECIO)}` : `el techo del gasto del fan son ${usd(TECHO_GASTO_FAN)}`}).
                Si lo guardás así, el pedido queda marcado como "monto por revisar".
              </p>
            )}
          </div>

          {/* Fechas */}
          <div className="space-y-1.5">
            <Label>Fecha de solicitud</Label>
            <Input type="date" value={requestedOn} onChange={(e) => setRequestedOn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Fecha límite de entrega</Label>
            <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          </div>

          {/* Avisos y notas */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Avisos</Label>
            <div className="flex flex-wrap gap-1.5">
              {FLAGS.map((f) => {
                const on = flags.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFlags((cur) => on ? cur.filter((x) => x !== f.id) : [...cur, f.id])}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400" : "border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notas internas</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder="Lo que hoy iba en la columna Notas" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={guardando}>Cancelar</Button>
          <Button onClick={() => void guardar()} disabled={!valido || guardando} className="gap-1.5">
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            {editando ? "Guardar cambios" : "Crear pedido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
