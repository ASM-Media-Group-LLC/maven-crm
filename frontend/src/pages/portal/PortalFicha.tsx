import { useEffect, useId, useMemo, useState } from "react";
import { Loader2, Plus, ShieldCheck, X } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { useGuardarFicha, useMiFicha, usePortal } from "@/hooks/usePortal";
import {
  CAMPOS_FICHA,
  type CampoFicha,
  cambiosDe,
  type DefCampo,
  etiquetasDe,
  type Ficha,
  type IdSeccion,
  respondidas,
  SECCIONES,
  textoDeEtiquetas,
  TONOS,
} from "@/lib/portal/ficha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// MI FICHA: la creadora completa su parte de «Operaciones» (22 respuestas, en
// tres secciones). Guarda con portal_guardar_ficha, que solo acepta esas columnas;
// cada cambio queda en el historial del perfil con su nombre y la hora, y lo ve
// la agencia.

const MAXIMO = 4000;

export default function PortalFicha() {
  const { activa } = usePortal();
  // Cambiar de agencia es otra ficha: el borrador empieza de cero.
  return <FormularioFicha key={activa.creator_id} creatorId={activa.creator_id} />;
}

function FormularioFicha({ creatorId }: { creatorId: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const ficha = useMiFicha(creatorId);
  const guardar = useGuardarFicha(creatorId);
  const [seccion, setSeccion] = useState<IdSeccion>("personaje");
  const [borrador, setBorrador] = useState<Partial<Record<CampoFicha, string>>>({});

  const guardada = ficha.data;
  const cambios = useMemo(() => (guardada ? cambiosDe(guardada, borrador) : {}), [guardada, borrador]);
  const pendientes = Object.keys(cambios).length > 0;
  const actual: Partial<Ficha> = useMemo(() => ({ ...(guardada ?? {}), ...borrador }), [guardada, borrador]);

  // Salir con cambios sin guardar: el navegador pregunta.
  useEffect(() => {
    if (!pendientes) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [pendientes]);

  const cambiar = (c: CampoFicha, v: string) => setBorrador((b) => ({ ...b, [c]: v }));
  const onGuardar = () => {
    guardar.mutate(cambios, {
      onSuccess: () => {
        setBorrador({});
        toast({ title: t("portal.ficha.guardado") });
      },
      onError: () => toast({ title: t("portal.ficha.errorGuardar"), variant: "destructive" }),
    });
  };

  if (ficha.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:px-8 md:py-10">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (ficha.isError || !guardada) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10 text-center md:px-8">
        <p className="text-sm text-muted-foreground">{t("portal.ficha.errorCargar")}</p>
        <Button className="mt-4" variant="outline" onClick={() => ficha.refetch()}>{t("portal.shell.reintentar")}</Button>
      </div>
    );
  }

  const total = CAMPOS_FICHA.length;
  const hechas = respondidas(actual);
  const activaSec = SECCIONES.find((s) => s.id === seccion) ?? SECCIONES[0];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("portal.ficha.titulo")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("portal.ficha.subtitulo")}</p>
        </div>
        <span className="text-sm font-medium tabular-nums text-muted-foreground">{t("portal.ficha.progreso", { hechas, total })}</span>
      </div>
      <Progress value={(hechas / total) * 100} className="mt-4 h-2" aria-label={t("portal.ficha.progreso", { hechas, total })} />

      <div className="mt-6 lg:grid lg:grid-cols-[14rem_1fr] lg:gap-8">
        {/* Las tres secciones: arriba en el celular, al costado en el computador */}
        <div role="tablist" aria-label={t("portal.ficha.titulo")} className="grid grid-cols-3 gap-2 lg:sticky lg:top-6 lg:flex lg:h-fit lg:flex-col">
          {SECCIONES.map((s) => {
            const n = respondidas(actual, s.campos.map((c) => c.clave));
            const elegida = s.id === seccion;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={elegida}
                onClick={() => setSeccion(s.id)}
                className={cn(
                  "flex min-h-14 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  elegida ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted",
                )}
              >
                <span className={cn("text-sm font-semibold leading-tight", elegida && "text-primary")}>{t(s.titulo)}</span>
                <span className="mt-0.5 text-xs tabular-nums text-muted-foreground">{n}/{s.campos.length}</span>
              </button>
            );
          })}
        </div>

        <section role="tabpanel" aria-label={t(activaSec.titulo)} className="mt-6 lg:mt-0">
          <p className="text-sm text-muted-foreground">{t(activaSec.descripcion)}</p>
          <div className="mt-4 space-y-4">
            {activaSec.campos.map((def) => (
              <Campo key={def.clave} def={def} valor={actual[def.clave] ?? ""} onCambio={(v) => cambiar(def.clave, v)} />
            ))}
          </div>
          <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("portal.ficha.aviso")}
          </p>
        </section>
      </div>

      {/* Cambios sin guardar: la barra aparece encima del menú de abajo */}
      {pendientes && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-64">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p className="text-sm font-medium">{t("portal.ficha.pendientes")}</p>
            <div className="flex shrink-0 gap-2">
              <Button variant="ghost" className="min-h-11" onClick={() => setBorrador({})} disabled={guardar.isPending}>
                {t("portal.ficha.descartar")}
              </Button>
              <Button className="min-h-11" onClick={onGuardar} disabled={guardar.isPending}>
                {guardar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {t(guardar.isPending ? "portal.ficha.guardando" : "portal.ficha.guardar")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ def, valor, onCambio }: { def: DefCampo; valor: string; onCambio: (v: string) => void }) {
  const { t } = useLanguage();
  const id = useId();
  const ayudaId = `${id}-ayuda`;
  const hecha = valor.trim().length > 0;
  return (
    <div className={cn("rounded-2xl border bg-card p-4 transition-colors", hecha ? "border-border" : "border-dashed border-border")}>
      <Label id={`${id}-pregunta`} htmlFor={id} className="text-base font-semibold leading-snug">{t(def.pregunta)}</Label>
      {def.ayuda && <p id={ayudaId} className="mt-1 text-sm text-muted-foreground">{t(def.ayuda)}</p>}
      <div className="mt-3">
        {def.control === "tono" && <CampoTono id={id} preguntaId={`${id}-pregunta`} valor={valor} onCambio={onCambio} />}
        {def.control === "etiquetas" && <CampoEtiquetas id={id} valor={valor} onCambio={onCambio} />}
        {def.control === "texto" && (
          <Input
            id={id}
            value={valor}
            maxLength={MAXIMO}
            placeholder={def.ejemplo ? t(def.ejemplo) : undefined}
            aria-describedby={def.ayuda ? ayudaId : undefined}
            onChange={(e) => onCambio(e.target.value)}
            className="min-h-11 text-base"
          />
        )}
        {def.control === "parrafo" && (
          <Textarea
            id={id}
            value={valor}
            maxLength={MAXIMO}
            rows={3}
            placeholder={def.ejemplo ? t(def.ejemplo) : undefined}
            aria-describedby={def.ayuda ? ayudaId : undefined}
            onChange={(e) => onCambio(e.target.value)}
            className="text-base"
          />
        )}
      </div>
    </div>
  );
}

/** El tono: las opciones del onboarding o una escrita a mano. */
function CampoTono({ id, preguntaId, valor, onCambio }: { id: string; preguntaId: string; valor: string; onCambio: (v: string) => void }) {
  const { t } = useLanguage();
  const elegido = TONOS.find((o) => o.valor.toLowerCase() === valor.trim().toLowerCase());
  const [otra, setOtra] = useState(!elegido && valor.trim().length > 0);
  return (
    <div>
      <div role="radiogroup" aria-labelledby={preguntaId} className="flex flex-wrap gap-2">
        {TONOS.map((o) => {
          const activo = !otra && elegido?.valor === o.valor;
          return (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => {
                setOtra(false);
                onCambio(activo ? "" : o.valor);
              }}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
              )}
            >
              {t(o.etiqueta)}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={otra}
          onClick={() => {
            setOtra(true);
            if (elegido) onCambio("");
          }}
          className={cn(
            "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            otra ? "border-primary bg-primary text-primary-foreground" : "border-dashed border-border bg-background hover:bg-muted",
          )}
        >
          {t("portal.ficha.otra")}
        </button>
      </div>
      {otra && (
        <Input
          id={id}
          autoFocus
          value={elegido ? "" : valor}
          maxLength={MAXIMO}
          placeholder={t("portal.ficha.otraPh")}
          onChange={(e) => onCambio(e.target.value)}
          className="mt-3 min-h-11 text-base"
        />
      )}
    </div>
  );
}

/** Una lista de palabras: se guarda «a, b, c», como la lee Operaciones. */
function CampoEtiquetas({ id, valor, onCambio }: { id: string; valor: string; onCambio: (v: string) => void }) {
  const { t } = useLanguage();
  const lista = etiquetasDe(valor);
  const [nueva, setNueva] = useState("");
  const agregar = () => {
    const limpia = nueva.trim();
    if (!limpia) return;
    onCambio(textoDeEtiquetas([...lista, ...limpia.split(",")]));
    setNueva("");
  };
  return (
    <div>
      {lista.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {lista.map((e) => (
            <li key={e} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-3 pr-1 text-sm font-medium text-primary">
              {e}
              <button
                type="button"
                onClick={() => onCambio(textoDeEtiquetas(lista.filter((x) => x !== e)))}
                aria-label={t("portal.ficha.quitar", { valor: e })}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          value={nueva}
          maxLength={200}
          placeholder={t("portal.ficha.etiquetaPh")}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              agregar();
            }
          }}
          className="min-h-11 text-base"
        />
        <Button type="button" variant="outline" className="min-h-11 shrink-0" onClick={agregar} disabled={!nueva.trim()}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          {t("portal.ficha.agregar")}
        </Button>
      </div>
    </div>
  );
}
