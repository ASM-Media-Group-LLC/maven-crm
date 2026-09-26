import { useState } from "react";
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
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { adminInvoke } from "@/lib/adminInvoke";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { ConFormato, CopyButton } from "./apiKeysPiezas";

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

// Motivos por los que la base lo detiene y que reanudar no arregla: la key o la
// persona ya no sirven. El servidor igual lo rechazaría; acá ni se ofrece.
const MOTIVOS_SIN_VUELTA = new Set(["key_revoked", "key_expired", "scope_removed", "person_inactive"]);

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

/** El last_error (o error_code) en palabras. Uno que no se conoce, tal cual: es
 *  un código corto, sin datos, y es mejor que esconderlo. */
export function textoDelError(codigo: string | null, t: T): string | null {
  if (!codigo) return null;
  const http = /^http_(\d{3})$/.exec(codigo);
  if (http) return t("apiKeys.webhook.err.http", { code: http[1] });
  if (ERRORES[codigo]) return t(ERRORES[codigo]);
  if (codigo.startsWith("maven_")) return t("apiKeys.webhook.err.maven");
  return codigo;
}

export function textoDelMotivo(motivo: string | null, t: T): string {
  return motivo && MOTIVOS[motivo] ? t(MOTIVOS[motivo]) : t("apiKeys.webhook.reason.other");
}

type Chip = { texto: TranslationKey; variant: "success-soft" | "warning-soft" | "destructive-soft" | "secondary" };
export function chipDelWebhook(w: WebhookResumen): Chip {
  if (w.status === "pending") return { texto: "apiKeys.webhook.state.pending", variant: "warning-soft" };
  if (w.status === "paused") return { texto: "apiKeys.webhook.state.paused", variant: "secondary" };
  if (w.status === "disabled") return { texto: "apiKeys.webhook.state.disabled", variant: "destructive-soft" };
  return w.consecutive_failures > 0
    ? { texto: "apiKeys.webhook.state.failing", variant: "warning-soft" }
    : { texto: "apiKeys.webhook.state.active", variant: "success-soft" };
}

/** Qué se puede hacer con la key de esta fila. */
export function queMostrar(k: LlaveConWebhook, youId: string | null | undefined, desconocido: boolean) {
  if (!k.scopes.includes(SCOPE_WEBHOOK)) return "nada" as const;
  if (desconocido || k.webhook === undefined) return "desconocido" as const;
  if (k.webhook) return "webhook" as const;
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
      <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs" onClick={onAbrir}>
        <Webhook className="h-3.5 w-3.5" /> {t("apiKeys.webhook.register")}
      </Button>
    );
  }
  if (que === "sin") return <span className="whitespace-nowrap text-muted-foreground/70">{t("apiKeys.webhook.none")}</span>;
  const w = llave.webhook!;
  const chip = chipDelWebhook(w);
  return (
    // Adentro de un <button> va un <span> con el estilo del Badge (que es un <div>):
    // un div adentro de un botón no es HTML válido y el botón se queda sin nombre.
    <button type="button" onClick={onAbrir} aria-haspopup="dialog"
      className="group inline-flex min-w-0 max-w-full flex-col items-end gap-0.5 rounded-md text-right sm:items-start sm:text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className={cn(badgeVariants({ variant: chip.variant }), "whitespace-nowrap font-medium group-hover:underline")}>{t(chip.texto)}</span>
      <span className="max-w-[14rem] truncate text-[11px] text-muted-foreground" title={w.url_host}>{w.url_host}</span>
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
    <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/** El diálogo del webhook de una key. `llave` sale de la lista (fresca tras cada
 *  invalidación); si no tiene webhook y la persona es la dueña, es el alta. */
export function DialogoWebhook({ llave, youId, onCerrar }: {
  llave: LlaveConWebhook | null; youId: string | null | undefined; onCerrar: () => void;
}) {
  const qc = useQueryClient();
  const { t, language } = useLanguage();
  const lang = language;
  const fecha = useFecha();
  // El secreto vive SOLO acá, en memoria, hasta cerrar: no va a la caché de
  // react-query, ni a la URL, ni a ningún log.
  const [secreto, setSecreto] = useState<string | null>(null);
  // El que se acaba de registrar, hasta que la lista vuelva con él (si no, entre el
  // alta y la relectura se vería otra vez el formulario).
  const [recien, setRecien] = useState<WebhookResumen | null>(null);
  const [url, setUrl] = useState("");
  const [sinPropios, setSinPropios] = useState(true);
  const [prueba, setPrueba] = useState<Prueba | null>(null);
  const [pestana, setPestana] = useState("estado");
  const [soloFallidas, setSoloFallidas] = useState(false);
  const [borrar, setBorrar] = useState(false);

  const abierto = !!llave;
  const w = llave?.webhook ?? (recien && recien.api_key_id === llave?.id ? recien : null);
  const esDueno = !!youId && llave?.acts_as?.id === youId;
  const nombreDueno = llave?.acts_as?.name?.trim() || null;

  const cerrar = () => {
    setSecreto(null); setRecien(null); setUrl(""); setSinPropios(true); setPrueba(null);
    setPestana("estado"); setSoloFallidas(false); setBorrar(false);
    onCerrar();
  };
  const refrescar = () => qc.invalidateQueries({ queryKey: ["api-keys"] });
  const alFallar = (e: unknown) => toast.error((e as Error)?.message ?? t("apiKeys.loadError"));

  const crear = useMutation({
    mutationFn: () => adminInvoke<{ webhook: WebhookResumen; secret: string }>("manage-api-keys", {
      action: "webhook_create", lang, key_id: llave!.id, url: url.trim(), exclude_own: sinPropios,
    }),
    onSuccess: (res) => { setSecreto(res.secret); setRecien(res.webhook); setUrl(""); refrescar(); toast.success(t("apiKeys.webhook.toast.registered")); },
    onError: alFallar,
  });
  const probar = useMutation({
    mutationFn: (accion: "webhook_test" | "webhook_resume") =>
      adminInvoke<PruebaResp>("manage-api-keys", { action: accion, lang, id: w!.id }),
    onSuccess: (res) => {
      setPrueba(res.test); setSecreto(null); setPestana("estado"); refrescar();
      if (res.test.activated) toast.success(t("apiKeys.webhook.toast.activated"));
    },
    onError: alFallar,
  });
  const pausar = useMutation({
    mutationFn: () => adminInvoke("manage-api-keys", { action: "webhook_pause", lang, id: w!.id }),
    onSuccess: () => { setPrueba(null); refrescar(); toast.success(t("apiKeys.webhook.toast.paused")); },
    onError: alFallar,
  });
  const quitar = useMutation({
    mutationFn: () => adminInvoke("manage-api-keys", { action: "webhook_delete", lang, id: w!.id }),
    onSuccess: () => { refrescar(); toast.success(t("apiKeys.webhook.toast.deleted")); cerrar(); },
    onError: (e) => { setBorrar(false); alFallar(e); },
  });

  const entregas = useQuery({
    queryKey: ["api-keys", "webhook-deliveries", w?.id, soloFallidas],
    queryFn: () => adminInvoke<{ webhook: WebhookResumen; deliveries: Entrega[] }>("manage-api-keys", {
      action: "webhook_deliveries", lang, id: w!.id, only_failed: soloFallidas,
    }),
    enabled: abierto && !!w && pestana === "entregas",
  });

  const ocupado = probar.isPending || pausar.isPending || quitar.isPending;
  const urlValida = /^https:\/\/\S+$/i.test(url.trim());

  let cuerpo: React.ReactNode = null;
  if (!llave) cuerpo = null;
  else if (secreto && w) {
    // ── recién registrado: el secreto, una sola vez ──
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
          <p className="text-sm text-muted-foreground"><ConFormato texto={t("apiKeys.webhook.nextTest")} /></p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={cerrar}>{t("apiKeys.webhook.later")}</Button>
          <Button className="gap-1.5" disabled={probar.isPending} onClick={() => probar.mutate("webhook_test")}>
            {probar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t("apiKeys.webhook.sendTest")}
          </Button>
        </DialogFooter>
      </>
    );
  } else if (!w) {
    // ── alta (solo la dueña; a los demás la celda ni les ofrece abrir) ──
    cuerpo = (
      <>
        <DialogHeader>
          <DialogTitle>{t("apiKeys.webhook.registerTitle", { name: llave.name })}</DialogTitle>
          <DialogDescription><ConFormato texto={t("apiKeys.webhook.registerIntro")} /></DialogDescription>
        </DialogHeader>
        {esDueno ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="webhook-url">{t("apiKeys.webhook.url")}</Label>
              <Input id="webhook-url" type="url" inputMode="url" autoComplete="off" spellCheck={false} autoFocus
                placeholder={t("apiKeys.webhook.urlPlaceholder")} value={url} onChange={(e) => setUrl(e.target.value)} />
              <p className="text-xs text-muted-foreground"><ConFormato texto={t("apiKeys.webhook.urlHint")} /></p>
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={sinPropios}
                onChange={(e) => setSinPropios(e.target.checked)} />
              <span>
                <span className="font-medium">{t("apiKeys.webhook.excludeOwn")}</span>
                <span className="block text-xs text-muted-foreground">{t("apiKeys.webhook.excludeOwnHint")}</span>
              </span>
            </label>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {nombreDueno ? t("apiKeys.webhook.onlyOwner", { name: nombreDueno }) : t("apiKeys.webhook.onlyOwnerNoName")}
          </p>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={cerrar}>{t("common.cancel")}</Button>
          {esDueno && (
            <Button className="gap-1.5" disabled={!urlValida || crear.isPending} onClick={() => crear.mutate()}>
              {crear.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {t("apiKeys.webhook.registerButton")}
            </Button>
          )}
        </DialogFooter>
      </>
    );
  } else {
    // ── estado y entregas ──
    const chip = chipDelWebhook(w);
    const fallando = w.status === "active" && w.consecutive_failures > 0;
    const ayuda =
      w.status === "disabled" ? textoDelMotivo(w.disabled_reason, t)
      : w.status === "paused" ? t("apiKeys.webhook.help.paused")
      : w.status === "pending" ? t("apiKeys.webhook.help.pending")
      : fallando ? t("apiKeys.webhook.help.failing")
      : t("apiKeys.webhook.help.active");
    const puedeProbar = esDueno && (w.status === "pending" || w.status === "active");
    const puedeReanudar = esDueno && (w.status === "paused" ||
      (w.status === "disabled" && !MOTIVOS_SIN_VUELTA.has(w.disabled_reason ?? "")));
    const errorUltimo = textoDelError(w.last_error, t);
    cuerpo = (
      <>
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {t("apiKeys.webhook.title", { name: llave.name })}
            <Badge variant={chip.variant} className="font-medium">{t(chip.texto)}</Badge>
          </DialogTitle>
          <DialogDescription>{ayuda}</DialogDescription>
        </DialogHeader>
        <Tabs value={pestana} onValueChange={setPestana} className="min-w-0">
          <TabsList>
            <TabsTrigger value="estado">{t("apiKeys.webhook.tab.status")}</TabsTrigger>
            <TabsTrigger value="entregas">{t("apiKeys.webhook.tab.deliveries")}</TabsTrigger>
          </TabsList>
          <TabsContent value="estado" className="space-y-4">
            {prueba && <ResultadoDePrueba prueba={prueba} />}
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
                {errorUltimo && <span className="block text-xs text-destructive">{errorUltimo}</span>}
              </Dato>
              {w.consecutive_failures > 0 && (
                <Dato etiqueta={t("apiKeys.webhook.detail.failures")}>
                  {w.failing_since
                    ? t("apiKeys.webhook.detail.failuresSince", { n: w.consecutive_failures, when: fecha(w.failing_since) })
                    : w.consecutive_failures}
                </Dato>
              )}
              {w.status === "active" && w.next_attempt_at && new Date(w.next_attempt_at).getTime() > Date.now() && (
                <Dato etiqueta={t("apiKeys.webhook.detail.nextAttempt")}>{fecha(w.next_attempt_at)}</Dato>
              )}
              {w.status === "paused" && (
                <Dato etiqueta={t("apiKeys.webhook.state.paused")}>
                  {w.paused_by?.name
                    ? t("apiKeys.webhook.detail.pausedBy", { name: w.paused_by.name, when: fecha(w.paused_at) })
                    : t("apiKeys.webhook.detail.pausedWhen", { when: fecha(w.paused_at) })}
                </Dato>
              )}
              {w.status === "disabled" && (
                <Dato etiqueta={t("apiKeys.webhook.state.disabled")}>
                  {t("apiKeys.webhook.detail.disabledOn", { when: fecha(w.disabled_at) })}
                </Dato>
              )}
            </dl>
            {!esDueno && (
              <p className="text-xs text-muted-foreground">
                {nombreDueno ? t("apiKeys.webhook.onlyOwner", { name: nombreDueno }) : t("apiKeys.webhook.onlyOwnerNoName")}
              </p>
            )}
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
          <Button variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" disabled={ocupado} onClick={() => setBorrar(true)}>
            <Trash2 className="h-4 w-4" /> {t("apiKeys.webhook.delete")}
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            {w.status === "active" && (
              <Button variant="outline" className="gap-1.5" disabled={ocupado} onClick={() => pausar.mutate()}>
                {pausar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />} {t("apiKeys.webhook.pause")}
              </Button>
            )}
            {puedeProbar && (
              <Button className="gap-1.5" disabled={ocupado} onClick={() => probar.mutate("webhook_test")}>
                {probar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t("apiKeys.webhook.sendTest")}
              </Button>
            )}
            {puedeReanudar && (
              <Button className="gap-1.5" disabled={ocupado} onClick={() => probar.mutate("webhook_resume")}>
                {probar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} {t("apiKeys.webhook.resume")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <Dialog open={abierto} onOpenChange={(o) => { if (!o) cerrar(); }}>
        {/* grid-cols-[minmax(0,1fr)]: que la tabla de entregas se desplace en su caja
            y no ensanche el diálogo (mismo arreglo que la referencia del API). */}
        <DialogContent className="max-h-[85vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-3xl">
          {cuerpo}
        </DialogContent>
      </Dialog>
      <AlertDialog open={borrar && !!w} onOpenChange={(o) => { if (!o) setBorrar(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("apiKeys.webhook.deleteTitle", { name: llave?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("apiKeys.webhook.deleteBody", { host: w?.url_host ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); quitar.mutate(); }}>
              {quitar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("apiKeys.webhook.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ResultadoDePrueba({ prueba }: { prueba: Prueba }) {
  const { t } = useLanguage();
  const ok = prueba.delivered;
  return (
    <div role="status" className={`space-y-1 rounded-md border p-3 text-sm ${ok ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={ok ? "success-soft" : "destructive-soft"}>
          {ok ? t("apiKeys.webhook.test.delivered") : t("apiKeys.webhook.test.notDelivered")}
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
            const reintenta = e.state === "pending" && !prueba && webhook.next_attempt_at
              && new Date(webhook.next_attempt_at).getTime() > Date.now() ? webhook.next_attempt_at : null;
            // En el teléfono cada celda es una fila "etiqueta — valor" (tabla-movil):
            // lo que tiene más de una parte va en UN div, o se reparte a lo ancho.
            return (
              <tr key={e.id} className="border-b border-border/40 align-top last:border-0">
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
                      <span className="block whitespace-nowrap text-xs text-muted-foreground">
                        {t("apiKeys.webhook.deliveries.lastAt", { when: fecha(e.last_attempt_at) })}
                      </span>
                    )}
                  </div>
                </td>
                <td data-label={cols.resultado} className="px-3 py-2">
                  <div className="flex flex-col items-end gap-0.5 sm:items-start">
                    {e.state === "delivered" && (
                      <Badge variant="success-soft" className="whitespace-nowrap">
                        {t("apiKeys.webhook.deliveries.delivered")}{e.last_status_code ? ` · ${e.last_status_code}` : ""}
                      </Badge>
                    )}
                    {e.state === "pending" && (
                      <Badge variant="warning-soft" className="whitespace-nowrap">
                        {reintenta ? t("apiKeys.webhook.deliveries.retrying", { when: fecha(reintenta) }) : t("apiKeys.webhook.deliveries.pending")}
                      </Badge>
                    )}
                    {e.state === "dropped" && (
                      <Badge variant="destructive-soft">
                        {t("apiKeys.webhook.deliveries.dropped", {
                          reason: e.drop_reason && DESCARTES[e.drop_reason] ? t(DESCARTES[e.drop_reason]) : t("apiKeys.webhook.drop.other"),
                        })}
                      </Badge>
                    )}
                    {error && e.state !== "delivered" && <span className="text-xs text-muted-foreground">{error}</span>}
                    {e.uncertain && e.state !== "delivered" && (
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
