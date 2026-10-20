// La miniatura de una sala cuando TODOS los que están en ella marcaron pausa.
//
// Mock de Álvaro (10/09), que reemplaza al panel gris del 08/09: la miniatura
// sigue APAGADA (nada de video ni punto verde), pero ahora se lee de un vistazo
// también en el teléfono, donde la anterior no cabía (cuatro renglones en 98 px
// de alto y el "le quedan 13" se cortaba). Taza en un anillo, el tiempo grande
// al lado, un renglón con desde cuándo y cuánto queda, y una frase corta para
// que la pausa no parezca una falta. Rojo y latiendo si se pasó.
import { useId } from "react";
import { Coffee, Video, Droplet, Utensils } from "lucide-react";
import { cn } from "@/lib/utils";
import { FRASES_DE_PAUSA } from "@/lib/frasesDePausa";
import { formatoActual, type Formato } from "@/lib/formato";
import { traducir, type TranslationKey } from "@/lib/i18n";
import { useLanguageSiHay } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import type { Traductor } from "./textosCowork";

export interface PausaDeSala {
  /** "meet" = la sala entera está en un meet grupal del supervisor: no es una
   *  pausa (el reloj sigue sumando), pero la miniatura se apaga igual. */
  kind: "bano" | "break" | "almuerzo" | "meet";
  /** Segundos que lleva ESTA pausa. */
  segundos: number;
  /** Epoch ms de cuándo arrancó. */
  desde: number | null;
  /** Tope en minutos (break: por pausa; baño: presupuesto del día). null = sin tope. */
  limiteMin: number | null;
  /** Baño: segundos ya gastados hoy en pausas anteriores. */
  consumidoSeg: number;
  excedida: boolean;
}

/** Iniciales (primera y última palabra) para el avatar del que está en pausa. */
function inicialesDeNombre(nombre: string | null | undefined): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "·";
  if (partes.length === 1) return partes[0]!.charAt(0).toUpperCase();
  return (partes[0]!.charAt(0) + partes[partes.length - 1]!.charAt(0)).toUpperCase();
}

const mmss = (seg: number) => {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};
const horaCorta = (f: Formato, epoch: number | null) =>
  epoch ? new Date(epoch).toLocaleTimeString(f.intl("es-CO"), { hour: "numeric", minute: "2-digit" }) : null;

// El "paisaje" de fondo de las miniaturas en pausa del mock (Jhon, 10/09:
// "tienen hasta una especie de paisaje detrás"). Dibujado en SVG —noche, luna,
// cerros y pinos— para no depender de una foto ni de la red, y siempre oscuro
// para que el ámbar del tiempo y el texto claro se lean igual en los dos temas.
const ESTRELLAS: Array<[number, number, number]> = [
  [22, 26, 1.2], [58, 14, 0.8], [96, 40, 1], [132, 18, 0.7], [166, 52, 1.1], [190, 22, 0.8],
  [214, 86, 0.7], [292, 30, 1], [306, 74, 0.7], [76, 78, 0.8], [40, 96, 0.6], [150, 84, 0.6],
];
const PINOS: Array<[number, number]> = [[26, 44], [44, 60], [60, 36], [236, 40], [256, 58], [276, 34], [296, 48]];

export function PaisajeDePausa({ excedida }: { excedida: boolean }) {
  // Cada panel lleva sus propios degradados: con varios en pantalla, ids
  // repetidos harían que todos usaran los del primero.
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const cielo = `${id}-cielo`, luna = `${id}-luna`, velo = `${id}-velo`;
  return (
    <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 320 240" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={cielo} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#090c1f" />
          <stop offset="0.55" stopColor="#151a44" />
          <stop offset="1" stopColor="#3b2a6e" />
        </linearGradient>
        <radialGradient id={luna} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fde68a" stopOpacity="0.9" />
          <stop offset="0.35" stopColor="#fde68a" stopOpacity="0.3" />
          <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={velo} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#05070f" stopOpacity="0.5" />
          <stop offset="1" stopColor="#05070f" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <rect width="320" height="240" fill={`url(#${cielo})`} />
      {ESTRELLAS.map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#e9e6ff" opacity="0.7" />)}
      <circle cx="248" cy="58" r="44" fill={`url(#${luna})`} />
      <circle cx="248" cy="58" r="14" fill="#fef3c7" opacity="0.95" />
      {/* cerros lejanos y cercanos */}
      <path d="M0 168 L48 118 L86 150 L128 104 L172 146 L214 112 L258 152 L292 128 L320 150 L320 240 L0 240 Z" fill="#1c2150" />
      <path d="M0 196 L40 166 L92 190 L150 156 L206 188 L262 162 L320 192 L320 240 L0 240 Z" fill="#111538" />
      {PINOS.map(([x, h]) => <path key={x} d={`M${x} ${240 - h} L${x - h * 0.28} 240 L${x + h * 0.28} 240 Z`} fill="#0a0d24" />)}
      <rect width="320" height="240" fill={`url(#${velo})`} />
      {excedida && <rect width="320" height="240" fill="#7f1d1d" opacity="0.5" />}
    </svg>
  );
}

// Las frases del break, en el diccionario. Una por cada una de lib/frasesDePausa
// (el español es el mismo, palabra por palabra) y elegida con la MISMA cuenta:
// sale del minuto en que arrancó la pausa y no cambia mientras dure.
const CLAVES_FRASE: readonly TranslationKey[] = [
  "cowork.pauseTile.phrase1",
  "cowork.pauseTile.phrase2",
  "cowork.pauseTile.phrase3",
  "cowork.pauseTile.phrase4",
];
const claveFraseDePausa = (desde: number | null): TranslationKey =>
  CLAVES_FRASE[Math.floor((desde ?? 0) / 60_000) % FRASES_DE_PAUSA.length] ?? CLAVES_FRASE[0];

/** Textos y proporción del tope. Puro, para probarlo.
 *
 *  Sin `f` ni `t` toma el idioma vigente (`formatoActual()`, `traducir()`): así
 *  la prueban los tests sin proveedor. La miniatura le pasa los del hook, que
 *  se vuelven a calcular si cambia el idioma. */
export function describirPausa(
  p: PausaDeSala,
  f: Formato = formatoActual(),
  t: Traductor = traducir,
): { titulo: string; detalle: string; pct: number; tono: "ok" | "poco" | "excedida" } {
  const esBano = p.kind === "bano";
  const titulo = p.kind === "meet"
    ? t("cowork.pauseTile.inMeet")
    : p.kind === "almuerzo"
      ? t("cowork.pauseTile.inLunch")
      : esBano ? t("cowork.pauseTile.inBathroom") : t("cowork.pauseTile.onBreak");
  const partes: string[] = [];
  const desde = horaCorta(f, p.desde);
  if (desde) partes.push(t("cowork.pauseTile.since", { time: desde }));
  // El meet no tiene tope ni se "pasa": solo desde cuándo.
  if (p.kind === "meet") return { titulo, detalle: partes.join(" · "), pct: 0, tono: "ok" };
  let pct = 0;
  let tono: "ok" | "poco" | "excedida" = "ok";
  if (p.limiteMin != null) {
    const topeSeg = p.limiteMin * 60;
    const usado = (esBano ? p.consumidoSeg : 0) + p.segundos;
    pct = Math.min(100, Math.round((usado / topeSeg) * 100));
    const deMas = usado - topeSeg;
    if (deMas >= 0) {
      tono = "excedida";
      partes.push(esBano
        ? t("cowork.pauseTile.bathroomOver", { limit: p.limiteMin })
        : t("cowork.pauseTile.minOver", { min: Math.ceil(deMas / 60) }));
    } else {
      tono = pct >= 75 ? "poco" : "ok";
      partes.push(esBano
        ? t("cowork.pauseTile.bathroomUsed", { used: Math.round(usado / 60), limit: p.limiteMin })
        : t("cowork.pauseTile.minLeft", { min: Math.ceil((topeSeg - usado) / 60) }));
    }
  } else {
    partes.push(t("cowork.pauseTile.noLimit"));
  }
  return { titulo: tono === "excedida" ? t("cowork.pauseTile.titleOver", { title: titulo }) : titulo, detalle: partes.join(" · "), pct, tono };
}

export default function SalaEnPausa({ pausa, className, nombres }: { pausa: PausaDeSala; className?: string; nombres?: string[] }) {
  // Sin proveedor de idioma (los tests la dibujan sola) cae al idioma vigente:
  // la miniatura se vuelve a dibujar cada segundo con el reloj que corre.
  const t = useLanguageSiHay()?.t ?? traducir;
  const f = useFormato();
  const d = describirPausa(pausa, f, t);
  const excedida = d.tono === "excedida";
  const esMeet = pausa.kind === "meet";
  // Ámbar es pausa; el meet grupal es trabajo y va en el color de la marca.
  const acento = excedida ? "text-destructive" : esMeet ? "text-primary" : "text-warning";
  // En la miniatura el título va en una línea al lado del anillo: "En break ·
  // pasado" no cabe en el teléfono, así que pasado el tope se acorta.
  const etiqueta = excedida
    ? (pausa.kind === "bano"
        ? t("cowork.pauseTile.bathroomOverShort")
        : pausa.kind === "almuerzo"
          ? t("cowork.pauseTile.lunchOverShort")
          : t("cowork.pauseTile.breakOverShort"))
    : d.titulo;
  // "Desde 1:51 p. m." y "Quedan 24 min": en el teléfono (163 px de ancho útil)
  // van en dos renglones limpios; en escritorio, en uno separados por el punto.
  const partes = d.detalle.split(" · ");
  // Avatar: la INICIAL de quien está en pausa dentro de un anillo que se llena
  // con lo que lleva de su tope (mock de Álvaro). El tipo de pausa queda en una
  // chapa chica sobre el anillo. El meet grupal no es de una persona: ahí se
  // deja el ícono, sin inicial ni anillo.
  const Icono = pausa.kind === "bano" ? Droplet : pausa.kind === "almuerzo" ? Utensils : Coffee;
  const iniciales = inicialesDeNombre(nombres?.[0]);
  const RADIO = 20, CIRC = 2 * Math.PI * RADIO;
  const avance = (Math.max(0, Math.min(100, d.pct)) / 100) * CIRC;
  return (
    <div
      data-testid="sala-en-pausa"
      data-tono={d.tono}
      className={cn(
        // Medidas del teléfono primero (la tarjeta mide 179 px y el área 4:3 da 122 px
        // de alto); en escritorio (300 px, 16:9) todo crece un punto.
        "relative h-36 overflow-hidden rounded-xl border flex flex-col items-center justify-center gap-1 px-3 py-1.5 text-center md:gap-1.5 md:py-2",
        excedida ? "border-destructive/40" : "border-border",
        className,
      )}
    >
      <PaisajeDePausa excedida={excedida} />
      <div className="relative flex items-center gap-2.5 md:gap-3">
        {esMeet ? (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/50 md:h-10 md:w-10">
            <Video className="h-4 w-4 md:h-5 md:w-5" />
          </div>
        ) : (
          <div className="relative h-11 w-11 shrink-0 md:h-12 md:w-12">
            <svg viewBox="0 0 48 48" className="absolute inset-0 h-full w-full -rotate-90">
              <circle cx="24" cy="24" r={RADIO} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="3.5" />
              <circle
                cx="24" cy="24" r={RADIO} fill="none" strokeWidth="3.5" strokeLinecap="round"
                stroke="currentColor" strokeDasharray={`${avance} ${CIRC}`}
                className={cn(acento, excedida && "animate-pulse motion-reduce:animate-none")}
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <span className={cn("font-display text-[13px] font-bold leading-none md:text-sm", acento)}>{iniciales}</span>
            </div>
            <div className={cn(
              "absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full ring-2 ring-black/40 md:h-[18px] md:w-[18px]",
              excedida ? "bg-destructive text-white" : "bg-warning text-black",
            )}>
              <Icono className="h-2.5 w-2.5" />
            </div>
          </div>
        )}
        <div className="text-left">
          <div className={cn("whitespace-nowrap text-[11px] font-semibold leading-none", acento)}>{etiqueta}</div>
          <div className={cn("font-display text-xl font-bold tabular-nums leading-tight md:text-2xl", acento)}>{mmss(pausa.segundos)}</div>
        </div>
      </div>
      {/* QUIÉN está en la pausa (Alvaro, 10/2026: "no sabes quién se fue a
          break, solo dice break"). Se muestran los nombres debajo del reloj. */}
      {nombres && nombres.length > 0 && (
        <div className="relative max-w-[32ch] truncate text-[11px] font-medium leading-snug text-white/90 md:text-xs">
          {nombres.slice(0, 3).join(", ")}{nombres.length > 3 ? ` +${nombres.length - 3}` : ""}
        </div>
      )}
      <div className={cn("relative text-[10px] leading-snug md:text-[11px]", excedida ? "text-red-100/85" : "text-white/80")}>
        {partes.map((p, i) => (
          <span key={p} className="whitespace-nowrap">
            {i > 0 && <span className="hidden md:inline"> · </span>}
            {i > 0 && <br className="md:hidden" />}
            {p}
          </span>
        ))}
      </div>
      {/* La frase es del break y de cuando va bien: pasado el tope, sobra. */}
      {pausa.kind === "break" && !excedida && (
        <p className="relative line-clamp-2 max-w-[30ch] text-[10px] italic leading-snug text-white/60">{t(claveFraseDePausa(pausa.desde))}</p>
      )}
    </div>
  );
}
