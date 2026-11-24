import { useState, type ReactNode } from "react";
import {
  Camera, Clock, Coffee, EyeOff, LogIn, Moon, Pause, Play, ScreenShare, ShieldCheck, Square, Users,
} from "lucide-react";
import type { TranslationKey } from "@/lib/i18n";

// MARCAR ENTRADA / PAUSA / SALIDA (Alvaro, 18 y 19/11/2026): «vemos la pantalla
// cuando están trabajando y ya». Piezas de pantalla, sin datos ni sesión, para la
// app y el banco de pruebas (/harness.html?ver=turno):
//   · TarjetaTurno    → la tarjeta del menú: antes de su hora / lista / en turno /
//                       en pausa (diseño base: «En turno», el que eligió Alvaro).
//   · AvisoEntrada    → al marcar entrada: qué se mira, cuidado con lo personal y,
//                       la primera vez, aceptar las reglas.
//   · ConfirmarSalida → marcar salida.
//   · PreguntaSigues  → 30 min después de su salida (lo de más no se paga).
//   · AvisoNovedad    → el aviso para todos: desde el 20/11 se marca.
// Reglas (19/11): se paga solo lo que cumple dentro de su horario; tarde, pausa
// de más o salir antes se descuenta; quedarse de más no se paga.

type Tr = (k: TranslationKey, p?: Record<string, string | number>) => string;

/** «2:14:05» */
export function reloj(seg: number): string {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
/** «2 h 14 min» / «14 min» */
export function duracion(seg: number): string {
  const m = Math.max(0, Math.round(seg / 60));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
}

function BotonVerde({ onClick, disabled, children, className = "" }: { onClick?: () => void; disabled?: boolean; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-success font-semibold text-success-foreground shadow-[0_10px_24px_-12px_hsl(var(--success)/.9)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-foreground/[0.07] disabled:text-muted-foreground disabled:shadow-none ${className}`}>
      {children}
    </button>
  );
}
/** Clase del botón suave (Pausa / Salida), para quien arme su propio botón. */
export const CLASE_BOTON_SUAVE = "inline-flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/40 font-semibold text-foreground transition hover:bg-foreground/[0.06] active:scale-[0.98]";
function BotonSuave({ onClick, children, className = "" }: { onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`${CLASE_BOTON_SUAVE} ${className}`}>
      {children}
    </button>
  );
}

const TONO = {
  verde: { borde: "border-success/35", fondo: "bg-success/[0.07]", sombra: "shadow-[0_10px_30px_-18px_hsl(var(--success)/.8)]", texto: "text-success", punto: "bg-success" },
  ambar: { borde: "border-warning/35", fondo: "bg-warning/[0.07]", sombra: "shadow-[0_10px_30px_-18px_hsl(var(--warning)/.8)]", texto: "text-warning", punto: "bg-warning" },
  gris: { borde: "border-border/50", fondo: "bg-card/30", sombra: "", texto: "text-muted-foreground", punto: "bg-muted-foreground/60" },
} as const;

function Marco({ tono, etiqueta, vivo, children }: { tono: keyof typeof TONO; etiqueta: string; vivo?: boolean; children: ReactNode }) {
  const c = TONO[tono];
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-3.5 ${c.borde} ${c.fondo} ${c.sombra}`}>
      <div className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide ${c.texto}`}>
        <span className="relative flex h-2 w-2" aria-hidden>
          {vivo && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none ${c.punto}`} />}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${c.punto}`} />
        </span>
        {etiqueta}
      </div>
      {children}
    </div>
  );
}

export type EstadoTurno = "fuera" | "puede" | "en_turno" | "en_pausa";

export function TarjetaTurno({
  estado, entrada, horario, desde, faltaSeg, transcurridoSeg = 0, pausaSeg = 0, cupoPausaSeg = 40 * 60,
  soloRegistro = false, fueraDeHorario = false, onEntrada, onPausa, onVolver, onSalida, botonPausa, t,
}: {
  estado: EstadoTurno;
  /** Hora de entrada de hoy («4:00 PM»). */
  entrada?: string | null;
  /** «4:00 PM – 12:00 AM», o null si su horario no está confirmado. */
  horario: string | null;
  /** Desde qué hora puede marcar («3:45 PM»). */
  desde?: string | null;
  /** Segundos que faltan para su entrada (lista para marcar). */
  faltaSeg?: number | null;
  transcurridoSeg?: number;
  /** Segundos de la pausa en curso. */
  pausaSeg?: number;
  /** Cupo de pausa pagada del día (baño + comida) que le queda, en segundos. */
  cupoPausaSeg?: number;
  /** Ya pasó su hora de salida: lo que siga no se paga. */
  fueraDeHorario?: boolean;
  soloRegistro?: boolean;
  onEntrada?: () => void; onPausa?: () => void; onVolver?: () => void; onSalida?: () => void;
  /** Para poner un botón de pausa propio (p. ej. con su menú baño / comida). */
  botonPausa?: ReactNode;
  t: Tr;
}) {
  if (estado === "en_turno") {
    return (
      <Marco tono={fueraDeHorario ? "ambar" : "verde"} etiqueta={fueraDeHorario ? t("cowork.turno.fueraDeHorario") : t("cowork.turno.enTurno")} vivo>
        <p className="mt-1.5 font-display text-[28px] font-semibold leading-none tabular-nums text-foreground">{reloj(transcurridoSeg)}</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground"><ScreenShare className="h-3 w-3" />{t(soloRegistro ? "cowork.jornada.registrando" : "cowork.turno.seComparte")}</p>
        {fueraDeHorario && <p className="mt-1 text-[11px] font-medium text-warning">{t("cowork.turno.noSePaga")}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {botonPausa ?? <BotonSuave onClick={onPausa} className="h-10 text-sm"><Pause className="h-3.5 w-3.5 fill-current" />{t("cowork.turno.pausa")}</BotonSuave>}
          <BotonSuave onClick={onSalida} className="h-10 text-sm"><Square className="h-3 w-3 fill-current" />{t("cowork.turno.salida")}</BotonSuave>
        </div>
      </Marco>
    );
  }
  if (estado === "en_pausa") {
    const pasado = pausaSeg > cupoPausaSeg;
    return (
      <Marco tono="ambar" etiqueta={t("cowork.turno.enPausa")} vivo>
        <p className="mt-1.5 font-display text-[28px] font-semibold leading-none tabular-nums text-foreground">{reloj(pausaSeg)}</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Coffee className="h-3 w-3" />{t(soloRegistro ? "cowork.jornada.pausaActiva" : "cowork.turno.pausaApagado")}</p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-foreground/[0.08]">
          <div className={`h-full rounded-full ${pasado ? "bg-destructive/70" : "bg-warning/70"}`} style={{ width: `${Math.min(100, (pausaSeg / Math.max(1, cupoPausaSeg)) * 100)}%` }} />
        </div>
        <p className={`mt-1 text-[11px] ${pasado ? "font-medium text-destructive" : "text-muted-foreground"}`}>
          {pasado ? t("cowork.turno.pausaPasada", { n: duracion(pausaSeg - cupoPausaSeg) }) : t("cowork.turno.pausaCupo", { n: duracion(cupoPausaSeg - pausaSeg) })}
        </p>
        <BotonVerde onClick={onVolver} className="mt-3 h-11 w-full"><Play className="h-4 w-4 fill-current" />{t("cowork.turno.volver")}</BotonVerde>
      </Marco>
    );
  }
  const puede = estado === "puede";
  return (
    <Marco tono={puede ? "verde" : "gris"} etiqueta={puede ? t("cowork.turno.listo") : t("cowork.turno.fueraDeTurno")}>
      <p className="mt-1.5 font-display text-[28px] font-semibold leading-none tabular-nums text-foreground">{entrada ?? "—"}</p>
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {puede ? <Clock className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
        {horario ? (puede && faltaSeg != null && faltaSeg > 0 ? t("cowork.turno.empiezaEn", { n: duracion(faltaSeg) }) : t("cowork.turno.tuHorario", { h: horario })) : t("cowork.turno.sinHorario")}
      </p>
      <BotonVerde onClick={onEntrada} disabled={!puede} className="mt-3 h-11 w-full">
        <Play className="h-4 w-4 fill-current" />{t("cowork.turno.marcarEntrada")}
      </BotonVerde>
      {!puede && desde && <p className="mt-2 text-center text-[11px] text-muted-foreground">{t("cowork.turno.puedesDesde", { h: desde })}</p>}
    </Marco>
  );
}

function Regla({ icono, titulo, texto, destacada }: { icono: ReactNode; titulo: string; texto: string; destacada?: boolean }) {
  return (
    <li className={`flex gap-3 rounded-2xl border p-3.5 ${destacada ? "border-warning/30 bg-warning/[0.06]" : "border-border/40 bg-foreground/[0.025]"}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${destacada ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary"}`}>{icono}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{titulo}</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{texto}</p>
      </div>
    </li>
  );
}

/** El anuncio al marcar entrada. La primera vez pide aceptar las reglas. */
export function AvisoEntrada({ primeraVez, horario, pausa, onAceptar, onCancelar, t }: {
  primeraVez: boolean; horario?: string | null;
  /** La pausa pagada de SU puesto (19/11/2026); sin dato, el texto es general. */
  pausa?: { comida: number; bano: number } | null;
  onAceptar?: () => void; onCancelar?: () => void; t: Tr;
}) {
  const [acepta, setAcepta] = useState(false);
  const textoPausa = !pausa ? t("cowork.turno.aviso.banoGeneral")
    : pausa.comida + pausa.bano === 0 ? t("cowork.turno.aviso.banoSinPausa")
    : t("cowork.turno.aviso.bano", { b: pausa.bano, c: pausa.comida });
  return (
    <div className="flex max-h-[88vh] flex-col overflow-hidden">
      {/* Cabecera con brillo verde suave */}
      <div className="relative overflow-hidden border-b border-border/40 px-6 pb-5 pt-6">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[28rem] -translate-x-1/2 rounded-full bg-success/20 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-success/15 text-success ring-1 ring-success/30"><ShieldCheck className="h-7 w-7" /></span>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold leading-tight text-foreground">{t("cowork.turno.aviso.titulo")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{horario ? t("cowork.turno.aviso.subHorario", { h: horario }) : t("cowork.turno.aviso.sub")}</p>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <ul className="grid gap-2.5 sm:grid-cols-2">
          <Regla icono={<ScreenShare className="h-[18px] w-[18px]" />} titulo={t("cowork.turno.aviso.pantallaT")} texto={t("cowork.turno.aviso.pantalla")} />
          <Regla icono={<Camera className="h-[18px] w-[18px]" />} titulo={t("cowork.turno.aviso.camaraT")} texto={t("cowork.turno.aviso.camara")} />
          <Regla destacada icono={<EyeOff className="h-[18px] w-[18px]" />} titulo={t("cowork.turno.aviso.personalT")} texto={t("cowork.turno.aviso.personal")} />
          <Regla icono={<Coffee className="h-[18px] w-[18px]" />} titulo={t("cowork.turno.aviso.banoT")} texto={textoPausa} />
          <Regla icono={<Clock className="h-[18px] w-[18px]" />} titulo={t("cowork.turno.aviso.pagoT")} texto={t("cowork.turno.aviso.pago")} />
          <Regla icono={<Users className="h-[18px] w-[18px]" />} titulo={t("cowork.turno.aviso.quienT")} texto={t("cowork.turno.aviso.quien")} />
        </ul>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[12px] text-muted-foreground"><Moon className="h-3.5 w-3.5" />{t("cowork.turno.aviso.fuera")}</p>
        {primeraVez && (
          <div className="mt-5 rounded-2xl border border-border/50 bg-background/40 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-primary" />{t("cowork.turno.terminos.titulo")}</p>
            <div className="mt-2 max-h-36 space-y-2 overflow-y-auto pr-1 text-[12.5px] leading-relaxed text-muted-foreground">
              <p>{t("cowork.turno.terminos.p1")}</p>
              <p>{t("cowork.turno.terminos.p2")}</p>
              <p>{t("cowork.turno.terminos.p3")}</p>
            </div>
          </div>
        )}
      </div>
      {/* La casilla va pegada al botón, SIEMPRE a la vista (Alvaro, 19/11: Valentina
          Duarte no podía marcar entrada — en su pantalla la casilla quedaba abajo,
          dentro del recuadro que se desliza, y el botón parecía muerto). */}
      {primeraVez && (
        <label className={`mx-6 mt-3 flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition ${acepta ? "border-success/40 bg-success/[0.07] text-foreground" : "border-warning/50 bg-warning/[0.06] text-foreground hover:bg-warning/[0.1]"}`}>
          <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="h-5 w-5 shrink-0 accent-[hsl(var(--success))]" />
          <span className="font-medium">{t("cowork.turno.terminos.acepto")}</span>
        </label>
      )}
      <div className="flex flex-col-reverse gap-2 border-t border-border/40 px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
        <button type="button" onClick={onCancelar} className="h-11 rounded-xl px-4 text-sm font-medium text-muted-foreground transition hover:text-foreground">{t("cowork.turno.ahoraNo")}</button>
        <BotonVerde onClick={onAceptar} disabled={primeraVez && !acepta} className="h-12 px-7 text-[15px]">
          <LogIn className="h-4 w-4" />{primeraVez ? t("cowork.turno.aceptarYEntrar") : t("cowork.turno.marcarEntrada")}
        </BotonVerde>
      </div>
    </div>
  );
}

/** Marcar salida. */
export function ConfirmarSalida({ transcurridoSeg, onConfirmar, onCancelar, t }: {
  transcurridoSeg: number; onConfirmar?: () => void; onCancelar?: () => void; t: Tr;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-4 p-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-foreground/[0.07] text-foreground"><Square className="h-4 w-4 fill-current" /></span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold leading-tight text-foreground">{t("cowork.turno.salida.titulo")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("cowork.turno.salida.sub", { t: duracion(transcurridoSeg) })}</p>
          <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted-foreground"><Pause className="h-3.5 w-3.5" />{t("cowork.turno.salida.pausa")}</p>
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-border/40 px-6 py-4 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancelar} className="h-11 rounded-xl px-4 text-sm font-medium text-muted-foreground transition hover:text-foreground">{t("cowork.turno.seguir")}</button>
        <BotonSuave onClick={onConfirmar} className="h-11 px-6"><Square className="h-3 w-3 fill-current" />{t("cowork.turno.marcarSalida")}</BotonSuave>
      </div>
    </div>
  );
}

/** 30 min después de su salida: lo de más no se paga; «¿sigues?». */
export function PreguntaSigues({ salida, minutosParaCerrar, onSigo, onSalir, t }: {
  salida: string; minutosParaCerrar: number; onSigo?: () => void; onSalir?: () => void; t: Tr;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-4 p-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-warning/15 text-warning"><Clock className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold leading-tight text-foreground">{t("cowork.turno.sigues.titulo")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("cowork.turno.sigues.sub", { h: salida })}</p>
          <p className="mt-2 text-[13px] text-muted-foreground">{t("cowork.turno.sigues.cierra", { n: minutosParaCerrar })}</p>
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-border/40 px-6 py-4 sm:flex-row sm:justify-end">
        <BotonSuave onClick={onSalir} className="h-11 px-5"><Square className="h-3 w-3 fill-current" />{t("cowork.turno.marcarSalida")}</BotonSuave>
        <BotonVerde onClick={onSigo} className="h-11 px-6">{t("cowork.turno.sigues.si")}</BotonVerde>
      </div>
    </div>
  );
}

/** El aviso para todos: desde el 20/11 se marca entrada, pausa y salida. */
export function AvisoNovedad({ fecha, onEntendido, t }: { fecha: string; onEntendido?: () => void; t: Tr }) {
  const pasos: Array<{ k: TranslationKey; icono: ReactNode }> = [
    { k: "cowork.turno.novedad.paso1", icono: <Play className="h-3.5 w-3.5 fill-current" /> },
    { k: "cowork.turno.novedad.paso2", icono: <Pause className="h-3.5 w-3.5 fill-current" /> },
    { k: "cowork.turno.novedad.paso3", icono: <Square className="h-3 w-3 fill-current" /> },
    { k: "cowork.turno.novedad.paso4", icono: <Clock className="h-3.5 w-3.5" /> },
  ];
  return (
    <div className="flex flex-col">
      <div className="relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -top-20 right-0 h-40 w-64 rounded-full bg-primary/15 blur-3xl" aria-hidden />
        <span className="relative inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-2.5 py-1 text-[11px] font-semibold text-primary">{t("cowork.turno.novedad.etiqueta", { f: fecha })}</span>
        <h2 className="relative mt-3 font-display text-xl font-bold leading-tight text-foreground">{t("cowork.turno.novedad.titulo")}</h2>
        <p className="relative mt-2 text-sm text-muted-foreground">{t("cowork.turno.novedad.sub")}</p>
        <ol className="relative mt-4 flex flex-col gap-2.5">
          {pasos.map((p) => (
            <li key={p.k} className="flex items-start gap-3 rounded-xl border border-border/40 bg-foreground/[0.025] p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success">{p.icono}</span>
              <span className="pt-0.5 text-[13px] leading-snug text-foreground/90">{t(p.k)}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex justify-end border-t border-border/40 px-6 py-4">
        <BotonVerde onClick={onEntendido} className="h-11 px-7">{t("cowork.turno.novedad.entendido")}</BotonVerde>
      </div>
    </div>
  );
}
