import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/UserAvatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Paperclip, Pencil, Trash2, ExternalLink, X, CalendarDays, Clock,
  Ban, RotateCcw, Check, AlertTriangle, History, StickyNote, Quote, ImagePlus, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import {
  CAMINO, DIAS_VENCIDO, SIGUIENTES, SOLO_SUPERVISOR, acentoDe, agenciaDe, alertaDe,
  estadoDe, flagDe, tipoDe, usd,
  type Estado, type Pedido, type PedidoAdjunto, type PedidoEvento,
} from "./types";
import {
  useCatalogos, useFotoCreadora, useMutacionesPedidos, usePedidoAdjuntos,
  usePedidoEventos, usePermisosPersonalizados, urlFirmada,
} from "./usePersonalizados";

interface Props {
  pedido: Pedido | null;
  onClose: () => void;
  onEditar: (p: Pedido) => void;
}

// Defaults ESTABLES para cuando la query está deshabilitada (ficha cerrada):
// un `= []` inline sería un array nuevo por render y, como `adjuntos` es
// dependencia de un efecto que setea estado, giraba en bucle infinito con la
// ficha cerrada (la pestaña se congelaba al tocar cualquier filtro).
const SIN_EVENTOS: PedidoEvento[] = [];
const SIN_ADJUNTOS: PedidoAdjunto[] = [];

// Encabezado de sección: icono + rótulo, y opcionalmente algo a la derecha.
function Titulo({ icono: I, children, extra }: { icono: typeof Paperclip; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <I className="h-3.5 w-3.5 text-muted-foreground/70" />
      <h4 className="text-xs font-semibold text-muted-foreground">{children}</h4>
      {extra ? <div className="ml-auto flex items-center gap-1">{extra}</div> : null}
    </div>
  );
}

// El recorrido del pedido como barra segmentada: se ve de un golpe dónde está
// y cuánto le falta, que es la pregunta que el equipo le hacía al sheet
// leyendo la columna de estado fila por fila.
function Recorrido({ estado }: { estado: Estado }) {
  const actual = CAMINO.indexOf(estado);
  if (actual < 0) return null; // salida lateral: la cuenta la banda de resultado
  // Lo hecho va del color del estado ACTUAL (un pedido entregado se ve como una
  // barra verde entera). Pintar cada paso de su propio color hacía un arcoíris
  // de 5 colores en 6 píxeles: bonito de a uno, ilegible junto.
  const ac = acentoDe(estado);
  return (
    <ol className="mt-4 flex items-end gap-1.5">
      {CAMINO.map((e, i) => (
        <li key={e} className="min-w-0 flex-1">
          <div className={`h-1.5 rounded-full transition-colors ${i <= actual ? ac.punto : "bg-white/10"} ${i < actual ? "opacity-60" : ""}`} />
          <p className={`mt-1.5 truncate text-[10px] ${i === actual ? `font-semibold ${ac.texto}` : i < actual ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
            {estadoDe(e).corto}
          </p>
        </li>
      ))}
    </ol>
  );
}

// Ficha del pedido: todo lo que en el sheet había que leer en una fila de 12
// columnas, más lo que el sheet no podía: recorrido del estado, botones con
// reglas, adjuntos como archivos e historial de quién cambió qué y cuándo.
//
// Es un POPUP centrado (el Dialog de Maven trae el liquid glass: card
// semiopaco + backdrop-blur + ring blanco); acá arriba se le suma el color del
// ESTADO en el degradé del header, la foto de la creadora y el recorrido, para
// que cada pedido se lea distinto y no como una lista de campos grises.
export default function PedidoFicha({ pedido, onClose, onEditar }: Props) {
  const formatoUi = useFormato();
  const fecha = (d: string | null | undefined) => (d ? format(new Date(d.length === 10 ? `${d}T12:00:00` : d), "d MMM yyyy", { locale: formatoUi.fechas }) : "—");
  const { puedeAprobar, puedeGestionar } = usePermisosPersonalizados();
  const { nombreDe } = useCatalogos();
  const { cambiarEstado, editar, borrar, subirAdjunto, borrarAdjunto } = useMutacionesPedidos();
  const { data: eventos = SIN_EVENTOS } = usePedidoEventos(pedido?.id ?? null);
  const { data: adjuntos = SIN_ADJUNTOS } = usePedidoAdjuntos(pedido?.id ?? null);
  const foto = useFotoCreadora(pedido?.creator_id ?? null);

  const [denegando, setDenegando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [notas, setNotas] = useState("");
  const [notasGuardadas, setNotasGuardadas] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [soltando, setSoltando] = useState(false);
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
  const ac = acentoDe(pedido.status);
  const ag = agenciaDe(pedido.agency);
  const tipo = tipoDe(pedido.content_type);
  const precio = pedido.price_usd ?? 0;
  const pagado = pedido.paid_usd ?? 0;
  const saldo = precio - pagado;
  // Reloj del plazo: 7 días avisa, 12 vence. No aplica a pedidos cerrados.
  const alerta = alertaDe(pedido);
  const chatter = pedido.chatter_name || nombreDe(pedido.chatter_id) || "Sin chatter";

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
    try {
      await editar.mutateAsync({ id: pedido.id, patch: { notes: notas.trim() || null } });
      setNotasGuardadas(true);
      window.setTimeout(() => setNotasGuardadas(false), 2500);
    } catch (e) { toast.error("No se pudieron guardar las notas", { description: (e as Error).message }); }
  };
  const subir = async (files: FileList | File[] | null) => {
    if (!files || !("length" in files) || !files.length) return;
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
  const lateral = !!est.lateral;

  return (
    <Dialog open={!!pedido} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="grid max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {/* HEADER: el color del estado tiñe el degradé, la foto de la creadora
            le pone cara al pedido y el recorrido dice en qué va. */}
        <header className={`relative bg-gradient-to-br ${ac.hero} via-transparent to-transparent px-6 pb-5 pt-6`}>
          <div className="flex items-start gap-4">
            <UserAvatar name={pedido.creator_name} src={foto} size="xl" ring className="mt-0.5" />
            <div className="min-w-0 flex-1 pr-8">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={`rounded-full ${est.tono}`}>{est.label}</Badge>
                <Badge variant="outline" className={`rounded-full ${ag.tono}`}>{ag.label}</Badge>
                {tipo && <Badge variant="outline" className="rounded-full">{tipo.emoji} {tipo.label}</Badge>}
                {pedido.sale_channel === "buster" && <Badge variant="outline" className="rounded-full border-orange-500/30 bg-orange-500/15 text-orange-600 dark:text-orange-400">⚡ Hora Buster</Badge>}
                {alerta && (
                  <Badge variant="outline" className={`rounded-full ${alerta.tono}`} title={`El plazo de un personalizado es de ${DIAS_VENCIDO} días.`}>
                    {alerta.nivel === "vencido" ? <AlertTriangle className="mr-1 h-3 w-3" /> : null}
                    {alerta.texto}
                  </Badge>
                )}
              </div>
              <DialogTitle className="truncate text-xl leading-tight">{pedido.creator_name}</DialogTitle>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                para <span className="font-medium text-foreground">@{pedido.fan_handle}</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <UserAvatar name={chatter} size="xs" />
                  {chatter}
                </span>
                <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{fecha(pedido.requested_on)}</span>
                {pedido.due_on && (
                  <span className={`inline-flex items-center gap-1 ${alerta?.nivel === "vencido" ? "font-medium text-destructive" : ""}`}>
                    <Clock className="h-3 w-3" />Entrega {fecha(pedido.due_on)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <Recorrido estado={pedido.status} />
        </header>

        <div className="space-y-5 overflow-y-auto border-t border-white/5 px-6 py-5">
          {/* Salida lateral: por qué se cortó el pedido, con su color. */}
          {lateral && (
            <div className={`flex items-start gap-3 rounded-2xl border border-white/5 px-4 py-3 ${ac.tinte}`}>
              {pedido.status === "denegado" ? <Ban className={`h-5 w-5 shrink-0 ${ac.texto}`} /> : <RotateCcw className={`h-5 w-5 shrink-0 ${ac.texto}`} />}
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${ac.texto}`}>{est.label}</p>
                <p className="text-sm text-muted-foreground">
                  {pedido.denied_reason || (pedido.status === "reembolsado" ? "Se le devolvió la plata al fan." : "Sin motivo anotado.")}
                </p>
              </div>
            </div>
          )}

          {denegando && (
            <div className="space-y-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <Label className="text-xs">Motivo (lo ve el chatter)</Label>
              <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué no se hace este pedido" />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setDenegando(false)}>Cancelar</Button>
                <Button size="sm" variant="destructive" onClick={() => void confirmarDenegar()} disabled={cambiarEstado.isPending}>Denegar pedido</Button>
              </div>
            </div>
          )}

          {/* QUÉ PIDIÓ — es el corazón de la ficha, así que va en un card
              propio y con cuerpo de texto legible, no en letra chica. */}
          <section>
            <Titulo icono={Quote}>Qué pidió</Titulo>
            <div className="rounded-2xl border border-white/5 bg-background/40 p-4">
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{pedido.description}</p>
              {pedido.duration_or_qty && (
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />{pedido.duration_or_qty}
                </span>
              )}
            </div>
          </section>

          {/* PLATA — el precio manda; el resto acompaña. */}
          <section>
            <Titulo icono={Wallet}>Plata</Titulo>
            <div className="rounded-2xl border border-white/5 bg-background/40 p-4">
              <div className="grid grid-cols-3 divide-x divide-white/5">
                {[
                  { l: "Precio", v: usd(pedido.price_usd), grande: true },
                  { l: "Pagado", v: usd(pedido.paid_usd) },
                  { l: "Gasto del fan", v: usd(pedido.fan_total_spent_usd) },
                ].map((k) => (
                  <div key={k.l} className="px-4 first:pl-0 last:pr-0">
                    <p className="text-xs text-muted-foreground">{k.l}</p>
                    <p className={`tabular-nums ${k.grande ? "text-2xl font-semibold leading-tight" : "mt-0.5 text-base font-medium"}`}>{k.v}</p>
                  </div>
                ))}
              </div>
              {/* La barra de cobro no aplica a un pedido que se cortó: de un
                  denegado nadie espera cobrar el saldo. */}
              {precio > 0 && pedido.paid_usd != null && !lateral && (
                <div className="mt-4">
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${saldo > 0 ? "bg-warning" : "bg-success/80"}`}
                      style={{ width: `${Math.min(100, Math.round((pagado / precio) * 100))}%` }}
                    />
                  </div>
                  <p className={`mt-1.5 text-[11px] ${saldo > 0 ? "text-warning" : "text-muted-foreground"}`}>
                    {saldo > 0 ? `Falta cobrar ${usd(saldo)} de ${usd(precio)}` : "Cobrado completo"}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* AVISOS (los "amarillos" del sheet) */}
          {pedido.flags.length > 0 && (
            <section className="space-y-1.5 rounded-2xl border border-warning/20 bg-warning/5 px-4 py-3">
              {pedido.flags.map((f) => (
                <p key={f} className="flex items-start gap-2 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{flagDe(f)}
                </p>
              ))}
            </section>
          )}

          {/* ADJUNTOS — se puede soltar archivos encima, no solo elegirlos. */}
          <section
            onDragOver={(e) => { e.preventDefault(); setSoltando(true); }}
            onDragLeave={() => setSoltando(false)}
            onDrop={(e) => { e.preventDefault(); setSoltando(false); void subir(e.dataTransfer.files); }}
          >
            <Titulo
              icono={Paperclip}
              extra={
                <>
                  <select value={kindSubida} onChange={(e) => setKindSubida(e.target.value as "referencia" | "entrega")}
                    className="h-7 rounded-full border-0 bg-white/5 px-2 text-xs">
                    <option value="referencia">Referencia</option>
                    <option value="entrega">Entrega</option>
                  </select>
                  <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void subir(e.target.files)} />
                  <Button size="sm" variant="outline" className="h-7 gap-1 rounded-full text-xs" onClick={() => fileRef.current?.click()} disabled={subirAdjunto.isPending}>
                    {subirAdjunto.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />} Subir
                  </Button>
                </>
              }
            >
              Adjuntos
            </Titulo>
            {adjuntos.length === 0 ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed py-7 transition-colors ${soltando ? "border-primary bg-primary/10" : "border-white/15 bg-background/20 hover:border-primary/40 hover:bg-white/5"}`}
              >
                <ImagePlus className="h-5 w-5 text-muted-foreground/70" />
                <span className="text-xs text-muted-foreground">Suelta los archivos aquí o haz clic para elegirlos</span>
                <span className="text-[11px] text-muted-foreground/60">Las referencias del fan y la entrega de la creadora</span>
              </button>
            ) : (
              <div className={`grid grid-cols-3 gap-2 rounded-2xl transition-colors ${soltando ? "bg-primary/10 ring-1 ring-primary" : ""}`}>
                {adjuntos.map((a) => {
                  const u = urls[a.id];
                  const esImg = a.mime_type?.startsWith("image/");
                  return (
                    <div key={a.id} className="group relative aspect-square overflow-hidden rounded-xl border border-white/5 bg-background/40">
                      {esImg && u ? (
                        <img src={u} alt={a.file_name} className="h-full w-full object-cover transition-transform duration-300 group-" />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
                          <Paperclip className="h-4 w-4 text-muted-foreground" />
                          <span className="max-w-full truncate text-[10px] text-muted-foreground">{a.file_name}</span>
                        </div>
                      )}
                      <span className={`absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium backdrop-blur-sm ${a.kind === "entrega" ? "bg-success/80 text-success-foreground" : "bg-black/55 text-white"}`}>
                        {a.kind === "entrega" ? "Entrega" : "Ref."}
                      </span>
                      <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                        {u && <a href={u} target="_blank" rel="noopener noreferrer" title="Abrir" className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"><ExternalLink className="h-3 w-3" /></a>}
                        <button type="button" title="Quitar" onClick={() => void quitarAdjunto(a)} className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white hover:bg-destructive"><X className="h-3 w-3" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* NOTAS */}
          <section>
            <Titulo
              icono={StickyNote}
              extra={notasGuardadas ? <span className="inline-flex items-center gap-1 text-[11px] text-success"><Check className="h-3 w-3" />Guardado</span> : null}
            >
              Notas internas
            </Titulo>
            <Textarea
              rows={3}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              onBlur={() => void guardarNotas()}
              placeholder="Lo que el equipo tenga que saber de este pedido. Se guarda al salir del campo."
              className="resize-none rounded-2xl border-white/5 bg-background/40"
            />
          </section>

          {/* HISTORIAL como línea de tiempo: el punto toma el color del estado
              al que pasó, así el recorrido se lee también hacia atrás. */}
          <section>
            <Titulo icono={History}>Historial</Titulo>
            {eventos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin movimientos todavía.</p>
            ) : (
              <ol className="relative space-y-3 pl-5 before:absolute before:bottom-1.5 before:left-[5px] before:top-1.5 before:w-px before:bg-white/10">
                {eventos.map((ev) => (
                  <li key={ev.id} className="relative text-xs">
                    <span className={`absolute -left-5 top-1 h-2.5 w-2.5 rounded-full ring-2 ring-card ${acentoDe(ev.to_status).punto}`} />
                    <span className="font-medium">{nombreDe(ev.actor_id) ?? (ev.actor_id ? "Alguien" : "Sistema")}</span>
                    {" "}{ev.from_status ? `pasó de ${estadoDe(ev.from_status).label} a ` : "creó el pedido como "}
                    <span className={`font-medium ${acentoDe(ev.to_status).texto}`}>{estadoDe(ev.to_status).label}</span>
                    {ev.note && <span className="text-muted-foreground"> — {ev.note}</span>}
                    <span className="text-muted-foreground"> · {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true, locale: formatoUi.fechas })}</span>
                  </li>
                ))}
              </ol>
            )}
            {pedido.source === "sheet" && (
              <p className="mt-2 text-[11px] text-muted-foreground/70">Importado del sheet{pedido.source_ref ? ` (${pedido.source_ref})` : ""}.</p>
            )}
          </section>
        </div>

        {/* PIE fijo: la acción que sigue siempre a la vista, sin scrollear. */}
        <footer className="flex items-center gap-1 border-t border-white/10 bg-card/80 px-4 py-3 backdrop-blur-xl">
          <Button variant="ghost" size="sm" className="gap-1.5 rounded-full text-muted-foreground hover:text-foreground" onClick={() => onEditar(pedido)}>
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>
          {puedeGestionar && (
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive" onClick={() => setBorrando(true)} title="Eliminar pedido">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {!puedeAprobar && pedido.status === "solicitado" && (
              <p className="text-[11px] text-muted-foreground">Esperando aprobación de un supervisor.</p>
            )}
            {siguientes.map((s) => {
              const e = estadoDe(s);
              const destructivo = s === "denegado" || s === "reembolsado";
              return (
                <Button key={s} size="sm" variant={destructivo ? "outline" : "default"}
                  className={`rounded-full ${destructivo ? "border-destructive/40 text-destructive hover:bg-destructive/10" : ""}`}
                  disabled={cambiarEstado.isPending} onClick={() => void mover(s)}>
                  {cambiarEstado.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  {s === "denegado" ? "Denegar" : s === "reembolsado" ? "Marcar reembolso" : `Pasar a ${e.label}`}
                </Button>
              );
            })}
          </div>
        </footer>

        <AlertDialog open={borrando} onOpenChange={setBorrando}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar este pedido?</AlertDialogTitle>
              <AlertDialogDescription>Se borra con su historial y adjuntos. Si solo no se va a hacer, mejor denegarlo: queda el registro.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel />
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async (e) => { e.preventDefault(); try { await borrar.mutateAsync(pedido.id); toast.success("Pedido eliminado"); onClose(); } catch (err) { toast.error("No se pudo eliminar", { description: (err as Error).message }); } }}>
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
