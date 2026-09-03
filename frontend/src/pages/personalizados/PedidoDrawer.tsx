import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Paperclip, Pencil, Trash2, ExternalLink, X, Calendar, User, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  ESTADOS, SIGUIENTES, SOLO_SUPERVISOR, agenciaDe, estadoDe, flagDe, tipoDe, usd,
  type Estado, type Pedido, type PedidoAdjunto, type PedidoEvento,
} from "./types";
import { useCatalogos, useMutacionesPedidos, usePedidoAdjuntos, usePedidoEventos, usePermisosPersonalizados, urlFirmada } from "./usePersonalizados";

interface Props {
  pedido: Pedido | null;
  onClose: () => void;
  onEditar: (p: Pedido) => void;
}

const fecha = (d: string | null | undefined) => (d ? format(new Date(d.length === 10 ? `${d}T12:00:00` : d), "d MMM yyyy", { locale: es }) : "—");

// Defaults ESTABLES para cuando la query está deshabilitada (drawer cerrado):
// un `= []` inline sería un array nuevo por render y, como `adjuntos` es
// dependencia de un efecto que setea estado, giraba en bucle infinito con la
// ficha cerrada (la pestaña se congelaba al tocar cualquier filtro).
const SIN_EVENTOS: PedidoEvento[] = [];
const SIN_ADJUNTOS: PedidoAdjunto[] = [];

// Ficha del pedido: todo lo que en el sheet había que leer en una fila de 12
// columnas, más lo que el sheet no podía: botones de estado con reglas,
// adjuntos como archivos e historial de quién cambió qué y cuándo.
export default function PedidoDrawer({ pedido, onClose, onEditar }: Props) {
  const { puedeAprobar, puedeGestionar } = usePermisosPersonalizados();
  const { nombreDe } = useCatalogos();
  const { cambiarEstado, editar, borrar, subirAdjunto, borrarAdjunto } = useMutacionesPedidos();
  const { data: eventos = SIN_EVENTOS } = usePedidoEventos(pedido?.id ?? null);
  const { data: adjuntos = SIN_ADJUNTOS } = usePedidoAdjuntos(pedido?.id ?? null);

  const [denegando, setDenegando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [notas, setNotas] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const [kindSubida, setKindSubida] = useState<"referencia" | "entrega">("referencia");

  useEffect(() => { setNotas(pedido?.notes ?? ""); setDenegando(false); setMotivo(""); }, [pedido?.id, pedido?.notes]);

  // URLs firmadas (1h) para los adjuntos: el bucket es privado a propósito.
  useEffect(() => {
    if (adjuntos.length === 0) {
      setUrls((u) => (Object.keys(u).length ? {} : u));
      return;
    }
    let vivo = true;
    (async () => {
      const pares = await Promise.all(adjuntos.map(async (a) => [a.id, await urlFirmada(a.storage_path)] as const));
      if (vivo) setUrls(Object.fromEntries(pares.filter(([, u]) => u) as Array<[string, string]>));
    })();
    return () => { vivo = false; };
  }, [adjuntos]);

  if (!pedido) return null;
  const est = estadoDe(pedido.status);
  const ag = agenciaDe(pedido.agency);
  const tipo = tipoDe(pedido.content_type);
  const saldo = (pedido.price_usd ?? 0) - (pedido.paid_usd ?? 0);
  const vencido = pedido.due_on && !["entregado", "denegado", "reembolsado"].includes(pedido.status) && new Date(`${pedido.due_on}T23:59:59`) < new Date();

  const mover = async (estado: Estado) => {
    if (estado === "denegado") { setDenegando(true); return; }
    try {
      await cambiarEstado.mutateAsync({ id: pedido.id, estado });
      toast.success(`Pedido → ${estadoDe(estado).label}`);
    } catch (e) {
      toast.error("No se pudo cambiar el estado", { description: (e as Error).message });
    }
  };
  const confirmarDenegar = async () => {
    try {
      await cambiarEstado.mutateAsync({ id: pedido.id, estado: "denegado", motivo: motivo.trim() || undefined });
      toast.success("Pedido denegado");
      setDenegando(false);
    } catch (e) {
      toast.error("No se pudo denegar", { description: (e as Error).message });
    }
  };
  const guardarNotas = async () => {
    if ((pedido.notes ?? "") === notas) return;
    try { await editar.mutateAsync({ id: pedido.id, patch: { notes: notas.trim() || null } }); toast.success("Notas guardadas"); }
    catch (e) { toast.error("No se pudieron guardar las notas", { description: (e as Error).message }); }
  };
  const subir = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      try { await subirAdjunto.mutateAsync({ requestId: pedido.id, file: f, kind: kindSubida }); }
      catch (e) { toast.error(`No se pudo subir ${f.name}`, { description: (e as Error).message }); }
    }
    if (fileRef.current) fileRef.current.value = "";
  };
  const quitarAdjunto = async (a: PedidoAdjunto) => {
    try { await borrarAdjunto.mutateAsync(a); } catch (e) { toast.error("No se pudo quitar", { description: (e as Error).message }); }
  };

  const siguientes = SIGUIENTES[pedido.status].filter((s) => !SOLO_SUPERVISOR.includes(s) || puedeAprobar);

  return (
    <Sheet open={!!pedido} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <Badge variant="outline" className={`rounded-full ${est.tono}`}>{est.label}</Badge>
                <Badge variant="outline" className={`rounded-full ${ag.tono}`}>{ag.label}</Badge>
                {tipo && <Badge variant="outline" className="rounded-full">{tipo.emoji} {tipo.label}</Badge>}
                {pedido.sale_channel === "buster" && <Badge variant="outline" className="rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30">⚡ Hora Buster</Badge>}
                {vencido && <Badge variant="outline" className="rounded-full bg-red-500/15 text-red-600 border-red-500/30">Vencido</Badge>}
              </div>
              <SheetTitle className="text-lg leading-tight">{pedido.creator_name} <span className="text-muted-foreground font-normal">para</span> @{pedido.fan_handle}</SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{pedido.chatter_name || nombreDe(pedido.chatter_id) || "Sin chatter"}</span>
                <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />Pedido {fecha(pedido.requested_on)}</span>
                {pedido.due_on && <span className={`inline-flex items-center gap-1 ${vencido ? "text-red-500 font-medium" : ""}`}>Entrega {fecha(pedido.due_on)}</span>}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full shrink-0" onClick={() => onEditar(pedido)} title="Editar pedido">
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="px-5 py-4 space-y-5">
          {/* Acciones de estado */}
          {siguientes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {siguientes.map((s) => {
                const e = estadoDe(s);
                const destructivo = s === "denegado" || s === "reembolsado";
                return (
                  <Button key={s} size="sm" variant={destructivo ? "outline" : "default"}
                    className={`rounded-full ${destructivo ? "text-destructive border-destructive/40 hover:bg-destructive/10" : ""}`}
                    disabled={cambiarEstado.isPending} onClick={() => void mover(s)}>
                    {cambiarEstado.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    {s === "denegado" ? "Denegar" : s === "reembolsado" ? "Marcar reembolso" : `Pasar a ${e.label}`}
                  </Button>
                );
              })}
              {!puedeAprobar && pedido.status === "solicitado" && (
                <p className="text-[11px] text-muted-foreground self-center">Esperando aprobación de un supervisor.</p>
              )}
            </div>
          )}
          {denegando && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
              <Label className="text-xs">Motivo (lo ve el chatter)</Label>
              <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué no se hace este pedido" />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setDenegando(false)}>Cancelar</Button>
                <Button size="sm" variant="destructive" onClick={() => void confirmarDenegar()} disabled={cambiarEstado.isPending}>Denegar pedido</Button>
              </div>
            </div>
          )}
          {pedido.status === "denegado" && pedido.denied_reason && (
            <p className="text-sm text-destructive/90 bg-destructive/5 rounded-xl px-3 py-2">Denegado: {pedido.denied_reason}</p>
          )}

          {/* Descripción */}
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Qué pidió</h4>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{pedido.description}</p>
            {pedido.duration_or_qty && <p className="text-xs text-muted-foreground mt-1.5">Tiempo/cantidad: <span className="text-foreground">{pedido.duration_or_qty}</span></p>}
          </section>

          {/* Dinero */}
          <section className="grid grid-cols-3 gap-2">
            {[
              { l: "Precio", v: usd(pedido.price_usd) },
              { l: "Pagado", v: usd(pedido.paid_usd) },
              { l: "Gasto del fan", v: usd(pedido.fan_total_spent_usd) },
            ].map((k) => (
              <div key={k.l} className="rounded-xl bg-muted/50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.l}</p>
                <p className="text-sm font-semibold">{k.v}</p>
              </div>
            ))}
            {pedido.price_usd != null && pedido.paid_usd != null && saldo > 0 && (
              <p className="col-span-3 text-xs text-amber-500">Saldo pendiente: {usd(saldo)}</p>
            )}
          </section>

          {/* Avisos */}
          {pedido.flags.length > 0 && (
            <section className="flex flex-wrap gap-1.5">
              {pedido.flags.map((f) => (
                <Badge key={f} variant="outline" className="rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">{flagDe(f)}</Badge>
              ))}
            </section>
          )}

          {/* Adjuntos */}
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Adjuntos</h4>
              <div className="flex items-center gap-1">
                <select value={kindSubida} onChange={(e) => setKindSubida(e.target.value as "referencia" | "entrega")}
                  className="h-7 rounded-md bg-muted text-xs px-2 border-0">
                  <option value="referencia">Referencia</option>
                  <option value="entrega">Entrega</option>
                </select>
                <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void subir(e.target.files)} />
                <Button size="sm" variant="outline" className="h-7 rounded-full gap-1 text-xs" onClick={() => fileRef.current?.click()} disabled={subirAdjunto.isPending}>
                  {subirAdjunto.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />} Subir
                </Button>
              </div>
            </div>
            {adjuntos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin archivos. Las fotos de referencia del fan y la entrega de la creadora van acá.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {adjuntos.map((a) => {
                  const u = urls[a.id];
                  const esImg = a.mime_type?.startsWith("image/");
                  return (
                    <div key={a.id} className="group relative rounded-xl overflow-hidden border border-border/60 bg-muted/30 aspect-square">
                      {esImg && u ? (
                        <img src={u} alt={a.file_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2 text-center">
                          <Paperclip className="h-4 w-4 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground truncate max-w-full">{a.file_name}</span>
                        </div>
                      )}
                      <span className={`absolute top-1 left-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${a.kind === "entrega" ? "bg-emerald-500/80 text-white" : "bg-black/55 text-white"}`}>
                        {a.kind === "entrega" ? "Entrega" : "Ref."}
                      </span>
                      <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {u && <a href={u} target="_blank" rel="noopener noreferrer" className="h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center"><ExternalLink className="h-3 w-3" /></a>}
                        <button type="button" onClick={() => void quitarAdjunto(a)} className="h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-destructive"><X className="h-3 w-3" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Notas */}
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Notas internas</h4>
            <Textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} onBlur={() => void guardarNotas()} placeholder="Se guardan al salir del campo" />
          </section>

          {/* Historial */}
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Historial</h4>
            <ol className="space-y-1.5">
              {eventos.map((ev) => (
                <li key={ev.id} className="text-xs flex items-start gap-2">
                  <Sparkles className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="flex-1">
                    <span className="font-medium">{nombreDe(ev.actor_id) ?? (ev.actor_id ? "Alguien" : "Sistema")}</span>
                    {" "}{ev.from_status ? `pasó de ${estadoDe(ev.from_status).label} a ` : "creó el pedido como "}<span className="font-medium">{estadoDe(ev.to_status).label}</span>
                    {ev.note && <span className="text-muted-foreground"> — {ev.note}</span>}
                    <span className="text-muted-foreground"> · {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true, locale: es })}</span>
                  </span>
                </li>
              ))}
              {eventos.length === 0 && <li className="text-xs text-muted-foreground">Sin movimientos todavía.</li>}
            </ol>
            {pedido.source === "sheet" && <p className="text-[11px] text-muted-foreground mt-2">Importado del sheet{pedido.source_ref ? ` (${pedido.source_ref})` : ""}.</p>}
          </section>

          {puedeGestionar && (
            <div className="pt-2 border-t border-border/60 flex justify-end">
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive rounded-full gap-1" onClick={() => setBorrando(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Eliminar pedido
              </Button>
            </div>
          )}
        </div>

        <AlertDialog open={borrando} onOpenChange={setBorrando}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar este pedido?</AlertDialogTitle>
              <AlertDialogDescription>Se borra con su historial y adjuntos. Si solo no se va a hacer, mejor denegarlo: queda el registro.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async (e) => { e.preventDefault(); try { await borrar.mutateAsync(pedido.id); toast.success("Pedido eliminado"); onClose(); } catch (err) { toast.error("No se pudo eliminar", { description: (err as Error).message }); } }}>
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
