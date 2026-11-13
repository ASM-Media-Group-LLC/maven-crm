import type { ReactNode } from "react";
import { Camera, Check, CheckCheck, Film, Loader2, Megaphone, Radio } from "lucide-react";
import { FotoConZoom } from "@/components/hr/FotoConZoom";
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

/** LO QUE PASÓ, de un vistazo (Alvaro, 13/11/2026: «me manda al perfil… todo
 *  está en chiquitito… debería ser muy claro qué fue lo que pasó»). Arriba de
 *  todo: QUIÉN, QUÉ (en grande) y LA FOTO que lo disparó, grande y con zoom; lo
 *  que escribió Argos; desde cuándo y cuánto lleva. Si sigue pasando, sello
 *  rojo sólido y filo rojo. El en vivo y el video van DEBAJO. */
function HeroRazon({ razon, razonNoEncontrada, puntos, fotoRazon, nombre, t, lang }: {
  razon: RazonEnVivo | null;
  razonNoEncontrada: boolean;
  puntos: number | null;
  fotoRazon: string | null;
  nombre: string;
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
            {nombre && <p className="text-[15px] font-semibold text-foreground">{nombre}</p>}
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">{t("vigilancia.razon.ahora")}</p>
            <h2 className="mt-1 text-[17px] font-semibold leading-snug">
              {razonNoEncontrada ? t("vigilancia.razon.noEncontrada") : t("vigilancia.razon.sinNada")}
            </h2>
          </div>
          {puntos != null && <NotaViva puntos={puntos} t={t} />}
        </div>
      </section>
    );
  }

  const conFoto = !!razon.capturaPath;
  const PILDORA = "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-foreground/[0.04] px-2.5 py-1 text-xs text-foreground/85 tabular-nums";
  return (
    <section className={cn("vidrio sube overflow-hidden", abierta && "ring-1 ring-destructive/60")}>
      <div className={cn("grid", conFoto && "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]")}>
        {conFoto && (
          <div className="relative aspect-[16/10] w-full bg-black lg:aspect-auto lg:min-h-[340px]">
            {fotoRazon
              ? <FotoConZoom src={fotoRazon} alt={t("vigilancia.razon.foto")} />
              : <div className="flex h-full w-full items-center justify-center gap-2 text-xs text-white/60"><Camera className="h-4 w-4" />{t("vigilancia.razon.fotoArchivo")}</div>}
          </div>
        )}
        <div className="v-cont flex min-w-0 flex-col gap-3 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">
                {razon.fuente === "clip" ? t("vigilancia.razon.argosGrabo") : razon.fuente === "fuera" ? t("vigilancia.razon.cowork") : t("vigilancia.razon.argosVio")}
              </p>
              {nombre && <p className="mt-1 truncate text-[15px] font-semibold text-foreground">{nombre}</p>}
              <h2 className="mt-0.5 font-display text-[22px] font-semibold leading-tight text-foreground sm:text-2xl">{t(etiquetaDeRazon(razon))}</h2>
            </div>
            {puntos != null && <NotaViva puntos={puntos} t={t} />}
          </div>

          {/* Si sigue pasando: sello rojo sólido (lo malo se ve). */}
          <div className="flex flex-wrap items-center gap-1.5">
            {razon.fuente === "clip" ? null : abierta ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-2.5 py-1 text-xs font-semibold text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white motion-reduce:animate-none" />{t("vigilancia.razon.sigue")}
              </span>
            ) : (
              <span className={PILDORA}>{t("vigilancia.razon.cerro", { hora: horaCorta(razon.hasta, lang) })}</span>
            )}
            <span className={PILDORA}><span className="text-muted-foreground">{t("vigilancia.razon.desde")}</span>{horaCorta(razon.desde, lang)}</span>
            <span className={PILDORA}><span className="text-muted-foreground">{abierta ? t("vigilancia.razon.lleva") : t("vigilancia.razon.duro")}</span>{textoDuracion(minutos, t)}</span>
            {razon.revisadoAt && (
              <span className={PILDORA}><CheckCheck className="h-3.5 w-3.5 text-success" />{t("vigilancia.razon.revisadoChip")}</span>
            )}
          </div>

          {razon.detalle && <p className="text-[15px] leading-relaxed text-foreground/85">{razon.detalle}</p>}
        </div>
      </div>
    </section>
  );
}

/** Lo que completa la razón: quién la revisó y qué más tiene abierto. */
function ExtrasRazon({ razon, otras, t, lang }: {
  razon: RazonEnVivo | null;
  otras: RazonEnVivo[];
  t: Tr;
  lang: string;
}) {
  const conRevision = !!razon?.revisadoAt;
  if (!conRevision && otras.length === 0) return null;
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
  razon, razonNoEncontrada, otras, fotoRazon, puntos, modo, onModo, escenario, video, acciones, pie, nombre = "", t, lang,
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
  /** Quién (va en el héroe, no como título de página: no es su perfil). */
  nombre?: string;
  t: Tr;
  lang: string;
}) {
  return (
    <div className="mt-3 flex flex-col gap-4">
      {/* 1) LO QUE PASÓ: arriba de todo, a lo ancho, con la foto grande. */}
      <HeroRazon razon={razon} razonNoEncontrada={razonNoEncontrada} puntos={puntos} fotoRazon={fotoRazon} nombre={nombre} t={t} lang={lang} />

      {/* 2) Su pantalla ahora (o el video de esos minutos) y, en la computadora, las acciones al lado. */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-3">
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

        <aside className="hidden min-w-0 flex-col gap-3 lg:sticky lg:top-0 lg:flex">
          <BotonesAccion acciones={acciones} t={t} />
          <ExtrasRazon razon={razon} otras={otras} t={t} lang={lang} />
          {pie}
        </aside>
      </div>

      {/* Teléfono: quién lo revisó y lo demás, debajo. */}
      <div className="flex flex-col gap-3 lg:hidden">
        <ExtrasRazon razon={razon} otras={otras} t={t} lang={lang} />
        {pie}
      </div>

      {/* Teléfono: las dos acciones pegadas abajo, al alcance del pulgar. */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border/60 bg-background/85 px-4 pb-safe pt-3 backdrop-blur-xl lg:hidden">
        <BotonesAccion acciones={acciones} t={t} className="pb-3" />
      </div>
    </div>
  );
}
