import { type ReactNode, useState } from "react";
import { Eye, Globe, Loader2, Lock, Monitor, RefreshCw, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { haceCuanto } from "@/lib/conexionEquipo/resumen";
import { cn } from "@/lib/utils";
import {
  type CambioExigencias, type MotivoBloqueo, type PuestoExigencias,
  cambiosDe, useExigenciasPorPuesto, useGuardarExigencias, useGuardarSoloNavegador, usePosicionesSoloNavegador,
} from "@/hooks/useExigencias";

// CÁMARA Y PANTALLA POR PUESTO (Alvaro, 19/11/2026). Cada puesto pide cámara y
// pantalla por separado; Argos funciona con al menos una de las dos (sin
// ninguna no hay Argos, aunque la persona comparta por su cuenta). Cada cambio avisa a la gente del puesto, a sus jefes y a
// RR. HH. y manda un correo al dueño, los admins y RR. HH.: por eso se confirma
// antes de guardar.

type Cosa = "camara" | "pantalla";
interface Pendiente { puesto: PuestoExigencias; cosa: Cosa; valor: boolean }

const MOTIVO = {
  sin_funcion: "settings.exig.motivo.sinFuncion",
  dueno: "settings.exig.motivo.dueno",
  admin: "settings.exig.motivo.admin",
  propio: "settings.exig.motivo.propio",
} as const satisfies Record<Exclude<MotivoBloqueo, null>, string>;

const CONFIRMAR = {
  camara: { pide: "settings.exig.confirmar.camara.pide", quita: "settings.exig.confirmar.camara.quita" },
  pantalla: { pide: "settings.exig.confirmar.pantalla.pide", quita: "settings.exig.confirmar.pantalla.quita" },
} as const;

function Interruptor({ puesto, cosa, onPedir }: { puesto: PuestoExigencias; cosa: Cosa; onPedir: (p: Pendiente) => void }) {
  const { t } = useLanguage();
  const valor = cosa === "camara" ? puesto.pide_camara : puesto.pide_pantalla;
  const Icono = cosa === "camara" ? Video : Monitor;
  const etiqueta = t(cosa === "camara" ? "settings.exig.camara" : "settings.exig.pantalla");
  return (
    <label className={cn("flex items-center gap-2 text-xs", puesto.puede_cambiar ? "text-foreground" : "text-muted-foreground")}>
      <Icono className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="w-16">{etiqueta}</span>
      <Switch
        checked={valor}
        disabled={!puesto.puede_cambiar}
        onCheckedChange={(v) => onPedir({ puesto, cosa, valor: v })}
        aria-label={t("settings.exig.aria", { cosa: etiqueta, puesto: puesto.nombre })}
      />
    </label>
  );
}

/** «Solo navegador» (Alvaro, 26/11/2026): esa gente no necesita la app de
 *  Maven. No avisa a nadie ni manda correo: se guarda al tocarlo. */
function InterruptorNavegador({ puesto, valor }: { puesto: PuestoExigencias; valor: boolean | undefined }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const guardar = useGuardarSoloNavegador();
  const etiqueta = t("settings.exig.soloNavegador");
  if (valor === undefined) return null;
  return (
    <label className={cn("flex items-center gap-2 text-xs", puesto.puede_cambiar ? "text-foreground" : "text-muted-foreground")} title={t("settings.exig.soloNavegadorAyuda")}>
      <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="whitespace-nowrap">{etiqueta}</span>
      <Switch
        checked={valor}
        disabled={!puesto.puede_cambiar || guardar.isPending}
        onCheckedChange={(v) => guardar.mutate({ posicion: puesto.id, valor: v }, {
          onError: (e) => toast({ title: t("settings.exig.soloNavegadorError"), description: (e as Error).message, variant: "destructive" }),
        })}
        aria-label={t("settings.exig.aria", { cosa: etiqueta, puesto: puesto.nombre })}
      />
    </label>
  );
}

function Confirmar({ p, onCancelar }: { p: Pendiente; onCancelar: () => void }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const guardar = useGuardarExigencias();
  const camara = p.cosa === "camara" ? p.valor : p.puesto.pide_camara;
  const pantalla = p.cosa === "pantalla" ? p.valor : p.puesto.pide_pantalla;
  const clave = CONFIRMAR[p.cosa][p.valor ? "pide" : "quita"];
  const enviar = () => guardar.mutate(
    { posicion: p.puesto.id, camara, pantalla },
    {
      onSuccess: () => { toast({ title: t("settings.exig.guardado") }); onCancelar(); },
      onError: (e) => toast({ title: t("settings.exig.noSeGuardo"), description: (e as Error).message, variant: "destructive" }),
    },
  );
  // Argos funciona con al menos una: entra o sale solo si cambia eso.
  const argosAntes = p.puesto.pide_camara || p.puesto.pide_pantalla;
  const argosDespues = camara || pantalla;
  const lineaArgos = argosAntes === argosDespues ? null : argosDespues ? t("settings.exig.argosEntra") : t("settings.exig.argosSale");
  const textoBoton = guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("settings.exig.confirmarBoton");
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{t(clave, { puesto: p.puesto.nombre })}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {lineaArgos}{" "}
          {t("settings.exig.avisa", { n: p.puesto.personas })}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" className="rounded-lg" onClick={onCancelar} disabled={guardar.isPending}>{t("settings.exig.cancelar")}</Button>
        <Button size="sm" className="rounded-lg" onClick={enviar} disabled={guardar.isPending}>{textoBoton}</Button>
      </div>
    </div>
  );
}

function LineaCambio({ c }: { c: CambioExigencias }) {
  const { t, language } = useLanguage();
  const { quita, pide } = cambiosDe(c);
  const cosas = (l: Cosa[]) => l.map((x) => t(x === "camara" ? "settings.exig.laCamara" : "settings.exig.laPantalla")).join(t("settings.exig.y"));
  const partes: string[] = [];
  if (quita.length) partes.push(t("settings.exig.hist.quito", { cosas: cosas(quita) }));
  if (pide.length) partes.push(t("settings.exig.hist.pidio", { cosas: cosas(pide) }));
  const accion = partes.join(t("settings.exig.y"));
  const frase = c.tipo === "puesto"
    ? t("settings.exig.hist.puesto", { actor: c.actor, accion, puesto: c.puesto ?? "" })
    : t("settings.exig.hist.persona", { actor: c.actor, persona: c.persona ?? "", destino: c.puesto_despues ?? "" });
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-2.5 text-xs">
      <span className="min-w-0 text-foreground">{frase}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground">{haceCuanto(c.created_at, language)}</span>
    </li>
  );
}

export function CamaraPantallaPorPuesto() {
  const { t } = useLanguage();
  const q = useExigenciasPorPuesto();
  const navegador = usePosicionesSoloNavegador();
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);

  let cuerpo: ReactNode;
  if (q.isLoading) {
    cuerpo = <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  } else if (q.isError || !q.data) {
    cuerpo = (
      <div className="flex items-center justify-between gap-3 px-4 py-4 text-sm text-muted-foreground">
        {t("settings.exig.error")}
        <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void q.refetch()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("settings.exig.reintentar")}
        </Button>
      </div>
    );
  } else {
    cuerpo = (
      <>
        <ul className="divide-y divide-border/40">
          {q.data.puestos.map((p) => (
            <li key={p.id} className="px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{p.nombre}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="tabular-nums">{t("settings.exig.personas", { n: p.personas })}</span>
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                      p.pide_camara || p.pide_pantalla ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                      <Eye className="h-3 w-3" />{p.pide_camara || p.pide_pantalla ? t("settings.exig.conArgos") : t("settings.exig.sinArgos")}
                    </span>
                    {p.motivo && p.motivo !== "sin_funcion" && (
                      <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" />{t(MOTIVO[p.motivo])}</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-4">
                  <Interruptor puesto={p} cosa="camara" onPedir={setPendiente} />
                  <Interruptor puesto={p} cosa="pantalla" onPedir={setPendiente} />
                  <InterruptorNavegador puesto={p} valor={navegador.data?.[p.id]} />
                </div>
              </div>
              {pendiente?.puesto.id === p.id && <Confirmar p={pendiente} onCancelar={() => setPendiente(null)} />}
            </li>
          ))}
        </ul>
        {q.data.cambios.length > 0 && (
          <div className="border-t border-border/50">
            <p className="px-4 pt-3 text-xs font-semibold text-foreground">{t("settings.exig.ultimos")}</p>
            <ul className="pb-1">{q.data.cambios.map((c) => <LineaCambio key={c.id} c={c} />)}</ul>
          </div>
        )}
      </>
    );
  }

  const soloVer = !!q.data && q.data.puestos.every((p) => !p.puede_cambiar);
  return (
    <section className="vidrio overflow-hidden p-0">
      <header className="flex items-start gap-3 border-b border-border/50 px-4 py-3">
        <Video className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{t("settings.exig.titulo")}</h2>
          <p className="text-xs text-muted-foreground">{soloVer ? t("settings.exig.subVer") : t("settings.exig.sub")}</p>
        </div>
      </header>
      {cuerpo}
    </section>
  );
}
