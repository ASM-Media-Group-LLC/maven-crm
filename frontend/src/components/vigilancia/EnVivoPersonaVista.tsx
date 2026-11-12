import { useState, type ReactNode } from "react";
import { Camera, Check, CheckCheck, Film, Loader2, Megaphone, Radio } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { minutosDesde } from "@/lib/motivosVivos";
import type { RazonEnVivo } from "@/hooks/useEnVivoPersona";
import { ETIQUETA_ESTADO, NotaViva, horaCorta, textoDuracion, type Tr } from "./piezas";
import type { TranslationKey } from "@/lib/i18n";

// LA VISTA EN VIVO DE UNA PERSONA, solo con props (Alvaro, 11/11/2026).
//
// Teléfono, de arriba abajo: la RAZÓN (qué vio Argos, desde cuándo, la foto que
// lo disparó y si sigue pasando), el escenario (en vivo o el video de esos
// minutos) y, pegados abajo, «Avisarle» y «Revisado ✓» al alcance del pulgar.
// Computadora: el escenario grande a la izquierda y la razón con las acciones a
// la derecha. La página (pages/hr/EnVivoPersona) le pasa los datos; el banco
// visual la dibuja con datos de ejemplo.

export type ModoEscenario = "vivo" | "video";

/** Cada alerta de Argos dicha en palabras (incluye las que no bajan la nota). */
const ETIQUETA_TIPO: Record<string, TranslationKey> = {
  fuera_de_lugar: "vigilancia.estado.fuera_de_lugar",
  sin_pantalla: "vigilancia.estado.sin_pantalla",
  pausa_de_mas: "vigilancia.estado.pausa_de_mas",
  camara_apagada: "vigilancia.estado.camara_apagada",
  camara_tapada: "vigilancia.alerta.camara_tapada",
  se_fue: "vigilancia.estado.se_fue",
  cara_incompleta: "vigilancia.alerta.cara_incompleta",
  celular: "vigilancia.estado.celular",
  usando_celular: "vigilancia.estado.celular",
  distraido: "vigilancia.estado.distraido",
  distraida: "vigilancia.estado.distraido",
  no_mira: "vigilancia.estado.no_mira",
  fuera_lugar: "vigilancia.estado.fuera_de_lugar",
  sin_senal: "vigilancia.alerta.sin_senal",
  fuera_cowork: "vigilancia.estado.fuera_cowork",
};

export function etiquetaDeRazon(r: RazonEnVivo): TranslationKey {
  return ETIQUETA_TIPO[r.tipo] ?? (r.estado ? ETIQUETA_ESTADO[r.estado] : "vigilancia.alerta.otra");
}

/** Lo que hay que leer de un vistazo: qué vio Argos, si sigue, desde cuándo y
 *  cuánto lleva, con su nota viva. Compacta: en el teléfono el en vivo queda
 *  a la vista sin bajar. */
function CabeceraRazon({ razon, razonNoEncontrada, puntos, t, lang }: {
  razon: RazonEnVivo | null;
  razonNoEncontrada: boolean;
  puntos: number | null;
  t: Tr;
  lang: string;
}) {
  const abierta = !!razon && razon.fuente !== "clip" && razon.hasta == null;
  const minutos = razon ? minutosDesde(razon.desde, razon.hasta ? Date.parse(razon.hasta) : Date.now()) : 0;

  if (!razon) {
    return (
      <section className="vidrio sube p-4">
        <div className="v-cont flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">{t("vigilancia.razon.ahora")}</p>
            <h2 className="mt-0.5 text-[17px] font-semibold leading-snug">
              {razonNoEncontrada ? t("vigilancia.razon.noEncontrada") : t("vigilancia.razon.sinNada")}
            </h2>
          </div>
          {puntos != null && <NotaViva puntos={puntos} t={t} />}
        </div>
      </section>
    );
  }

  return (
    <section className={cn("vidrio sube p-4", abierta && "vidrio-glow glow-r")}>
      <div className="v-cont flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">
              {razon.fuente === "clip" ? t("vigilancia.razon.argosGrabo") : razon.fuente === "fuera" ? t("vigilancia.razon.cowork") : t("vigilancia.razon.argosVio")}
            </p>
            <h2 className="mt-0.5 text-[17px] font-semibold leading-snug">{t(etiquetaDeRazon(razon))}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {razon.fuente === "clip" ? null : abierta ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive" />{t("vigilancia.razon.sigue")}
                </span>
              ) : (
                <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {t("vigilancia.razon.cerro", { hora: horaCorta(razon.hasta, lang) })}
                </span>
              )}
              {razon.revisadoAt && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                  <CheckCheck className="h-3 w-3" />{t("vigilancia.razon.revisadoChip")}
                </span>
              )}
            </div>
          </div>
          {puntos != null && <NotaViva puntos={puntos} t={t} />}
        </div>

        {razon.detalle && <p className="text-sm leading-snug text-foreground/85">{razon.detalle}</p>}

        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-control border border-border/50 bg-foreground/[0.03] px-3 py-1.5">
            <dt className="text-[11px] text-muted-foreground">{t("vigilancia.razon.desde")}</dt>
            <dd className="font-display text-base font-semibold tabular-nums leading-tight">{horaCorta(razon.desde, lang)}</dd>
          </div>
          <div className="rounded-control border border-border/50 bg-foreground/[0.03] px-3 py-1.5">
            <dt className="text-[11px] text-muted-foreground">{abierta ? t("vigilancia.razon.lleva") : t("vigilancia.razon.duro")}</dt>
            <dd className="font-display text-base font-semibold tabular-nums leading-tight">{textoDuracion(minutos, t)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/** Lo que completa la razón: la foto que la disparó, quién la revisó y qué
 *  más tiene abierto. En el teléfono va debajo del escenario. */
function ExtrasRazon({ razon, otras, fotoRazon, t, lang }: {
  razon: RazonEnVivo | null;
  otras: RazonEnVivo[];
  fotoRazon: string | null;
  t: Tr;
  lang: string;
}) {
  const [verFoto, setVerFoto] = useState(false);
  const conFoto = !!razon?.capturaPath;
  const conRevision = !!razon?.revisadoAt;
  if (!conFoto && !conRevision && otras.length === 0) return null;
  const ahora = Date.now();

  return (
    <section className="vidrio sube p-4">
      <div className="v-cont flex flex-col gap-3">
        {conRevision && razon && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCheck className="h-3.5 w-3.5 shrink-0 text-success" />
            {razon.revisadoNombre
              ? t("vigilancia.razon.revisadoPor", { nombre: razon.revisadoNombre, hora: horaCorta(razon.revisadoAt, lang) })
              : t("vigilancia.razon.revisadoA", { hora: horaCorta(razon.revisadoAt, lang) })}
          </p>
        )}

        {conFoto && (
          <button type="button" onClick={() => fotoRazon && setVerFoto(true)} disabled={!fotoRazon}
            className="group flex items-center gap-3 rounded-control border border-border/50 bg-foreground/[0.03] p-2 text-left transition-colors hover:border-primary/35 disabled:cursor-default">
            <span className="relative h-14 w-[92px] shrink-0 overflow-hidden rounded-control bg-black/85 ring-1 ring-white/10">
              {fotoRazon
                ? <img src={fotoRazon} alt="" className="h-full w-full object-cover" />
                : <span className="flex h-full items-center justify-center"><Camera className="h-4 w-4 text-white/50" /></span>}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold leading-tight">{t("vigilancia.razon.foto")}</span>
              <span className="block text-xs text-muted-foreground">{fotoRazon ? t("vigilancia.razon.fotoToca") : t("vigilancia.razon.fotoArchivo")}</span>
            </span>
          </button>
        )}

        {otras.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">{t("vigilancia.razon.tambien")}</p>
            <div className="flex flex-wrap gap-1.5">
              {otras.map((o) => (
                <span key={o.id} className="rounded-full border border-border/60 bg-foreground/[0.03] px-2.5 py-1 text-xs">
                  {t(etiquetaDeRazon(o))} <span className="text-muted-foreground tabular-nums">· {textoDuracion(minutosDesde(o.desde, ahora), t)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog open={verFoto} onOpenChange={setVerFoto}>
        <DialogContent className="max-w-4xl gap-3 p-3 sm:p-4">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base">{t("vigilancia.razon.foto")}</DialogTitle>
            <DialogDescription>{razon ? horaCorta(razon.desde, lang) : ""}</DialogDescription>
          </DialogHeader>
          {fotoRazon && <img src={fotoRazon} alt="" className="w-full rounded-panel bg-black object-contain" />}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export interface AccionesVivo {
  avisar: { disponible: boolean; enviando: boolean; onAbrir: () => void; motivoNo: string | null };
  revisar: { visible: boolean; hecho: boolean; enviando: boolean; onRevisar: () => void };
}

function BotonesAccion({ acciones, t, className }: { acciones: AccionesVivo; t: Tr; className?: string }) {
  const { avisar, revisar } = acciones;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex gap-2">
        <button type="button" onClick={avisar.onAbrir} disabled={!avisar.disponible || avisar.enviando}
          className="inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-panel border border-primary/40 bg-primary/10 px-3 text-[15px] font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-45">
          {avisar.enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-[18px] w-[18px]" />}
          {t("vigilancia.accion.avisarle")}
        </button>
        {revisar.visible && (
          <button type="button" onClick={revisar.onRevisar} disabled={revisar.hecho || revisar.enviando}
            className={cn(
              "inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-panel px-3 text-[15px] font-semibold transition-colors disabled:cursor-default",
              revisar.hecho
                ? "border border-success/40 bg-success/10 text-success"
                : "bg-foreground text-background hover:bg-foreground/90",
            )}>
            {revisar.enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : revisar.hecho ? <CheckCheck className="h-[18px] w-[18px]" /> : <Check className="h-[18px] w-[18px]" />}
            {revisar.hecho ? t("vigilancia.accion.revisado") : t("vigilancia.accion.revisar")}
          </button>
        )}
      </div>
      {!avisar.disponible && avisar.motivoNo && (
        <p className="text-center text-[11px] text-muted-foreground">{avisar.motivoNo}</p>
      )}
    </div>
  );
}

export function EnVivoPersonaVista({
  razon, razonNoEncontrada, otras, fotoRazon, puntos, modo, onModo, escenario, video, acciones, pie, t, lang,
}: {
  razon: RazonEnVivo | null;
  razonNoEncontrada: boolean;
  otras: RazonEnVivo[];
  fotoRazon: string | null;
  puntos: number | null;
  modo: ModoEscenario;
  onModo: (m: ModoEscenario) => void;
  escenario: ReactNode;
  video: ReactNode;
  acciones: AccionesVivo;
  /** Debajo de todo (p. ej. «Ver su expediente»). */
  pie?: ReactNode;
  t: Tr;
  lang: string;
}) {
  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Escenario (en el teléfono va DESPUÉS de la razón). */}
        <div className="order-2 flex min-w-0 flex-col gap-3 lg:order-1">
          <div role="tablist" aria-label={t("vigilancia.vivo.queVer")}
            className="grid grid-cols-2 gap-1 rounded-panel border border-border/60 bg-foreground/[0.03] p-1">
            {(["vivo", "video"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={modo === m} onClick={() => onModo(m)}
                className={cn(
                  "inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-control px-2 text-sm font-semibold transition-colors",
                  modo === m ? "bg-foreground/10 text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
                )}>
                {m === "vivo" ? <Radio className="h-4 w-4 shrink-0" /> : <Film className="h-4 w-4 shrink-0" />}
                <span className="truncate">{m === "vivo" ? t("vigilancia.vivo.tabVivo") : t("vigilancia.vivo.tabVideo")}</span>
              </button>
            ))}
          </div>
          {modo === "vivo" ? escenario : video}
        </div>

        {/* La razón, arriba en el teléfono; a la derecha en la computadora. */}
        <aside className="order-1 flex min-w-0 flex-col gap-3 lg:sticky lg:top-0 lg:order-2">
          <CabeceraRazon razon={razon} razonNoEncontrada={razonNoEncontrada} puntos={puntos} t={t} lang={lang} />
          <div className="hidden flex-col gap-3 lg:flex">
            <ExtrasRazon razon={razon} otras={otras} fotoRazon={fotoRazon} t={t} lang={lang} />
            <BotonesAccion acciones={acciones} t={t} />
            {pie}
          </div>
        </aside>
      </div>

      {/* Teléfono: la foto, quién lo revisó y lo demás, debajo del escenario. */}
      <div className="flex flex-col gap-3 lg:hidden">
        <ExtrasRazon razon={razon} otras={otras} fotoRazon={fotoRazon} t={t} lang={lang} />
        {pie}
      </div>

      {/* Teléfono: las dos acciones pegadas abajo, al alcance del pulgar. */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border/60 bg-background/85 px-4 pb-safe pt-3 backdrop-blur-xl lg:hidden">
        <BotonesAccion acciones={acciones} t={t} className="pb-3" />
      </div>
    </div>
  );
}
