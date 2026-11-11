import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, Check, CheckCircle2, CircleDashed, Clock, FileText, KeyRound, Loader2, PlugZap,
  RefreshCw, ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { useEsDuenoDeLaAgencia } from "@/hooks/useEsDueno";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
import { armarInstrucciones } from "@/lib/conexionEquipo/instrucciones";
import { haceCuanto } from "@/lib/conexionEquipo/resumen";
import { SCOPE_EQUIPO, llaveDelEquipo } from "@/lib/conexionEquipo/webhook";
import { API_BASE } from "./AdminApiKeys";
import { ConFormato, CopyButton } from "./apiKeysPiezas";
import { Bloque, Fallo, Nota } from "./conexionEquipo/piezas";
import { CLAVE, cambiarModo, useIntegracion, useLlaves, useWebhooksEquipo, type Integracion } from "./conexionEquipo/datos";
import { UltimaSync } from "./conexionEquipo/UltimaSync";
import { RolesSinPermisos } from "./conexionEquipo/RolesSinPermisos";
import { Pendientes } from "./conexionEquipo/Pendientes";
import { Avisos } from "./conexionEquipo/Avisos";

// AJUSTES → CONECTAR TU PLATAFORMA (agencias conectadas, decisión de Alvaro del
// 11/11/2026). Cuando llega una agencia nueva, su dueño conecta SOLO la plataforma de
// RR. HH. de la agencia (Backstage u otra) con Maven:
//   · la plataforma manda roles y personas (POST /equipo/sync, llave equipo:write);
//   · los roles nuevos llegan sin permisos y el dueño marca qué ve cada uno;
//   · quien no tiene cuenta queda pendiente hasta que el dueño o un admin la apruebe;
//   · Maven devuelve personas y roles, horas de Cowork, la nota de Argos y avisos.
// Todo nace en ENSAYO: solo el dueño de ESTA agencia (tenant_owners) activa «Aplicar».
//
// La ven los admins (la misma puerta que API keys). Un fallo se dice como fallo.

/** Ajustes → API keys con el alta abierta y el permiso del equipo ya marcado. */
export const ENLACE_CREAR_LLAVE = `/settings?${new URLSearchParams({ sub: "api-keys", crear: SCOPE_EQUIPO }).toString()}`;

type Tono = "bien" | "ojo" | "mal" | "apagado" | "normal";
const COLOR: Record<Tono, string> = {
  bien: "text-success", ojo: "text-warning", mal: "text-destructive", apagado: "text-muted-foreground", normal: "text-foreground",
};

function Dato({ etiqueta, valor, detalle, tono = "normal", icono }: {
  etiqueta: string; valor: ReactNode; detalle?: ReactNode; tono?: Tono; icono?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-panel border border-border/50 bg-background/40 p-3.5">
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
      <span className={cn("flex items-center gap-2 font-display text-lg font-semibold leading-tight", COLOR[tono])}>
        {icono}{valor}
      </span>
      {detalle && <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{detalle}</span>}
    </div>
  );
}

function OpcionModo({ activo, titulo, desc, onElegir, deshabilitado }: {
  activo: boolean; titulo: string; desc: string; onElegir: () => void; deshabilitado: boolean;
}) {
  return (
    <button type="button" role="radio" aria-checked={activo} disabled={deshabilitado && !activo}
      aria-disabled={deshabilitado} onClick={() => { if (!deshabilitado && !activo) onElegir(); }}
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-panel border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        activo ? "border-primary/60 bg-background/70 ring-1 ring-primary/25" : "border-border/50 bg-background/20",
        !activo && !deshabilitado && "hover:bg-muted/30",
        deshabilitado && !activo && "cursor-not-allowed opacity-60",
      )}>
      <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
        activo ? "border-primary" : "border-muted-foreground/50")}>
        {activo && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{titulo}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
    </button>
  );
}

type EstadoLlave = { cargando: boolean; error: boolean; conectada: boolean; nombre: string | null; vencida: boolean; reintentar: () => void };

function Estado({ integracion, llave }: {
  integracion: ReturnType<typeof useIntegracion>; llave: EstadoLlave;
}) {
  const { t } = useLanguage();
  const f = useFormato();
  const qc = useQueryClient();
  const fila = integracion.data ?? null;
  const dueno = useEsDuenoDeLaAgencia(fila?.tenant_id);
  const [confirmar, setConfirmar] = useState(false);

  const cambiar = useMutation({
    mutationFn: (aplicar: boolean) => cambiarModo(fila!.tenant_id, aplicar),
    networkMode: "always",
    onSuccess: (aplicar) => {
      qc.setQueryData<Integracion | null>(CLAVE.integracion, (antes) => (antes ? { ...antes, aplicar } : antes));
      void qc.invalidateQueries({ queryKey: CLAVE.integracion }).then(() => {}, () => {});
      setConfirmar(false);
      toast.success(aplicar ? t("conexionEquipo.modo.yaAplica") : t("conexionEquipo.modo.volvioAEnsayo"));
    },
    onError: (e) => {
      toast.error((e as Error)?.message === "sin_permiso" ? t("conexionEquipo.modo.soloDueno") : t("conexionEquipo.modo.noSeGuardo"));
    },
  });

  if (integracion.isLoading) {
    return (
      <Bloque icono={Activity} titulo={t("conexionEquipo.estado.titulo")} para={t("conexionEquipo.estado.para")}>
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      </Bloque>
    );
  }
  if (integracion.isError) {
    return (
      <Bloque icono={Activity} titulo={t("conexionEquipo.estado.titulo")} para={t("conexionEquipo.estado.para")}>
        <Fallo onReintentar={() => void integracion.refetch()} detalle={(integracion.error as Error | null)?.message} />
      </Bloque>
    );
  }

  const aplicando = fila?.aplicar === true;
  const puedeCambiar = !!fila && dueno.esDueno === true && !cambiar.isPending;

  const conexion = llave.cargando
    ? <Dato etiqueta={t("conexionEquipo.estado.llave")} valor={<Loader2 className="h-4 w-4 animate-spin" />} tono="apagado" />
    : llave.error
      ? <Dato etiqueta={t("conexionEquipo.estado.llave")} tono="ojo" icono={<AlertTriangle className="h-4 w-4" />}
          valor={t("conexionEquipo.estado.noSe")}
          detalle={(
            <span className="flex flex-wrap items-center gap-2">
              {t("conexionEquipo.estado.llaveNoSe")}
              <button type="button" onClick={llave.reintentar} className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline">
                <RefreshCw className="h-3 w-3" />{t("common.retry")}
              </button>
            </span>
          )} />
      : llave.conectada
        ? <Dato etiqueta={t("conexionEquipo.estado.llave")} tono="bien" icono={<CheckCircle2 className="h-4 w-4" />}
            valor={t("conexionEquipo.estado.conectada")} detalle={t("conexionEquipo.estado.llaveActiva", { nombre: llave.nombre ?? "" })} />
        : <Dato etiqueta={t("conexionEquipo.estado.llave")} tono={llave.vencida ? "mal" : "apagado"} icono={<CircleDashed className="h-4 w-4" />}
            valor={t("conexionEquipo.estado.sinConectar")}
            detalle={llave.vencida ? t("conexionEquipo.estado.llaveVencida", { nombre: llave.nombre ?? "" }) : t("conexionEquipo.estado.sinLlave")} />;

  const corta = fila?.ultima_sync ?? null;
  const ultimo = fila?.ultima_sync_at
    ? <Dato etiqueta={t("conexionEquipo.estado.ultimoEnvio")} icono={<Clock className="h-4 w-4 text-muted-foreground" />}
        valor={haceCuanto(fila.ultima_sync_at, f.intl("es-CO"))}
        detalle={(
          <>
            {new Date(fila.ultima_sync_at).toLocaleString(f.intl("es-CO"), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            {corta && ` · ${t("conexionEquipo.estado.resumenCorto", { recibidas: corta.recibidas ?? 0, cambios: corta.cambios ?? 0 })}`}
          </>
        )} />
    : <Dato etiqueta={t("conexionEquipo.estado.ultimoEnvio")} tono="apagado" icono={<Clock className="h-4 w-4" />}
        valor={t("conexionEquipo.estado.nunca")} detalle={t("conexionEquipo.estado.nuncaDetalle")} />;

  const modo = (
    <Dato etiqueta={t("conexionEquipo.estado.modo")} tono={aplicando ? "bien" : "normal"}
      icono={aplicando ? <CheckCircle2 className="h-4 w-4" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
      valor={aplicando ? t("conexionEquipo.modo.aplicando") : t("conexionEquipo.modo.ensayo")}
      detalle={aplicando ? t("conexionEquipo.modo.aplicandoCorto") : t("conexionEquipo.modo.ensayoCorto")} />
  );

  let permiso: ReactNode = null;
  if (!fila) permiso = <Nota>{t("conexionEquipo.modo.sinFila")}</Nota>;
  else if (dueno.error) {
    permiso = (
      <Nota tono="ojo">
        <span className="flex flex-wrap items-center gap-2">
          {t("conexionEquipo.modo.duenoNoSe")}
          <button type="button" onClick={dueno.reintentar} className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
            <RefreshCw className="h-3 w-3" />{t("common.retry")}
          </button>
        </span>
      </Nota>
    );
  } else if (dueno.esDueno === false) permiso = <Nota>{t("conexionEquipo.modo.soloDueno")}</Nota>;

  return (
    <Bloque icono={Activity} titulo={t("conexionEquipo.estado.titulo")} para={t("conexionEquipo.estado.para")}>
      <div className="grid gap-2 sm:grid-cols-3">
        {conexion}
        {ultimo}
        {modo}
      </div>
      <div className="flex flex-col gap-3">
        <div role="radiogroup" aria-label={t("conexionEquipo.estado.modo")} className="grid gap-2 sm:grid-cols-2">
          <OpcionModo activo={!aplicando} titulo={t("conexionEquipo.modo.ensayo")} desc={t("conexionEquipo.modo.ensayoDesc")}
            deshabilitado={!puedeCambiar} onElegir={() => { setConfirmar(false); cambiar.mutate(false); }} />
          <OpcionModo activo={aplicando} titulo={t("conexionEquipo.modo.aplicar")} desc={t("conexionEquipo.modo.aplicandoDesc")}
            deshabilitado={!puedeCambiar} onElegir={() => setConfirmar(true)} />
        </div>
        {permiso}
        {confirmar && !aplicando && (
          <div role="alertdialog" aria-labelledby="confirmar-aplicar" className="flex flex-col gap-3 rounded-panel border border-warning/40 bg-warning/5 p-3 sm:p-4">
            <p id="confirmar-aplicar" className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-warning" />{t("conexionEquipo.modo.confirmarTitulo")}
            </p>
            <p className="text-sm text-muted-foreground">{t("conexionEquipo.modo.confirmarCuerpo")}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={cambiar.isPending} onClick={() => setConfirmar(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="button" size="sm" className="gap-1.5" disabled={cambiar.isPending || !puedeCambiar} onClick={() => cambiar.mutate(true)}>
                {cambiar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {t("conexionEquipo.modo.confirmarSi")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Bloque>
  );
}

function Paso({ n, hecho, titulo, desc, children }: { n: number; hecho: boolean; titulo: string; desc: string; children: ReactNode }) {
  const { t } = useLanguage();
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-panel border border-border/50 bg-background/30 p-4">
      <div className="flex items-center gap-3">
        <span className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular-nums",
          hecho ? "border-success/40 bg-success/10 text-success" : "border-border/70 bg-background/60 text-foreground/80",
        )}>
          {hecho ? <Check className="h-4 w-4" /> : n}
        </span>
        <h3 className="min-w-0 flex-1 text-sm font-semibold">{titulo}</h3>
        {hecho && <Badge variant="success-soft" className="shrink-0 font-normal">{t("conexionEquipo.pasos.hecho")}</Badge>}
      </div>
      <p className="text-sm text-muted-foreground"><ConFormato texto={desc} /></p>
      <div className="mt-auto flex flex-wrap items-center gap-2">{children}</div>
    </li>
  );
}

function Pasos({ llave, aplicando }: { llave: EstadoLlave; aplicando: boolean }) {
  const { t } = useLanguage();
  const [ver, setVer] = useState(false);
  const texto = armarInstrucciones(t, API_BASE);
  return (
    <Bloque icono={ListChecks} titulo={t("conexionEquipo.pasos.titulo")} para={t("conexionEquipo.pasos.para")}>
      <ol className="grid gap-3 lg:grid-cols-3">
        <Paso n={1} hecho={llave.conectada} titulo={t("conexionEquipo.pasos.1.titulo")} desc={t("conexionEquipo.pasos.1.desc")}>
          {llave.conectada ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <KeyRound className="h-3.5 w-3.5" />{t("conexionEquipo.pasos.1.hecho", { nombre: llave.nombre ?? "" })}
            </span>
          ) : (
            <Button asChild size="sm" className="gap-1.5">
              <Link to={ENLACE_CREAR_LLAVE}><KeyRound className="h-4 w-4" />{t("conexionEquipo.pasos.1.boton")}</Link>
            </Button>
          )}
        </Paso>
        <Paso n={2} hecho={false} titulo={t("conexionEquipo.pasos.2.titulo")} desc={t("conexionEquipo.pasos.2.desc")}>
          <CopyButton text={texto} label={t("conexionEquipo.pasos.2.copiar")} />
          <Button type="button" variant="ghost" size="sm" aria-expanded={ver} aria-controls="instrucciones-equipo"
            onClick={() => setVer((v) => !v)}>
            {ver ? t("conexionEquipo.pasos.2.ocultar") : t("conexionEquipo.pasos.2.ver")}
          </Button>
        </Paso>
        <Paso n={3} hecho={aplicando} titulo={t("conexionEquipo.pasos.3.titulo")} desc={t("conexionEquipo.pasos.3.desc")}>
          {!aplicando && (
            <Button type="button" variant="ghost" size="sm"
              onClick={() => document.getElementById("ultima-sync")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              {t("conexionEquipo.sync.titulo")}
            </Button>
          )}
        </Paso>
      </ol>
      {ver && (
        <pre id="instrucciones-equipo"
          className="max-h-96 overflow-auto whitespace-pre-wrap rounded-panel border border-border/60 bg-background/60 p-3 font-mono text-[11px] leading-relaxed [overflow-wrap:anywhere]">
          {texto}
        </pre>
      )}
    </Bloque>
  );
}

const ConexionEquipo = () => {
  const { t } = useLanguage();
  const integracion = useIntegracion();
  const llaves = useLlaves();
  // La misma llave que elige Avisos: si hay varias, la que ya tiene aviso.
  const webhooks = useWebhooksEquipo();
  const { llave, activa } = llaveDelEquipo(llaves.data?.keys ?? [], new Set((webhooks.data ?? []).map((w) => w.api_key_id)));
  const estadoLlave: EstadoLlave = {
    cargando: llaves.isLoading,
    // Sin la lista no se sabe: nunca se concluye «sin conectar» por un fallo.
    error: llaves.isError && !llaves.data,
    conectada: activa,
    nombre: llave?.name ?? null,
    vencida: !!llave && !activa,
    reintentar: () => { void llaves.refetch(); },
  };

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <PageHeader title={t("conexionEquipo.titulo")} subtitle={t("conexionEquipo.subtitulo")} icon={<PlugZap />} />
      <Estado integracion={integracion} llave={estadoLlave} />
      <Pasos llave={estadoLlave} aplicando={integracion.data?.aplicar === true} />
      <UltimaSync />
      <RolesSinPermisos />
      <Pendientes />
      <Avisos />
    </div>
  );
};

export default ConexionEquipo;
