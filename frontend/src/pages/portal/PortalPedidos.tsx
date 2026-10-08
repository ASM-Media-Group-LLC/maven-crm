import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Ban, CalendarClock, Check, FileText, Hammer, Image as ImageIcon, Loader2, Upload } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import { useToast } from "@/hooks/use-toast";
import { usePortal } from "@/hooks/usePortal";
import { useAccionesDelPortal, useSubidas } from "@/hooks/usePortalContenido";
import {
  codigoDeError, type EstadoDelPedido, type PedidoDelPortal, porHacer, useAccionesDePedidos, usePedidosDelPortal,
} from "@/hooks/usePortalPedidos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// PEDIDOS: los personalizados de la creadora (fase 3 del portal; decisiones de
// Jhon, 06/10). Los ve apenas el chatter los crea («Por aprobar» mientras su
// agencia los revisa) y desde aquí:
//   · «Lo empiezo», cuando ya está aprobado;
//   · «Subir entrega»: va a SU Drive (carpeta «Personalizados») con la cola de
//     subidas del portal, y al terminar se ata al pedido;
//   · «No puedo hacerlo», con el motivo (lo resuelve su agencia).
// Ve el fan, el precio, la descripción, las fechas y las referencias. Celular
// primero.

const ESTADO: Record<EstadoDelPedido, { clave: TranslationKey; tono: string }> = {
  solicitado: { clave: "portal.pedidos.estado.solicitado", tono: "bg-warning/15 text-warning" },
  aprobado: { clave: "portal.pedidos.estado.aprobado", tono: "bg-primary/15 text-primary" },
  en_produccion: { clave: "portal.pedidos.estado.en_produccion", tono: "bg-primary/15 text-primary" },
  listo: { clave: "portal.pedidos.estado.listo", tono: "bg-success/15 text-success" },
  entregado: { clave: "portal.pedidos.estado.entregado", tono: "bg-success/15 text-success" },
  no_puede: { clave: "portal.pedidos.estado.no_puede", tono: "bg-muted text-muted-foreground" },
  denegado: { clave: "portal.pedidos.estado.cancelado", tono: "bg-muted text-muted-foreground" },
  reembolsado: { clave: "portal.pedidos.estado.cancelado", tono: "bg-muted text-muted-foreground" },
};

const TIPO: Record<string, TranslationKey> = {
  foto: "portal.pedidos.tipo.foto",
  video: "portal.pedidos.tipo.video",
  audio: "portal.pedidos.tipo.audio",
  articulo: "portal.pedidos.tipo.articulo",
};

const ERROR: Record<string, TranslationKey> = {
  por_aprobar: "portal.pedidos.error.por_aprobar",
  no_se_puede: "portal.pedidos.error.no_se_puede",
  falta_motivo: "portal.pedidos.error.falta_motivo",
  archivo_invalido: "portal.pedidos.error.archivo_invalido",
  no_existe: "portal.pedidos.error.no_existe",
  no_es_tuyo: "portal.pedidos.error.no_existe",
};

export default function PortalPedidos() {
  const { t } = useLanguage();
  const { activa } = usePortal();
  const pedidos = usePedidosDelPortal(activa.creator_id);
  const [params, setParams] = useSearchParams();
  const resaltado = params.get("p");

  const lista = pedidos.data ?? [];
  const pendientes = porHacer(lista);
  const historial = lista.filter((p) => !pendientes.includes(p));
  // Un aviso de la campana trae ?p=: se abre la pestaña donde está y se lo muestra.
  const [pestana, setPestana] = useState<"por_hacer" | "historial">("por_hacer");
  useEffect(() => {
    if (!resaltado || !pedidos.data) return;
    if (historial.some((p) => p.id === resaltado)) setPestana("historial");
    const t = window.setTimeout(() => document.getElementById(`pedido-${resaltado}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resaltado, pedidos.data]);

  const mostrados = pestana === "por_hacer" ? pendientes : historial;

  return (
    <Page>
      <PageHeader title={t("portal.pedidos.titulo")} subtitle={t("portal.pedidos.subtitulo")} />

      <div role="tablist" aria-label={t("portal.pedidos.titulo")} className="mt-5 flex gap-2">
        {([["por_hacer", "portal.pedidos.porHacer", pendientes.length], ["historial", "portal.pedidos.historial", historial.length]] as const).map(([id, clave, n]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pestana === id}
            onClick={() => { setPestana(id); if (resaltado) setParams({}, { replace: true }); }}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              pestana === id ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {t(clave)}
            <span className="tabular-nums text-xs opacity-80">{n}</span>
          </button>
        ))}
      </div>

      <div className="mt-5">
        {pedidos.isLoading ? (
          <div className="grid gap-4 xl:grid-cols-2"><Skeleton className="h-56 rounded-card" /><Skeleton className="h-56 rounded-card" /></div>
        ) : pedidos.isError ? (
          <div className="rounded-card border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {t("portal.pedidos.errorCargar")}
            <div className="mt-3"><Button variant="outline" size="sm" onClick={() => pedidos.refetch()}>{t("portal.shell.reintentar")}</Button></div>
          </div>
        ) : mostrados.length === 0 ? (
          <div className="rounded-card border border-dashed border-border p-8 text-center">
            <p className="font-medium">{t(pestana === "por_hacer" ? "portal.pedidos.vacioTitulo" : "portal.pedidos.vacioHistorial")}</p>
            {pestana === "por_hacer" && <p className="mt-1 text-sm text-muted-foreground">{t("portal.pedidos.vacioTexto")}</p>}
          </div>
        ) : (
          <div className="grid items-start gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {mostrados.map((p) => <TarjetaDePedido key={p.id} pedido={p} resaltado={p.id === resaltado} />)}
          </div>
        )}
      </div>
    </Page>
  );
}

function TarjetaDePedido({ pedido: p, resaltado }: { pedido: PedidoDelPortal; resaltado: boolean }) {
  const { t } = useLanguage();
  const f = useFormato();
  const { toast } = useToast();
  const { activa } = usePortal();
  const acciones = useAccionesDePedidos(activa.creator_id);
  const contenido = useAccionesDelPortal(activa.creator_id);
  const subidas = useSubidas();
  const archivos = useRef<HTMLInputElement>(null);
  const [rechazando, setRechazando] = useState(false);

  const fecha = (d: string | null) => d
    ? new Intl.DateTimeFormat(f.intl(), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`))
    : null;
  const precio = p.precio_usd != null
    ? new Intl.NumberFormat(f.intl(), { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(p.precio_usd)
    : null;
  const abierto = ["solicitado", "aprobado", "en_produccion"].includes(p.estado);
  const vencido = abierto && !!p.para_el && p.para_el < new Date().toISOString().slice(0, 10);
  const subiendo = subidas.subidas.filter((s) => s.pedido === p.id && ["esperando", "subiendo", "reintentando", "sin_internet"].includes(s.estado));
  // Un estado que esta pantalla no conoce (uno nuevo de la base) no la rompe.
  const estado = ESTADO[p.estado] ?? ESTADO.denegado;

  const avisarError = (e: unknown) => toast({ title: t(ERROR[codigoDeError(e)] ?? "portal.pedidos.error.generico"), variant: "destructive" });

  const subir = async (lista: FileList | null) => {
    const elegidos = Array.from(lista ?? []);
    if (!elegidos.length) return;
    try {
      const carpeta = await acciones.carpeta();
      subidas.agregar(elegidos, carpeta, activa.creator_id, {
        pedido: p.id,
        hacer: (itemId) => acciones.entregar(p.id, itemId),
      });
      toast({ title: t("portal.pedidos.subiendo", { n: elegidos.length }) });
    } catch (e) {
      avisarError(e);
    }
  };

  const abrirReferencia = async (id: string) => {
    try { window.open(await acciones.referencia(id), "_blank", "noopener"); } catch (e) { avisarError(e); }
  };
  const abrirEntrega = async (itemId: string) => {
    try { window.open(await contenido.abrir(itemId), "_blank", "noopener"); } catch (e) { avisarError(e); }
  };

  return (
    <article
      id={`pedido-${p.id}`}
      className={cn(
        "rounded-card border bg-card p-4 transition-shadow md:p-5",
        resaltado ? "border-primary ring-2 ring-primary/40" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {/* La cantidad ya dice el tipo («3 fotos»); si no hay, el tipo solo. */}
            {p.cantidad || (p.tipo && TIPO[p.tipo] ? t(TIPO[p.tipo]) : t("portal.pedidos.personalizado"))}
          </p>
          <h2 className="mt-0.5 truncate text-base font-semibold">{t("portal.pedidos.para", { fan: p.fan })}</h2>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", estado.tono)}>{t(estado.clave)}</span>
      </div>

      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{p.descripcion}</p>

      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        {precio && (
          <div>
            <dt className="text-xs text-muted-foreground">{t("portal.pedidos.precio")}</dt>
            <dd className="font-semibold tabular-nums">{precio}</dd>
          </div>
        )}
        {p.para_el && (
          <div>
            <dt className="text-xs text-muted-foreground">{t("portal.pedidos.paraEl")}</dt>
            <dd className={cn("flex items-center gap-1 font-medium", vencido && "text-destructive")}>
              {vencido && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
              {/* ::first-letter no corre en un flex: va en un inline-block. */}
              <span className="inline-block first-letter:uppercase">{fecha(p.para_el)}</span>
            </dd>
          </div>
        )}
      </dl>

      {p.por_aprobar && (
        <p className="mt-4 flex items-start gap-2 rounded-panel bg-warning/10 px-3 py-2 text-xs text-foreground">
          <CalendarClock className="mt-px h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          {t("portal.pedidos.porAprobarTexto")}
        </p>
      )}
      {p.estado === "no_puede" && p.motivo && (
        <p className="mt-4 rounded-panel bg-muted px-3 py-2 text-xs text-muted-foreground">
          {t("portal.pedidos.tuMotivo", { motivo: p.motivo.replace(/[\s.]+$/, "") })}
        </p>
      )}

      {p.referencias.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground">{t("portal.pedidos.referencias")}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {p.referencias.map((a) => (
              <button key={a.id} type="button" onClick={() => void abrirReferencia(a.id)} className={CHIP}>
                {a.mime?.startsWith("image/") ? <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                <span className="truncate">{a.nombre}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {(p.entregas.length > 0 || subiendo.length > 0) && (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground">{t("portal.pedidos.tusEntregas")}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {p.entregas.map((a) => (
              <button key={a.id} type="button" onClick={() => a.drive_item_id && void abrirEntrega(a.drive_item_id)} className={CHIP}>
                <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                <span className="truncate">{a.nombre}</span>
              </button>
            ))}
            {subiendo.map((s) => (
              <span key={s.clave} className={cn(CHIP, "cursor-default")}>
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                <span className="truncate">{s.nombre}</span>
                <span className="tabular-nums text-muted-foreground">{s.size ? Math.round((s.enviado / s.size) * 100) : 0}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {(p.se_puede_empezar || p.se_puede_entregar || p.se_puede_rechazar) && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
          {p.se_puede_empezar && (
            <Button className="min-h-11" disabled={acciones.empezar.isPending}
              onClick={() => acciones.empezar.mutate(p.id, { onError: avisarError, onSuccess: () => toast({ title: t("portal.pedidos.empezado") }) })}>
              {acciones.empezar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Hammer className="mr-2 h-4 w-4" aria-hidden="true" />}
              {t("portal.pedidos.empezar")}
            </Button>
          )}
          {p.se_puede_entregar && (
            <>
              <input ref={archivos} type="file" multiple className="hidden" onChange={(e) => { void subir(e.target.files); e.target.value = ""; }} />
              <Button variant={p.se_puede_empezar ? "outline" : "default"} className={cn("min-h-11", p.se_puede_empezar && "border-border")}
                onClick={() => archivos.current?.click()}>
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                {t(p.entregas.length ? "portal.pedidos.subirOtra" : "portal.pedidos.subirEntrega")}
              </Button>
            </>
          )}
          {p.se_puede_rechazar && (
            <Button variant="ghost" className="min-h-11 text-muted-foreground" onClick={() => setRechazando(true)}>
              <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("portal.pedidos.noPuedo")}
            </Button>
          )}
        </div>
      )}

      {rechazando && <NoPuedo pedido={p} onCerrar={() => setRechazando(false)} />}
    </article>
  );
}

const CHIP = "inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** «No puedo hacerlo»: el motivo es obligatorio. Lo lee su agencia, que decide. */
function NoPuedo({ pedido, onCerrar }: { pedido: PedidoDelPortal; onCerrar: () => void }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { activa } = usePortal();
  const acciones = useAccionesDePedidos(activa.creator_id);
  const [motivo, setMotivo] = useState("");
  const listo = motivo.trim().length >= 5;
  const id = useMemo(() => `motivo-${pedido.id}`, [pedido.id]);

  const confirmar = () => {
    acciones.noPuede.mutate({ pedido: pedido.id, motivo: motivo.trim() }, {
      onSuccess: () => { toast({ title: t("portal.pedidos.noPuedoListo") }); onCerrar(); },
      onError: (e) => toast({ title: t(ERROR[codigoDeError(e)] ?? "portal.pedidos.error.generico"), variant: "destructive" }),
    });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("portal.pedidos.noPuedoTitulo")}</DialogTitle>
          <DialogDescription>{t("portal.pedidos.noPuedoTexto", { fan: pedido.fan })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={id}>{t("portal.pedidos.motivo")}</Label>
          <Textarea id={id} rows={4} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder={t("portal.pedidos.motivoEjemplo")} className="text-base" />
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" className="min-h-11" onClick={onCerrar}>{t("portal.pedidos.volver")}</Button>
          <Button className="min-h-11" disabled={!listo || acciones.noPuede.isPending} onClick={confirmar}>
            {acciones.noPuede.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t("portal.pedidos.noPuedoConfirmar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
