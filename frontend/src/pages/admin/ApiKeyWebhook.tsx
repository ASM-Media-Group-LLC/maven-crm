import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pause, Play, Send, Trash2, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { adminInvoke } from "@/lib/adminInvoke";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { ConFormato, CopyButton, Persona } from "./apiKeysPiezas";
import type { Cara } from "./carasDePersonas";
import { UserAvatar } from "@/components/UserAvatar";

// El webhook del Messenger de una API key (a lo sumo uno por key): la celda de la
// tabla y el diálogo de registrar / estado / entregas. El contrato es el de
// manage-api-keys/webhooks.ts: nunca llega la URL entera, el secreto (salvo UNA
// vez al registrar) ni el cursor. Registrar, probar y reanudar son solo de la
// persona de la key; pausar, borrar y ver entregas, de cualquier admin.

export type EstadoWebhook = "pending" | "active" | "paused" | "disabled";
export type WebhookResumen = {
  id: string; api_key_id: string; url_host: string; status: EstadoWebhook;
  disabled_reason: string | null; disabled_at: string | null;
  paused_at: string | null; paused_by: { id: string; name: string | null } | null;
  exclude_own: boolean; secret_last4: string; created_at: string;
  last_attempt_at: string | null; last_success_at: string | null;
  last_status_code: number | null; last_error: string | null; last_test_at: string | null;
  consecutive_failures: number; failing_since: string | null; next_attempt_at: string | null;
};
type Prueba = {
  delivered: boolean; status_code: number | null; error_code: string | null; latency_ms: number | null;
  uncertain: boolean; activated: boolean; message: string; notice: string | null;
};
type PruebaResp = { webhook: WebhookResumen | null; test: Prueba };
type Entrega = {
  id: string; event_type: string; message_count: number | null;
  state: "pending" | "delivered" | "dropped"; drop_reason: string | null; attempts: number;
  last_attempt_at: string | null; last_status_code: number | null; last_error: string | null;
  latency_ms: number | null; uncertain: boolean; created_at: string; delivered_at: string | null;
};

/** Lo mínimo de la key que necesita el webhook. `webhook` undefined = el servidor
 *  no lo mandó (se trata como "no se sabe", igual que webhooks_unknown). */
export type LlaveConWebhook = {
  id: string; name: string; scopes: string[]; status: "active" | "revoked" | "expired";
  acts_as?: { id: string; name: string | null; active: boolean | null } | null;
  webhook?: WebhookResumen | null;
};

export const SCOPE_WEBHOOK = "messenger:read";

// Motivos que reanudar no arregla: la key ya no sirve (revocada, vencida o sin el
// permiso de Messenger; ninguna de las tres tiene vuelta). person_inactive NO está:
// si restauran a la persona, el servidor deja reanudar.
const MOTIVOS_SIN_VUELTA = new Set(["key_revoked", "key_expired", "scope_removed"]);

const MOTIVOS: Record<string, TranslationKey> = {
  receiver_gone: "apiKeys.webhook.reason.receiver_gone",
  receiver_failing: "apiKeys.webhook.reason.receiver_failing",
  key_revoked: "apiKeys.webhook.reason.key_revoked",
  key_expired: "apiKeys.webhook.reason.key_expired",
  scope_removed: "apiKeys.webhook.reason.scope_removed",
  person_inactive: "apiKeys.webhook.reason.person_inactive",
  multi_agency: "apiKeys.webhook.reason.multi_agency",
  config_error: "apiKeys.webhook.reason.config_error",
  admin: "apiKeys.webhook.reason.admin",
};
const DESCARTES: Record<string, TranslationKey> = {
  receiver_gone: "apiKeys.webhook.drop.receiver_gone",
  receiver_failing: "apiKeys.webhook.drop.receiver_failing",
  endpoint_paused: "apiKeys.webhook.drop.endpoint_paused",
  endpoint_disabled: "apiKeys.webhook.drop.endpoint_disabled",
  test_failed: "apiKeys.webhook.drop.test_failed",
};
const ERRORES: Record<string, TranslationKey> = {
  dns: "apiKeys.webhook.err.dns",
  direccion_bloqueada: "apiKeys.webhook.err.direccion_bloqueada",
  conexion: "apiKeys.webhook.err.conexion",
  tls: "apiKeys.webhook.err.tls",
  plazo: "apiKeys.webhook.err.plazo",
  cortado: "apiKeys.webhook.err.cortado",
  respuesta_invalida: "apiKeys.webhook.err.respuesta_invalida",
  host_prohibido: "apiKeys.webhook.err.host_prohibido",
  maven_secreto: "apiKeys.webhook.err.maven_secreto",
  maven_sesion: "apiKeys.webhook.err.maven_sesion",
};

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

const esDeMaven = (codigo: string | null | undefined) => !!codigo && codigo.startsWith("maven_");

/** El last_error (o error_code) en palabras. Uno que no se conoce, tal cual: es
 *  un código corto, sin datos, y es mejor que esconderlo. */
export function textoDelError(codigo: string | null, t: T): string | null {
  if (!codigo) return null;
  const http = /^http_(\d{3})$/.exec(codigo);
  if (http) return t("apiKeys.webhook.err.http", { code: http[1] });
  if (ERRORES[codigo]) return t(ERRORES[codigo]);
  if (esDeMaven(codigo)) return t("apiKeys.webhook.err.maven");
  return codigo;
}

export function textoDelMotivo(motivo: string | null, t: T): string {
  return motivo && MOTIVOS[motivo] ? t(MOTIVOS[motivo]) : t("apiKeys.webhook.reason.other");
}

/** Cómo está DE VERDAD, que no siempre es el status de la fila:
 *  - Con la key revocada, vencida o sin Messenger, o la persona fuera, el servidor
 *    rechaza probar y reanudar aunque la fila siga pending/active/paused (ningún
 *    trigger mira el vencimiento, y el despachador solo toca los activos con
 *    trabajo): se muestra detenido, con el motivo de la key.
 *  - "fallando" solo si hubo un intento fallido del receptor: el despachador sube
 *    consecutive_failures ANTES de cada envío (el adelanto), pero last_attempt_at
 *    recién después; un aviso que está saliendo no es un fallo.
 *  - "demorado": una falla de Maven (maven_*) deja la espera sin tocar el intento.
 *    Puede coincidir con una racha del receptor: entonces manda "fallando". */
export type Efectivo = {
  estado: EstadoWebhook; motivo: string | null; porLaKey: boolean; fallando: boolean; demorado: boolean;
};
export function estadoEfectivo(w: WebhookResumen, k: LlaveConWebhook): Efectivo {
  const motivoKey =
    k.status === "revoked" ? "key_revoked"
    : k.status === "expired" ? "key_expired"
    : !k.scopes.includes(SCOPE_WEBHOOK) ? "scope_removed"
    : k.acts_as?.active === false ? "person_inactive"
    : null;
  if (motivoKey) return { estado: "disabled", motivo: motivoKey, porLaKey: true, fallando: false, demorado: false };
  const activo = w.status === "active";
  // La racha se mira por las fechas, no por last_error: una falla de Maven pisa
  // last_error sin cortar la racha del receptor (que sigue corriendo hacia las 72 h),
  // y tras reanudar queda un last_error viejo con la racha en cero.
  const fallando = activo && w.consecutive_failures > 0
    && !!w.last_attempt_at && !!w.failing_since && Date.parse(w.last_attempt_at) >= Date.parse(w.failing_since);
  return {
    estado: w.status,
    motivo: w.status === "disabled" ? w.disabled_reason : null,
    porLaKey: false,
    fallando,
    // Puede ir junto con fallando: se muestran las dos cosas.
    demorado: activo && esDeMaven(w.last_error),
  };
}

type Chip = { texto: TranslationKey; variant: "success-soft" | "warning-soft" | "destructive-soft" | "secondary" };
export function chipDe(ef: Efectivo): Chip {
  if (ef.estado === "pending") return { texto: "apiKeys.webhook.state.pending", variant: "warning-soft" };
  if (ef.estado === "paused") return { texto: "apiKeys.webhook.state.paused", variant: "secondary" };
  if (ef.estado === "disabled") return { texto: "apiKeys.webhook.state.disabled", variant: "destructive-soft" };
  if (ef.fallando) return { texto: "apiKeys.webhook.state.failing", variant: "warning-soft" };
  if (ef.demorado) return { texto: "apiKeys.webhook.state.delayed", variant: "warning-soft" };
  return { texto: "apiKeys.webhook.state.active", variant: "success-soft" };
}

/** Qué se puede hacer con la key de esta fila. Un webhook que existe se muestra
 *  SIEMPRE (aunque a la key le hayan sacado Messenger: queda detenido y hay que
 *  poder verlo y borrarlo). */
export function queMostrar(k: LlaveConWebhook, youId: string | null | undefined, desconocido: boolean) {
  if (k.webhook) return "webhook" as const;
  if (!k.scopes.includes(SCOPE_WEBHOOK)) return "nada" as const;
  if (desconocido || k.webhook === undefined) return "desconocido" as const;
  const esDueno = !!youId && k.acts_as?.id === youId;
  return k.status === "active" && esDueno ? ("registrar" as const) : ("sin" as const);
}

/** La celda "Webhook" de la tabla de keys. */
export function CeldaWebhook({ llave, youId, desconocido, onAbrir }: {
  llave: LlaveConWebhook; youId: string | null | undefined; desconocido: boolean; onAbrir: () => void;
}) {
  const { t } = useLanguage();
  const que = queMostrar(llave, youId, desconocido);
  if (que === "nada") return <span className="text-muted-foreground/70">—</span>;
  if (que === "desconocido") {
    return (
      <Badge variant="outline" className="whitespace-nowrap font-normal text-muted-foreground" title={t("apiKeys.webhook.unknownHint")}>
        {t("apiKeys.webhook.unknown")}
      </Badge>
    );
  }
  if (que === "registrar") {
    return (
      <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs" onClick={onAbrir} data-webhook-de={llave.id}>
        <Webhook className="h-3.5 w-3.5" /> {t("apiKeys.webhook.register")}
      </Button>
    );
  }
  if (que === "sin") return <span className="whitespace-nowrap text-muted-foreground/70">{t("apiKeys.webhook.none")}</span>;
  const w = llave.webhook!;
  const chip = chipDe(estadoEfectivo(w, llave));
  return (
    // Adentro del botón va un span con el estilo del Badge (que dibuja un div): un
    // div adentro de un botón no es HTML válido y el botón se queda sin nombre.
    // md: y no sm: porque tabla-movil pasa a tarjetas hasta 767 px.
    <button type="button" onClick={onAbrir} aria-haspopup="dialog" data-webhook-de={llave.id}
      className="group inline-flex min-w-0 max-w-full flex-col items-end gap-0.5 rounded-md text-right md:items-start md:text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className={cn(badgeVariants({ variant: chip.variant }), "whitespace-nowrap font-medium group-hover:underline")}>{t(chip.texto)}</span>
      <span className="max-w-[min(14rem,100%)] truncate text-[11px] text-muted-foreground" title={w.url_host}>{w.url_host}</span>
    </button>
  );
}

function useFecha() {
  const f = useFormato();
  const locale = f.intl("es-CO");
  return (d: string | null) =>
    d ? new Date(d).toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3 py-1.5 text-sm md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

type ListaEnCache = { keys: { id: string; webhook?: WebhookResumen | null }[] };

/** El diálogo del webhook de una key. Se monta de nuevo en cada apertura
 *  (AdminApiKeys le pone key): el secreto y el resultado de una prueba nunca pasan
 *  de una key a otra. `llave` sale de la lista, fresca tras cada acción. */
export function DialogoWebhook({ abierto, llave, youId, desconocido = false, caras, onCerrar }: {
  abierto: boolean; llave: LlaveConWebhook | null; youId: string | null | undefined;
  desconocido?: boolean; caras?: Map<string, Cara>; onCerrar: () => void;
}) {
  const qc = useQueryClient();
  const { t, language } = useLanguage();
  const lang = language;
  const fecha = useFecha();
  // El secreto vive SOLO acá, en memoria, mientras el diálogo está abierto. La
  // mutación del alta se resetea apenas se copia (y no guarda nada: gcTime 0), así
  // que no queda en la caché de react-query.
  const [secreto, setSecreto] = useState<string | null>(null);
  // El que se acaba de registrar, hasta que la lista lo traiga.
  const [recien, setRecien] = useState<WebhookResumen | null>(null);
  const [url, setUrl] = useState("");
  const [sinPropios, setSinPropios] = useState(true);
  const [prueba, setPrueba] = useState<{ de: string; test: Prueba } | null>(null);
  const [pestana, setPestana] = useState("estado");
  const [soloFallidas, setSoloFallidas] = useState(false);
  const [borrar, setBorrar] = useState(false);
  // Quién abrió el diálogo, para devolverle el foco al cerrar (no hay Trigger).
  const abridor = useRef<HTMLElement | null>(typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null);
  const ultimoConocido = useRef<WebhookResumen | null>(null);
  // Lo último que se dibujó con el diálogo abierto: durante la animación de salida se
  // sigue mostrando eso (si no, tras borrar se veía el alta, con su campo tomando el foco).
  const ultimoCuerpo = useRef<React.ReactNode>(null);
  // Esperando una relectura que dice cómo quedó (tras un error, o una prueba que no
  // devolvió el endpoint): solo se frenan las acciones que dependen del estado.
  const [releyendo, setReleyendo] = useState(false);
  // Dos toques en el mismo cuadro llegan antes de que isPending se dibuje: sin esta
  // guarda salían dos pedidos (dos borrados = un 404 de más; dos pruebas = un 429).
  // Se suelta en el onSettled de cada mutación (el de las opciones, que corre
  // siempre; el de cada mutate() no, si la mutación se resetea antes).
  const enCurso = useRef(false);
  const unaVez = (lanzar: () => void) => {
    if (enCurso.current) return;
    enCurso.current = true;
    lanzar();
  };
  const soltar = () => { enCurso.current = false; };
  const recienVisto = useRef(false);

  // ── qué webhook se muestra ──
  // null en la lista = no tiene; undefined o webhooks_unknown = NO SE SABE: ahí se
  // sigue mostrando lo último que se supo (nunca el alta, nunca sin Pausar/Borrar).
  const deLaLista = llave?.webhook;
  const sinDato = desconocido || deLaLista === undefined;
  const recienDeEsta = recien && recien.api_key_id === llave?.id ? recien : null;
  if (deLaLista) {
    ultimoConocido.current = deLaLista;
    if (recienDeEsta && deLaLista.id === recienDeEsta.id) recienVisto.current = true;
  } else if (deLaLista === null && !desconocido) {
    // "No tiene" es un dato: lo que se sabía ya no vale (lo borraron).
    ultimoConocido.current = null;
  }
  const w: WebhookResumen | null =
    deLaLista ?? (sinDato ? ultimoConocido.current ?? recienDeEsta : recienVisto.current ? null : recienDeEsta);
  const viejo = sinDato && !!w;

  const esDueno = !!youId && llave?.acts_as?.id === youId;
  const cara = (id: string | null | undefined) => (id ? caras?.get(id) : undefined);

  const refrescar = () => qc.invalidateQueries({ queryKey: ["api-keys"] });
  const releer = () => {
    setReleyendo(true);
    refrescar().then(() => setReleyendo(false), () => setReleyendo(false));
  };
  // Lo que devolvió el servidor va a la lista enseguida: sin esto, entre la acción y
  // la relectura se veía el estado de antes (y el botón de antes, habilitado).
  const ponerEnLista = (keyId: string, wh: WebhookResumen | null) => {
    qc.setQueryData<ListaEnCache>(["api-keys"], (viejaLista) => viejaLista && {
      ...viejaLista, keys: viejaLista.keys.map((k) => (k.id === keyId ? { ...k, webhook: wh } : k)),
    });
  };
  // Un error también relee: 404/409/503 quieren decir "cambió" o "no se sabe". Hasta
  // que llegue, Pausar/Probar/Reanudar esperan (un segundo toque daba otro 409).
  const alFallar = (e: unknown) => {
    releer();
    toast.error((e as Error)?.message ?? t("apiKeys.loadError"));
  };

  const crear = useMutation({
    mutationFn: () => adminInvoke<{ webhook: WebhookResumen; secret: string }>("manage-api-keys", {
      action: "webhook_create", lang, key_id: llave!.id, url: url.trim(), exclude_own: sinPropios,
    }),
    gcTime: 0,
    onSuccess: (res) => {
      setSecreto(res.secret); setRecien(res.webhook); setUrl("");
      ponerEnLista(res.webhook.api_key_id, res.webhook);
      toast.success(t("apiKeys.webhook.toast.registered"));
      void refrescar().then(() => {}, () => {});
    },
    onError: alFallar,
    // El secreto ya está en el estado del diálogo: la mutación lo suelta.
    onSettled: () => { soltar(); queueMicrotask(() => crear.reset()); },
  });
  const probar = useMutation({
    mutationFn: (v: { accion: "webhook_test" | "webhook_resume"; id: string }) =>
      adminInvoke<PruebaResp>("manage-api-keys", { action: v.accion, lang, id: v.id }),
    onSuccess: (res, v) => {
      // El secreto NO se borra: si la prueba no llegó (el integrador todavía no lo
      // tiene), hay que poder copiarlo igual. Se va al cerrar.
      setPrueba({ de: v.id, test: res.test });
      // El resultado se ve en Estado: si se probó desde Entregas, se vuelve ahí.
      setPestana("estado");
      if (res.test.activated) toast.success(t("apiKeys.webhook.toast.activated"));
      // Con el endpoint en la respuesta ya se sabe cómo quedó; sin él, hay que releer
      // antes de ofrecer otra acción. En los dos casos, el diálogo no espera la lista.
      if (res.webhook) {
        ponerEnLista(res.webhook.api_key_id, res.webhook);
        void refrescar().then(() => {}, () => {});
      } else releer();
    },
    onError: alFallar,
    onSettled: soltar,
  });
  const pausar = useMutation({
    mutationFn: (id: string) => adminInvoke<{ webhook: WebhookResumen }>("manage-api-keys", { action: "webhook_pause", lang, id }),
    onSuccess: (res) => {
      setPrueba(null);
      toast.success(t("apiKeys.webhook.toast.paused"));
      if (res?.webhook) {
        ponerEnLista(res.webhook.api_key_id, res.webhook);
        void refrescar().then(() => {}, () => {});
      } else releer();
    },
    onError: alFallar,
    onSettled: soltar,
  });
  const quitar = useMutation({
    mutationFn: (v: { id: string; keyId: string }) => adminInvoke("manage-api-keys", { action: "webhook_delete", lang, id: v.id }),
    onSuccess: (_res, v) => {
      ponerEnLista(v.keyId, null);
      toast.success(t("apiKeys.webhook.toast.deleted"));
      setBorrar(false);
      onCerrar();
      void refrescar().then(() => {}, () => {});
    },
    onError: (e) => { setBorrar(false); alFallar(e); },
    onSettled: soltar,
  });

  const entregas = useQuery({
    queryKey: ["api-keys", "webhook-deliveries", w?.id, soloFallidas],
    queryFn: () => adminInvoke<{ webhook: WebhookResumen; deliveries: Entrega[] }>("manage-api-keys", {
      action: "webhook_deliveries", lang, id: w!.id, only_failed: soloFallidas,
    }),
    enabled: abierto && !!w && pestana === "entregas",
    // Salen avisos cada 15 s: mientras se mira, se relee.
    staleTime: 0,
    refetchInterval: abierto && pestana === "entregas" ? 15_000 : false,
  });
  // El endpoint que trae la respuesta de entregas se usa SOLO para su tabla ("reintenta
  // a las …"): no se escribe en la lista, porque puede venir de la caché (la consulta
  // queda guardada al cambiar de pestaña) y pisaría un estado más nuevo.

  // Mientras se registra o se prueba NO se puede cerrar: la respuesta (el secreto,
  // el resultado) tiene que caer en ESTE diálogo, no perderse ni pasar a otro.
  const enVuelo = crear.isPending || probar.isPending;
  const ocupado = enVuelo || pausar.isPending || quitar.isPending;
  // Las acciones que dependen del estado esperan también la relectura.
  const esperaEstado = ocupado || releyendo;
  const cerrar = () => { if (!enVuelo && !quitar.isPending) onCerrar(); };
  const urlValida = /^https:\/\/\S+$/i.test(url.trim());

  const tarjetaPersona = llave?.acts_as ? (
    // La persona de la key, como en los demás modales de Maven (Cambiar rol,
    // Compartir): su cara y qué puede hacer cada uno con el webhook.
    <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
      <UserAvatar name={llave.acts_as.name} src={cara(llave.acts_as.id)?.src} seed={cara(llave.acts_as.id)?.seed} size="md" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 font-medium">
          <span className="truncate">{llave.acts_as.name || "—"}</span>
          {llave.acts_as.active === false && (
            <Badge variant="destructive-soft" className="font-normal">{t("apiKeys.status.personGone")}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {esDueno ? t("apiKeys.webhook.person.you") : t("apiKeys.webhook.person.other")}
        </p>
      </div>
    </div>
  ) : null;

  const resultado = prueba && w && prueba.de === w.id ? <ResultadoDePrueba prueba={prueba.test} /> : null;

  let cuerpo: React.ReactNode = null;
  if (!llave) cuerpo = null;
  else if (secreto && recienDeEsta) {
    // ── recién registrado: el secreto, que se ve hasta cerrar ──
    const idPrueba = recienDeEsta.id;
    const llego = prueba?.de === idPrueba && prueba.test.delivered;
    cuerpo = (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Check className="h-5 w-5 text-success" /> {t("apiKeys.webhook.secretTitle")}</DialogTitle>
          <DialogDescription><ConFormato texto={t("apiKeys.webhook.secretCopyNow")} /></DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
            <code className="block break-all font-mono text-sm text-foreground">{secreto}</code>
          </div>
          <div className="flex justify-end"><CopyButton text={secreto} label={t("apiKeys.webhook.secretCopy")} /></div>
          {prueba?.de === idPrueba ? <ResultadoDePrueba prueba={prueba.test} /> : (
            <p className="text-sm text-muted-foreground"><ConFormato texto={t("apiKeys.webhook.nextTest")} /></p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" disabled={enVuelo} onClick={cerrar}>{llego ? t("apiKeys.webhook.done") : t("apiKeys.webhook.later")}</Button>
          <Button className="gap-1.5 aria-disabled:opacity-50" aria-disabled={enVuelo}
            onClick={() => { if (!enVuelo) unaVez(() => probar.mutate({ accion: "webhook_test", id: idPrueba })); }}>
            {probar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t("apiKeys.webhook.sendTest")}
          </Button>
        </DialogFooter>
      </>
    );
  } else if (!w && sinDato) {
    // ── no se sabe si tiene: ni alta ni "no tiene" ──
    cuerpo = (
      <>
        <DialogHeader>
          <DialogTitle>{t("apiKeys.webhook.title", { name: llave.name })}</DialogTitle>
          <DialogDescription>{t("apiKeys.webhook.unknownHint")}</DialogDescription>
        </DialogHeader>
        <DialogFooter><Button variant="outline" onClick={cerrar}>{t("common.close")}</Button></DialogFooter>
      </>
    );
  } else if (!w && !esDueno) {
    // ── no tiene (lo borraron con el diálogo abierto): quien no es la dueña no ve el alta ──
    cuerpo = (
      <>
        <DialogHeader>
          <DialogTitle>{t("apiKeys.webhook.title", { name: llave.name })}</DialogTitle>
          <DialogDescription>{t("apiKeys.webhook.noneBody")}</DialogDescription>
        </DialogHeader>
        {tarjetaPersona}
        <DialogFooter><Button variant="outline" onClick={cerrar}>{t("common.close")}</Button></DialogFooter>
      </>
    );
  } else if (!w) {
    // ── alta (solo la dueña) ──
    cuerpo = (
      <>
        <DialogHeader>
          <DialogTitle>{t("apiKeys.webhook.registerTitle", { name: llave.name })}</DialogTitle>
          <DialogDescription><ConFormato texto={t("apiKeys.webhook.registerIntro")} /></DialogDescription>
        </DialogHeader>
        {tarjetaPersona}
        {(
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="webhook-url">{t("apiKeys.webhook.url")}</Label>
              <Input id="webhook-url" type="url" inputMode="url" autoComplete="off" spellCheck={false} autoFocus
                placeholder={t("apiKeys.webhook.urlPlaceholder")} value={url} disabled={crear.isPending}
                onChange={(e) => setUrl(e.target.value)} />
              <p className="text-xs text-muted-foreground"><ConFormato texto={t("apiKeys.webhook.urlHint")} /></p>
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={sinPropios} disabled={crear.isPending}
                onChange={(e) => setSinPropios(e.target.checked)} />
              <span>
                <span className="font-medium">{t("apiKeys.webhook.excludeOwn")}</span>
                <span className="block text-xs text-muted-foreground">{t("apiKeys.webhook.excludeOwnHint")}</span>
              </span>
            </label>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" disabled={crear.isPending} onClick={cerrar}>{t("common.cancel")}</Button>
          <Button className="gap-1.5" disabled={!urlValida || crear.isPending} onClick={() => unaVez(() => crear.mutate())}>
            {crear.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {t("apiKeys.webhook.registerButton")}
          </Button>
        </DialogFooter>
      </>
    );
  } else {
    // ── estado y entregas ──
    const ef = estadoEfectivo(w, llave);
    const chip = chipDe(ef);
    const ayuda =
      ef.estado === "disabled" ? textoDelMotivo(ef.motivo, t)
      : ef.estado === "paused" ? t("apiKeys.webhook.help.paused")
      : ef.estado === "pending" ? t("apiKeys.webhook.help.pending")
      : ef.fallando ? t("apiKeys.webhook.help.failing")
      : ef.demorado ? t("apiKeys.webhook.help.delayed")
      : t("apiKeys.webhook.help.active");
    const puedeProbar = esDueno && !ef.porLaKey && (ef.estado === "pending" || ef.estado === "active");
    const puedeReanudar = esDueno && !ef.porLaKey && (ef.estado === "paused" ||
      (ef.estado === "disabled" && !MOTIVOS_SIN_VUELTA.has(ef.motivo ?? "")));
    const puedePausar = !ef.porLaKey && ef.estado === "active";
    // El error del receptor va con su intento; uno de Maven, aparte y solo en activo
    // (en pausado o detenido no se va a reintentar nada).
    const errorDelIntento = esDeMaven(w.last_error) ? null : textoDelError(w.last_error, t);
    cuerpo = (
      <>
        <DialogHeader>
          {/* El chip va AL LADO del título: el Badge dibuja un div, y un div no puede ir dentro del h2. */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <DialogTitle>{t("apiKeys.webhook.title", { name: llave.name })}</DialogTitle>
            <span className={cn(badgeVariants({ variant: chip.variant }), "font-medium")}>{t(chip.texto)}</span>
          </div>
          <DialogDescription>{ayuda}</DialogDescription>
        </DialogHeader>
        {viejo && (
          <p role="status" className="rounded-md border border-warning/40 bg-warning/5 p-2 text-xs text-foreground">{t("apiKeys.webhook.stale")}</p>
        )}
        <Tabs value={pestana} onValueChange={setPestana} className="min-w-0">
          <TabsList>
            <TabsTrigger value="estado">{t("apiKeys.webhook.tab.status")}</TabsTrigger>
            <TabsTrigger value="entregas">{t("apiKeys.webhook.tab.deliveries")}</TabsTrigger>
          </TabsList>
          <TabsContent value="estado" className="space-y-4">
            {tarjetaPersona}
            {resultado}
            <dl className="divide-y divide-border/40">
              <Dato etiqueta={t("apiKeys.webhook.detail.host")}><code className="text-xs">{w.url_host}</code></Dato>
              <Dato etiqueta={t("apiKeys.webhook.detail.secret")}><code className="text-xs">whsec_…{w.secret_last4}</code></Dato>
              <Dato etiqueta={t("apiKeys.webhook.detail.own")}>
                {w.exclude_own ? t("apiKeys.webhook.detail.ownExcluded") : t("apiKeys.webhook.detail.ownIncluded")}
              </Dato>
              <Dato etiqueta={t("apiKeys.webhook.detail.created")}>{fecha(w.created_at)}</Dato>
              <Dato etiqueta={t("apiKeys.webhook.detail.lastTest")}>{fecha(w.last_test_at)}</Dato>
              <Dato etiqueta={t("apiKeys.webhook.detail.lastSuccess")}>{fecha(w.last_success_at)}</Dato>
              <Dato etiqueta={t("apiKeys.webhook.detail.lastAttempt")}>
                {fecha(w.last_attempt_at)}
                {errorDelIntento && <span className="block text-xs text-destructive">{errorDelIntento}</span>}
              </Dato>
              {ef.fallando && (
                <Dato etiqueta={t("apiKeys.webhook.detail.failures")}>
                  {w.failing_since
                    ? t("apiKeys.webhook.detail.failuresSince", { n: w.consecutive_failures, when: fecha(w.failing_since) })
                    : w.consecutive_failures}
                </Dato>
              )}
              {ef.demorado && (
                <Dato etiqueta={t("apiKeys.webhook.detail.delay")}>
                  <span className="text-warning">{textoDelError(w.last_error, t)}</span>
                </Dato>
              )}
              {ef.estado === "active" && (ef.fallando || ef.demorado) && w.next_attempt_at && Date.parse(w.next_attempt_at) > Date.now() && (
                <Dato etiqueta={t("apiKeys.webhook.detail.nextAttempt")}>{fecha(w.next_attempt_at)}</Dato>
              )}
              {ef.estado === "paused" && (
                <Dato etiqueta={t("apiKeys.webhook.state.paused")}>
                  {w.paused_by?.name ? (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Persona nombre={w.paused_by.name} cara={cara(w.paused_by.id)} />
                      <span>{t("apiKeys.webhook.detail.pausedOn", { when: fecha(w.paused_at) })}</span>
                    </span>
                  ) : t("apiKeys.webhook.detail.pausedWhen", { when: fecha(w.paused_at) })}
                </Dato>
              )}
              {w.status === "disabled" && (
                <Dato etiqueta={t("apiKeys.webhook.state.disabled")}>
                  {t("apiKeys.webhook.detail.disabledOn", { when: fecha(w.disabled_at) })}
                </Dato>
              )}
            </dl>
          </TabsContent>
          <TabsContent value="entregas" className="space-y-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={soloFallidas}
                onChange={(e) => setSoloFallidas(e.target.checked)} />
              {t("apiKeys.webhook.deliveries.onlyFailed")}
            </label>
            {entregas.isLoading ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : entregas.isError ? (
              <p className="text-sm text-destructive">{(entregas.error as Error)?.message ?? t("apiKeys.webhook.deliveries.loadError")}</p>
            ) : !entregas.data?.deliveries.length ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("apiKeys.webhook.deliveries.empty")}</p>
            ) : (
              <TablaDeEntregas entregas={entregas.data.deliveries} webhook={entregas.data.webhook ?? w} />
            )}
            <p className="text-xs text-muted-foreground">{t("apiKeys.webhook.deliveries.retention")}</p>
          </TabsContent>
        </Tabs>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between sm:gap-2 sm:space-x-0">
          {/* Con Trigger, al cerrar la confirmación el foco vuelve a este botón. */}
          <AlertDialog open={borrar} onOpenChange={(o) => { if (!quitar.isPending) setBorrar(o); }}>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" disabled={enVuelo}>
                <Trash2 className="h-4 w-4" /> {t("apiKeys.webhook.delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("apiKeys.webhook.deleteTitle", { name: llave.name })}</AlertDialogTitle>
                <AlertDialogDescription>{t("apiKeys.webhook.deleteBody", { host: w.url_host })}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                {/* Mientras borra: aria-disabled y no disabled, para que el foco no caiga
                    a <body>; la guarda unaVez y el onOpenChange evitan el doble pedido. */}
                <AlertDialogCancel aria-disabled={quitar.isPending} className="aria-disabled:opacity-50" />
                {/* bg-none: sin esto el degradé del botón de Maven tapa el rojo. */}
                <AlertDialogAction className="gap-1.5 bg-none bg-destructive text-destructive-foreground hover:bg-destructive/90 aria-disabled:opacity-50"
                  aria-disabled={quitar.isPending}
                  onClick={(e) => { e.preventDefault(); if (!quitar.isPending) unaVez(() => quitar.mutate({ id: w.id, keyId: llave.id })); }}>
                  {quitar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {t("apiKeys.webhook.delete")}
                </AlertDialogAction>
                <span role="status" className="sr-only">{quitar.isPending ? t("apiKeys.webhook.working") : ""}</span>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="flex flex-wrap justify-end gap-2">
            <span role="status" className="sr-only">{ocupado ? t("apiKeys.webhook.working") : ""}</span>
            {puedePausar && (
              <Button variant="outline" className="gap-1.5 aria-disabled:opacity-50" aria-disabled={esperaEstado}
                onClick={() => { if (!esperaEstado) unaVez(() => pausar.mutate(w.id)); }}>
                {pausar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />} {t("apiKeys.webhook.pause")}
              </Button>
            )}
            {puedeProbar && (
              <Button className="gap-1.5 aria-disabled:opacity-50" aria-disabled={esperaEstado}
                onClick={() => { if (!esperaEstado) unaVez(() => probar.mutate({ accion: "webhook_test", id: w.id })); }}>
                {probar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t("apiKeys.webhook.sendTest")}
              </Button>
            )}
            {puedeReanudar && (
              <Button className="gap-1.5 aria-disabled:opacity-50" aria-disabled={esperaEstado}
                onClick={() => { if (!esperaEstado) unaVez(() => probar.mutate({ accion: "webhook_resume", id: w.id })); }}>
                {probar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} {t("apiKeys.webhook.resume")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </>
    );
  }

  if (abierto) ultimoCuerpo.current = cuerpo;
  else if (ultimoCuerpo.current) cuerpo = ultimoCuerpo.current;

  return (
    <Dialog open={abierto && !!llave} onOpenChange={(o) => { if (!o) cerrar(); }}>
      {/* grid-cols-[minmax(0,1fr)]: que la tabla de entregas se desplace en su caja
          y no ensanche el diálogo (mismo arreglo que la referencia del API). */}
      <DialogContent className="max-h-[85vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-3xl"
        onCloseAutoFocus={(e) => {
          // Sin Trigger, Radix no sabe a quién devolverle el foco. Si el botón que lo
          // abrió ya no está (la celda cambió de Registrar al chip), el de su fila.
          // La celda puede haber quedado sin botón ("Sin webhook" tras borrar): entonces
          // la celda misma, que tiene tabIndex -1.
          e.preventDefault();
          const celda = llave ? document.querySelector<HTMLElement>(`[data-webhook-celda="${llave.id}"]`) : null;
          const destino = abridor.current?.isConnected ? abridor.current : celda?.querySelector<HTMLElement>("button") ?? celda;
          destino?.focus();
          // El secreto no espera a la próxima apertura: se va al terminar de cerrar.
          setSecreto(null); setPrueba(null);
        }}>
        {cuerpo}
      </DialogContent>
    </Dialog>
  );
}

function ResultadoDePrueba({ prueba }: { prueba: Prueba }) {
  const { t } = useLanguage();
  const ok = prueba.delivered;
  // Incierta = salió y no se sabe si llegó (se cortó después de mandar): ni verde ni
  // "no llegó".
  const dudosa = !ok && prueba.uncertain;
  const marco = ok ? "border-success/40 bg-success/5" : dudosa ? "border-warning/40 bg-warning/5" : "border-destructive/40 bg-destructive/5";
  return (
    <div role="status" className={`space-y-1 rounded-md border p-3 text-sm ${marco}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={ok ? "success-soft" : dudosa ? "warning-soft" : "destructive-soft"}>
          {ok ? t("apiKeys.webhook.test.delivered") : dudosa ? t("apiKeys.webhook.test.maybe") : t("apiKeys.webhook.test.notDelivered")}
        </Badge>
        {prueba.latency_ms !== null && <span className="text-xs tabular-nums text-muted-foreground">{prueba.latency_ms} ms</span>}
      </div>
      {/* El mensaje ya viene en el idioma de la pantalla (se manda `lang`). */}
      <p className="text-foreground">{prueba.message}</p>
      {prueba.activated && <p className="text-success">{t("apiKeys.webhook.test.activated")}</p>}
      {prueba.uncertain && <p className="text-muted-foreground">{t("apiKeys.webhook.test.uncertain")}</p>}
      {prueba.notice && <p className="text-warning">{prueba.notice}</p>}
    </div>
  );
}

function TablaDeEntregas({ entregas, webhook }: { entregas: Entrega[]; webhook: WebhookResumen }) {
  const { t } = useLanguage();
  const fecha = useFecha();
  const cols = {
    cuando: t("apiKeys.webhook.deliveries.col.when"),
    tipo: t("apiKeys.webhook.deliveries.col.type"),
    intentos: t("apiKeys.webhook.deliveries.col.attempts"),
    resultado: t("apiKeys.webhook.deliveries.col.result"),
  };
  // Cuatro columnas a propósito: con seis, el resultado (lo que se viene a mirar)
  // quedaba afuera del diálogo y había que desplazarse para verlo.
  return (
    <div className="overflow-x-auto rounded-md border border-border/60">
      <table className="tabla-movil w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">{cols.cuando}</th>
            <th className="px-3 py-2 font-medium">{cols.tipo}</th>
            <th className="px-3 py-2 font-medium">{cols.intentos}</th>
            <th className="px-3 py-2 font-medium">{cols.resultado}</th>
          </tr>
        </thead>
        <tbody>
          {entregas.map((e) => {
            const error = textoDelError(e.last_error, t);
            const prueba = e.event_type === "webhook.test";
            // Solo una puede estar en vuelo por webhook: la pendiente reintenta cuando
            // dice el endpoint (el dato viene fresco en la misma respuesta).
            // "Reintenta" solo si ya falló un intento: la que está saliendo por primera
            // vez (el despachador anota la espera ANTES de mandar) es solo "pendiente".
            const reintenta = e.state === "pending" && !prueba && !!e.last_error && webhook.next_attempt_at
              && new Date(webhook.next_attempt_at).getTime() > Date.now() ? webhook.next_attempt_at : null;
            // En el teléfono cada celda es una fila "etiqueta — valor" (tabla-movil):
            // lo que tiene más de una parte va en UN div, o se reparte a lo ancho.
            return (
              <tr key={e.id} className="border-b border-border/40 align-top md:last:border-0">
                <td data-label={cols.cuando} className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fecha(e.created_at)}</td>
                <td data-label={cols.tipo} className="px-3 py-2">
                  <div title={e.event_type} className="whitespace-nowrap">
                    {prueba
                      ? t("apiKeys.webhook.deliveries.type.test")
                      : e.message_count === 1
                        ? t("apiKeys.webhook.deliveries.type.bellOne")
                        : t("apiKeys.webhook.deliveries.type.bellCount", { n: e.message_count ?? 0 })}
                  </div>
                </td>
                <td data-label={cols.intentos} className="px-3 py-2">
                  <div className="tabular-nums">
                    {e.attempts}
                    {e.attempts > 1 && e.last_attempt_at && (
                      <span className="block text-xs text-muted-foreground md:whitespace-nowrap">
                        {t("apiKeys.webhook.deliveries.lastAt", { when: fecha(e.last_attempt_at) })}
                      </span>
                    )}
                  </div>
                </td>
                <td data-label={cols.resultado} className="px-3 py-2">
                  <div className="flex min-w-0 flex-col items-end gap-0.5 md:items-start">
                    {e.state === "delivered" && (
                      <Badge variant="success-soft" className="whitespace-nowrap">
                        {t("apiKeys.webhook.deliveries.delivered")}{e.last_status_code ? ` · ${e.last_status_code}` : ""}
                      </Badge>
                    )}
                    {e.state === "pending" && (
                      <Badge variant="warning-soft" className="md:whitespace-nowrap">
                        {reintenta ? t("apiKeys.webhook.deliveries.retrying", { when: fecha(reintenta) }) : t("apiKeys.webhook.deliveries.pending")}
                      </Badge>
                    )}
                    {e.state === "dropped" && (
                      <Badge variant="destructive-soft">
                        {t("apiKeys.webhook.deliveries.dropped", {
                          reason: e.drop_reason === "test_failed" && e.uncertain ? t("apiKeys.webhook.drop.test_unconfirmed")
                            : e.drop_reason && DESCARTES[e.drop_reason] ? t(DESCARTES[e.drop_reason]) : t("apiKeys.webhook.drop.other"),
                        })}
                      </Badge>
                    )}
                    {error && e.state !== "delivered" && <span className="text-xs text-muted-foreground">{error}</span>}
                    {/* "cortado" ya dice que puede haber llegado: no se repite. */}
                    {e.uncertain && e.state !== "delivered" && e.last_error !== "cortado" && (
                      <span className="text-xs text-muted-foreground">{t("apiKeys.webhook.test.uncertain")}</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** La sección "Webhooks" de la referencia del API. */
export function DocsWebhooks() {
  const { t } = useLanguage();
  const ejemplo = `POST https://example.com/maven/webhook
webhook-id: 5b0d6a4e-3c1f-4e8a-9d7e-2a6f0c9b1e33
webhook-timestamp: 1790372412
webhook-signature: v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=
content-type: application/json

{
  "id": "5b0d6a4e-3c1f-4e8a-9d7e-2a6f0c9b1e33",
  "type": "messages.created",
  "api_version": "v1",
  "created_at": "2026-09-25T21:40:12.345Z",
  "key_prefix": "mvk_live_ab12cd",
  "data": {
    "count": 3,
    "has_more": false,
    "conversation_ids": ["…", "…"],
    "exclude_own": true,
    "after": "<cursor>",
    "until": "<cursor>",
    "fetch": "/messenger/feed?after=<cursor>&exclude_own=true"
  }
}`;
  return (
    <div>
      <div className="mb-1 font-medium">{t("apiKeys.docs.webhooks")}</div>
      <div className="space-y-2 text-xs text-muted-foreground">
        <p><ConFormato texto={t("apiKeys.docs.webhooks.what")} /></p>
        <p><ConFormato texto={t("apiKeys.docs.webhooks.signature")} /></p>
        <p><ConFormato texto={t("apiKeys.docs.webhooks.receiver")} /></p>
        <p><ConFormato texto={t("apiKeys.docs.webhooks.guarantees")} /></p>
        <p className="rounded-md border border-warning/40 bg-warning/5 p-2 text-foreground"><ConFormato texto={t("apiKeys.docs.webhooks.fallback")} /></p>
        <p><ConFormato texto={t("apiKeys.docs.webhooks.limits")} /></p>
      </div>
      <div className="mb-1 mt-3 font-medium">{t("apiKeys.docs.webhooks.example")}</div>
      <div className="rounded-md border border-border/60 bg-background p-3">
        <pre className="overflow-x-auto text-[11px] leading-relaxed">{ejemplo}</pre>
      </div>
    </div>
  );
}
