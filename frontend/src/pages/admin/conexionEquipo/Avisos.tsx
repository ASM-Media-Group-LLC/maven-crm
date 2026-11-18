import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BellRing, Check, KeyRound, Loader2, Pause, Play, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import {
  EVENTOS_EQUIPO, PRUEBA_CADA_MS, eventosDeLaLlave, TEXTO_EVENTO, accionesDe, eventosParaCrear, llaveDelEquipo, normalizarUrl,
  semaforoDe, textoDeLaEntrega, textoDelDetenido,
  type EntregaEquipo, type Semaforo, type WebhookEquipo,
} from "@/lib/conexionEquipo/webhook";
import { textoDelErrorRpc } from "@/lib/conexionEquipo/errores";
import { ConFormato, CopyButton } from "../apiKeysPiezas";
import { Bloque, Cargando, Fallo, Nota } from "./piezas";
import {
  CLAVE, cambiarWebhook, crearWebhook, probarWebhook, useEntregas, useLlaves, useWebhooksEquipo, type LlaveApi,
} from "./datos";

// 6. Avisos a tu plataforma: el webhook del EQUIPO, un sistema aparte de los webhooks
// del Messenger (Ajustes → API keys). Uno por llave con equipo:write; lo registran,
// prueban, pausan y borran el dueño o un admin (la base lo exige en cada RPC). El
// secreto de firma se ve UNA vez, al registrar, y vive solo en la memoria de esta
// sección hasta que se toca «Ya lo guardé». Ver lib/conexionEquipo/webhook.ts.

const VARIANTE: Record<Semaforo["tono"], "success-soft" | "warning-soft" | "destructive-soft" | "secondary-soft"> = {
  bien: "success-soft", ojo: "warning-soft", mal: "destructive-soft", apagado: "secondary-soft",
};

function useFecha() {
  const f = useFormato();
  return (d: string | null) =>
    d ? new Date(d).toLocaleString(f.intl("es-CO"), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-control border border-border/40 bg-background/30 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="min-w-0 text-sm [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/** El secreto, UNA vez, con copiar. Como la key recién creada en API keys. */
function SecretoUnaVez({ secreto, onListo }: { secreto: string; onListo: () => void }) {
  const { t } = useLanguage();
  return (
    <div role="status" className="flex flex-col gap-3 rounded-panel border border-success/30 bg-success/5 p-3 sm:p-4">
      <p className="flex items-center gap-2 text-sm font-semibold"><Check className="h-4 w-4 text-success" />{t("conexionEquipo.wh.secreto.titulo")}</p>
      <p className="text-sm text-muted-foreground">{t("conexionEquipo.wh.secreto.cuerpo")}</p>
      <div className="rounded-control border border-primary/40 bg-background/60 p-3">
        <code className="block break-all font-mono text-sm text-foreground" data-secreto>{secreto}</code>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <CopyButton text={secreto} label={t("conexionEquipo.wh.secreto.copiar")} />
        <Button type="button" size="sm" onClick={onListo}>{t("conexionEquipo.wh.secreto.listo")}</Button>
      </div>
    </div>
  );
}

function Alta({ llave, onCreado }: { llave: LlaveApi; onCreado: (secreto: string) => void }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const posibles = eventosDeLaLlave(llave.scopes);
  const [eventos, setEventos] = useState<string[]>(() => [...posibles]);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const href = normalizarUrl(url);
  const urlMala = url.trim() !== "" && !href;
  const puede = !!href && eventos.length > 0 && !creando;

  const registrar = async () => {
    if (!href || creando) return;
    setCreando(true);
    setError(null);
    try {
      // Sin react-query a propósito: la respuesta trae el secreto y no tiene que
      // quedar en ninguna caché. Va a la sección y de ahí, a la pantalla UNA vez.
      const { secreto, ...w } = await crearWebhook(llave.id, href, eventosParaCrear(eventos));
      qc.setQueryData<WebhookEquipo[]>(CLAVE.webhooks, (antes) => [...(antes ?? []).filter((x) => x.id !== w.id), w]);
      void qc.invalidateQueries({ queryKey: CLAVE.webhooks }).then(() => {}, () => {});
      toast.success(t("conexionEquipo.wh.ok.registrado"));
      setUrl("");
      onCreado(secreto);
    } catch (e) {
      setError(textoDelErrorRpc(e, t));
    } finally {
      setCreando(false);
    }
  };

  const alternar = (e: string) => setEventos((antes) => (antes.includes(e) ? antes.filter((x) => x !== e) : [...antes, e]));

  return (
    <div className="flex flex-col gap-4 rounded-panel border border-border/50 bg-background/30 p-3 sm:p-4">
      <div>
        <h3 className="text-sm font-semibold">{t("conexionEquipo.wh.alta.titulo")}</h3>
        <p className="text-sm text-muted-foreground"><ConFormato texto={t("conexionEquipo.webhook.intro")} /></p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="aviso-url">{t("conexionEquipo.wh.alta.url")}</Label>
        <Input id="aviso-url" type="url" inputMode="url" autoComplete="off" spellCheck={false} value={url}
          placeholder={t("conexionEquipo.wh.alta.urlEjemplo")} disabled={creando} aria-invalid={urlMala}
          onChange={(e) => { setUrl(e.target.value); setError(null); }} />
        <p className={`text-xs ${urlMala ? "text-destructive" : "text-muted-foreground"}`}>
          {urlMala ? t("conexionEquipo.wh.alta.urlMala") : t("conexionEquipo.wh.alta.urlAyuda")}
        </p>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">{t("conexionEquipo.wh.alta.eventos")}</legend>
        {posibles.map((e) => (
          <label key={e} className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={eventos.includes(e)} disabled={creando}
              onChange={() => alternar(e)} />
            <span className="min-w-0">
              <code className="rounded-control bg-muted px-1.5 py-0.5 text-[11px]">{e}</code>
              <span className="block text-xs text-muted-foreground">{t(TEXTO_EVENTO[e])}</span>
            </span>
          </label>
        ))}
        {eventos.length === 0 && <p className="text-xs text-destructive">{t("conexionEquipo.wh.alta.sinEventos")}</p>}
      </fieldset>
      {error && <p role="alert" className="rounded-control border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button type="button" className="gap-1.5" disabled={!puede} onClick={() => void registrar()}>
          {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
          {t("conexionEquipo.wh.alta.boton")}
        </Button>
      </div>
    </div>
  );
}

function FilaEntrega({ e }: { e: EntregaEquipo }) {
  const { t } = useLanguage();
  const fecha = useFecha();
  const estado = textoDeLaEntrega(e, t);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-border/40 bg-background/30 px-3 py-2 text-sm">
      <code className="rounded-control bg-muted px-1.5 py-0.5 text-[11px]">{e.evento}</code>
      <Badge variant={VARIANTE[estado.tono]} className="font-normal">{estado.texto}</Badge>
      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
        {fecha(e.created_at)}{e.latency_ms !== null ? ` · ${e.latency_ms} ms` : ""}
      </span>
    </li>
  );
}

function Entregas({ id }: { id: string }) {
  const { t } = useLanguage();
  const q = useEntregas(id, true);
  if (q.isLoading) return <Cargando />;
  if (q.isError || !q.data) return <Fallo onReintentar={() => void q.refetch()} detalle={(q.error as Error | null)?.message} />;
  if (q.data.length === 0) return <Nota>{t("conexionEquipo.wh.entregas.vacio")}</Nota>;
  return <ul className="flex flex-col gap-1.5">{q.data.map((e) => <FilaEntrega key={e.id} e={e} />)}</ul>;
}

type Confirmar = "pausar" | "borrar" | null;

function Tarjeta({ w, llave }: { w: WebhookEquipo; llave: LlaveApi | null }) {
  const { t } = useLanguage();
  const fecha = useFecha();
  const qc = useQueryClient();
  const [confirmar, setConfirmar] = useState<Confirmar>(null);
  const [ocupado, setOcupado] = useState<null | "probar" | "pausar" | "reanudar" | "borrar">(null);
  const [verEntregas, setVerEntregas] = useState(false);
  const [ultimaPrueba, setUltimaPrueba] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const sem = semaforoDe(w);
  const puede = accionesDe(w);
  const espera = ultimaPrueba ? Math.max(0, Math.ceil((PRUEBA_CADA_MS - (ahora - ultimaPrueba)) / 1000)) : 0;

  // Mientras corre la espera entre pruebas, el botón cuenta los segundos.
  useEffect(() => {
    if (!espera) return;
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [espera]);

  const releer = () => { void qc.invalidateQueries({ queryKey: CLAVE.webhooks }).then(() => {}, () => {}); };

  const hacer = async (accion: "probar" | "pausar" | "reanudar" | "borrar") => {
    if (ocupado) return;
    setOcupado(accion);
    try {
      if (accion === "probar") {
        await probarWebhook(w.id);
        setUltimaPrueba(Date.now());
        setAhora(Date.now());
        setVerEntregas(true);
        void qc.invalidateQueries({ queryKey: CLAVE.entregas(w.id) }).then(() => {}, () => {});
        toast.success(t("conexionEquipo.wh.ok.prueba"));
      } else {
        await cambiarWebhook(w.id, accion);
        setConfirmar(null);
        toast.success(t(accion === "pausar" ? "conexionEquipo.wh.ok.pausado" : accion === "reanudar" ? "conexionEquipo.wh.ok.reanudado" : "conexionEquipo.wh.ok.borrado"));
        if (accion === "borrar") qc.setQueryData<WebhookEquipo[]>(CLAVE.webhooks, (antes) => (antes ?? []).filter((x) => x.id !== w.id));
      }
    } catch (e) {
      toast.error(textoDelErrorRpc(e, t));
      if (accion === "probar") setUltimaPrueba(Date.now());
    } finally {
      setOcupado(null);
      releer();
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-panel border border-border/50 bg-background/30 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/60 text-muted-foreground">
            <KeyRound className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{llave?.name ?? w.url_host}</div>
            <div className="text-xs text-muted-foreground">{t("conexionEquipo.avisos.quien")}</div>
          </div>
        </div>
        <Badge variant={VARIANTE[sem.tono]} className="font-medium">{t(sem.texto)}</Badge>
      </div>

      {w.status === "disabled" && <Nota tono="ojo"><ConFormato texto={textoDelDetenido(w.disabled_reason, t)} /></Nota>}

      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Dato etiqueta={t("conexionEquipo.wh.dato.direccion")}><code className="text-xs">{w.url_host}</code></Dato>
        <Dato etiqueta={t("conexionEquipo.wh.dato.secreto")}><code className="text-xs">whsec_…{w.secret_last4}</code></Dato>
        <Dato etiqueta={t("conexionEquipo.wh.dato.avisos")}>
          <span className="flex flex-wrap gap-1">
            {w.eventos.map((e) => <code key={e} className="rounded-control bg-muted px-1.5 py-0.5 text-[11px]">{e}</code>)}
          </span>
        </Dato>
        <Dato etiqueta={t("conexionEquipo.wh.dato.ultimaEntrega")}>{fecha(w.last_success_at) ?? t("conexionEquipo.wh.todavia")}</Dato>
        <Dato etiqueta={t("conexionEquipo.wh.dato.ultimoIntento")}>
          {fecha(w.last_attempt_at) ?? t("conexionEquipo.wh.todavia")}
          {(w.last_status_code || w.last_error) && (
            <span className={`block text-xs ${w.consecutive_failures > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {[w.last_status_code, w.last_error].filter(Boolean).join(" · ")}
            </span>
          )}
        </Dato>
        {w.consecutive_failures > 0 ? (
          <Dato etiqueta={t("conexionEquipo.wh.dato.fallas")}>
            {w.failing_since
              ? t("conexionEquipo.wh.dato.fallasDesde", { n: w.consecutive_failures, fecha: fecha(w.failing_since) ?? "" })
              : w.consecutive_failures}
          </Dato>
        ) : (
          <Dato etiqueta={t("conexionEquipo.wh.dato.porSalir")}><span className="tabular-nums">{w.pendientes}</span></Dato>
        )}
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={!puede.probar || !!ocupado || espera > 0}
          onClick={() => void hacer("probar")}>
          {ocupado === "probar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {espera > 0 ? t("conexionEquipo.wh.probarEspera", { s: espera }) : t("conexionEquipo.wh.probar")}
        </Button>
        {puede.pausar && (
          <Button type="button" size="sm" variant="ghost" className="gap-1.5" disabled={!!ocupado} onClick={() => setConfirmar("pausar")}>
            <Pause className="h-4 w-4" />{t("conexionEquipo.wh.pausar")}
          </Button>
        )}
        {puede.reanudar && (
          <Button type="button" size="sm" variant="ghost" className="gap-1.5" disabled={!!ocupado} onClick={() => void hacer("reanudar")}>
            {ocupado === "reanudar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{t("conexionEquipo.wh.reanudar")}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" disabled={!!ocupado}
          onClick={() => setConfirmar("borrar")}>
          <Trash2 className="h-4 w-4" />{t("conexionEquipo.wh.borrar")}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="sm:ml-auto" aria-expanded={verEntregas}
          onClick={() => setVerEntregas((v) => !v)}>
          {verEntregas ? t("conexionEquipo.wh.entregas.ocultar") : t("conexionEquipo.wh.entregas.ver")}
        </Button>
      </div>

      {confirmar && (
        <div role="alertdialog" aria-labelledby="confirmar-aviso"
          className={`flex flex-col gap-3 rounded-panel border p-3 sm:p-4 ${confirmar === "borrar" ? "border-destructive/40 bg-destructive/5" : "border-warning/40 bg-warning/5"}`}>
          <p id="confirmar-aviso" className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className={`h-4 w-4 ${confirmar === "borrar" ? "text-destructive" : "text-warning"}`} />
            {t(confirmar === "borrar" ? "conexionEquipo.wh.confirmar.borrar.titulo" : "conexionEquipo.wh.confirmar.pausar.titulo")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t(confirmar === "borrar" ? "conexionEquipo.wh.confirmar.borrar.cuerpo" : "conexionEquipo.wh.confirmar.pausar.cuerpo")}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={!!ocupado} onClick={() => setConfirmar(null)}>{t("common.cancel")}</Button>
            {/* bg-none: el botón de Maven es un degradé y taparía el rojo. */}
            <Button type="button" size="sm" disabled={!!ocupado} onClick={() => void hacer(confirmar)}
              className={`gap-1.5 ${confirmar === "borrar" ? "bg-none bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}`}>
              {ocupado === confirmar && <Loader2 className="h-4 w-4 animate-spin" />}
              {t(confirmar === "borrar" ? "conexionEquipo.wh.confirmar.borrar.si" : "conexionEquipo.wh.confirmar.pausar.si")}
            </Button>
          </div>
        </div>
      )}

      {verEntregas && (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-medium text-muted-foreground">{t("conexionEquipo.wh.entregas.titulo")}</h4>
          <Entregas id={w.id} />
        </div>
      )}
    </div>
  );
}

export function Avisos() {
  const { t } = useLanguage();
  const llaves = useLlaves();
  const webhooks = useWebhooksEquipo();
  const conWebhook = new Set((webhooks.data ?? []).map((w) => w.api_key_id));
  const { llave, activa } = llaveDelEquipo(llaves.data?.keys ?? [], conWebhook);
  const w = llave ? webhooks.data?.find((x) => x.api_key_id === llave.id) ?? null : null;
  // El secreto recién creado: UNA vez, solo en memoria, hasta «Ya lo guardé».
  const [secreto, setSecreto] = useState<string | null>(null);

  function cuerpo() {
    if (llaves.isLoading || webhooks.isLoading) return <Cargando />;
    if (llaves.isError && !llaves.data) return <Fallo onReintentar={() => void llaves.refetch()} detalle={(llaves.error as Error | null)?.message} />;
    // Sin la lista de avisos no se sabe si hay uno: nunca se ofrece registrar otro.
    if (webhooks.isError || !webhooks.data) return <Fallo onReintentar={() => void webhooks.refetch()} detalle={t("conexionEquipo.avisos.noSe")} />;
    if (!llave || (!activa && !w)) return <Nota>{t("conexionEquipo.avisos.primeroLlave")}</Nota>;
    return (
      <div className="flex flex-col gap-3">
        {secreto && <SecretoUnaVez secreto={secreto} onListo={() => setSecreto(null)} />}
        {w ? <Tarjeta w={w} llave={llave} /> : <Alta llave={llave} onCreado={setSecreto} />}
      </div>
    );
  }

  return (
    <Bloque id="avisos" icono={BellRing} titulo={t("conexionEquipo.avisos.titulo")} para={t("conexionEquipo.avisos.para")}>
      <ul className="grid gap-2 md:grid-cols-2">
        {EVENTOS_EQUIPO.map((e) => (
          <li key={e} className="flex min-w-0 flex-col gap-1 rounded-panel border border-border/50 bg-background/30 p-3">
            <code className="w-fit max-w-full truncate rounded-control bg-muted px-1.5 py-0.5 text-[11px]">{e}</code>
            <span className="text-sm text-muted-foreground">{t(TEXTO_EVENTO[e])}</span>
          </li>
        ))}
      </ul>
      {cuerpo()}
    </Bloque>
  );
}
