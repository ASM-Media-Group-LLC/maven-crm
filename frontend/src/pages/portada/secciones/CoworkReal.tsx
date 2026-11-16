import { useEffect, useState } from "react";
import {
  Coffee, Hand, Megaphone, MicOff, Monitor, MonitorOff, MoreHorizontal, MoreVertical,
  PanelRightClose, Plus, Radio, ScreenShareOff, Settings2, Share2, Users2, Video, VideoOff, Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";
import { formatoReloj } from "@/lib/coworkReloj";
import { Cara, FOTO_DE, nombreDe, type Seed } from "../gente";

// COWORK TAL COMO SE VE EN PRODUCCIÓN (Alvaro, 16/11/2026: «se tiene que ver
// como el que está en producción, no como el que te estás inventando»).
//
// Es una COPIA del tablero del supervisor (pages/cowork/CoworkHostDashboard.tsx):
// mismas clases, mismos tokens, mismos textos y el mismo orden — la barrita de
// consola, «Salas» con los botones redondos, las tarjetas `card-estudio` con su
// cabecera fuera del video, la línea de abajo con el reloj y la fila de
// controles con «Entrar»; a la derecha el panel «Supervisor Dashboard» con el
// Hub, las Solicitudes y «En las salas». Lo único que cambia: en vez del video
// en vivo (LiveKit) va la foto de cada persona inventada (gente.tsx).
//
// Si el tablero real cambia de forma, esta copia se actualiza a mano: abrir
// CoworkHostDashboard.tsx y repetir sus clases aquí.

type Sala = {
  nombre: string;
  gente: Seed[];
  habla?: boolean;      // card-estudio--viva + borde verde
  comparte?: boolean;   // pantallita verde + pantalla en el video
  pausa?: string;       // «Baño · 2:33»
};

const SALAS: Sala[] = [
  { nombre: "Ventas", gente: ["camilo", "valentina"], habla: true },
  { nombre: "Soporte", gente: ["luciana"], comparte: true },
  { nombre: "Diseño", gente: ["martina"] },
  { nombre: "Cartera", gente: ["andres"], pausa: "Baño · 2:33" },
];

// Segundos trabajados de cada quien al cargar (después corren solos).
const INICIO: Record<Seed, number> = {
  camilo: 3 * 3600 + 42 * 60 + 10, valentina: 3 * 3600 + 18 * 60 + 41,
  luciana: 2 * 3600 + 55 * 60 + 3, martina: 4 * 3600 + 7 * 60 + 29,
  andres: 1 * 3600 + 36 * 60 + 52, joaquin: 2 * 3600 + 11 * 60 + 15,
  sofia: 3 * 3600 + 4 * 60 + 47, emilio: 48 * 60 + 9,
};

/** La pantalla que comparte alguien: un panel con barras, como la de verdad. */
function PantallaCompartida() {
  return (
    <div className="flex h-full w-full flex-col gap-2 bg-[#0d1219] p-3">
      <span className="h-1.5 w-2/5 rounded bg-white/15" />
      <span className="h-1.5 w-3/5 rounded bg-white/10" />
      <div className="mt-auto flex h-1/2 items-end gap-1.5">
        {[42, 76, 58, 92, 66, 84].map((h, i) => (
          <i key={i} className={cn("flex-1 rounded-sm", i % 2 ? "bg-primary" : "bg-primary/45")} style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

/** El botón de control de sala, igual que `BotonSala` del tablero. */
function BotonSala({ activo, tono = "verde", icono: Icono, etiqueta }: {
  activo: boolean; tono?: "neutro" | "verde"; icono: typeof Volume2; etiqueta?: string;
}) {
  const color = activo
    ? (tono === "neutro" ? "text-foreground hover:bg-muted" : "bg-success text-success-foreground hover:bg-success/90")
    : "text-muted-foreground/60 hover:bg-muted hover:text-foreground";
  return (
    <span className={cn("inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors", color)}>
      <Icono className="h-3.5 w-3.5" />
      {etiqueta && <span>{etiqueta}</span>}
    </span>
  );
}

function Tarjeta({ s, seg }: { s: Sala; seg: number }) {
  const n = s.gente.length;
  const vacia = n === 0;
  return (
    <div className={cn(
      "card-estudio flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card/55 backdrop-blur-xl transition-colors",
      s.habla ? "card-estudio--viva border-success" : "border-border",
      vacia && "border-dashed opacity-80",
    )}>
      <div className="flex h-9 shrink-0 items-center gap-1 pl-3 pr-1.5">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{s.nombre}</span>
        {n > 1 && (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
            <Users2 className="h-3 w-3" />{n}
          </span>
        )}
        <span className={cn("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md", s.comparte ? "text-success" : "text-muted-foreground/50")}>
          <Monitor className="h-3.5 w-3.5" />
        </span>
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-violet-300/80">
          <Megaphone className="h-3.5 w-3.5" />
        </span>
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground">
          <MoreHorizontal className="h-4 w-4" />
        </span>
      </div>

      <div className={cn("relative aspect-[4/3] overflow-hidden md:aspect-video", vacia ? "bg-black/35" : "bg-black/40")}>
        {vacia ? (
          <div className="relative flex h-full flex-col items-center justify-center gap-2.5 text-muted-foreground/70">
            <div className="relative">
              <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-primary/30 blur-2xl" />
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-sm">
                <Users2 className="h-5 w-5" />
              </div>
            </div>
            <span className="text-xs">Sin participantes</span>
          </div>
        ) : (
          <div className={cn("grid h-full gap-1", n > 1 ? "grid-cols-2" : "grid-cols-1", s.pausa && "[filter:saturate(.5)_brightness(.55)]")}>
            {s.gente.map((g) => (
              <div key={g} className="relative overflow-hidden rounded-lg bg-black">
                {s.comparte ? <PantallaCompartida /> : <Cara seed={g} className="ov-cowork-cam" />}
              </div>
            ))}
          </div>
        )}

        {n === 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-baseline gap-2 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6">
            <span className="min-w-0 truncate text-xs text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">{nombreDe(s.gente[0])}</span>
            {s.pausa ? (
              <span className="ml-auto shrink-0 text-[11px] font-medium tabular-nums text-warning [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">{s.pausa}</span>
            ) : (
              <span className="ml-auto shrink-0 text-[11px] tabular-nums text-white/55">{formatoReloj(INICIO[s.gente[0]] + seg)}</span>
            )}
          </div>
        )}
      </div>

      {n > 1 && (
        <ul className="mx-2 mb-2 divide-y divide-border/40 rounded-xl bg-muted/30 px-2 md:mx-0 md:mb-0 md:rounded-none md:border-t md:border-border/40 md:bg-transparent md:px-3">
          {s.gente.map((g) => (
            <li key={g} className="flex items-center gap-1.5 py-1 text-[11px]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
              <span className="min-w-0 flex-1 truncate text-foreground/90">{nombreDe(g)}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{formatoReloj(INICIO[g] + seg)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="hidden items-center gap-1 px-2 py-2 md:flex">
        {!vacia && (
          <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted/40 p-0.5">
            <BotonSala activo tono="neutro" icono={Volume2} />
            <BotonSala activo={false} icono={MicOff} etiqueta="Hablar" />
            <BotonSala activo={false} icono={VideoOff} />
            <BotonSala activo={false} icono={ScreenShareOff} />
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="inline-flex h-8 items-center rounded-lg border border-primary/40 bg-primary/15 px-4 text-xs font-semibold text-primary">Entrar</span>
        </div>
      </div>
    </div>
  );
}

/** Una fila de «En las salas», como en el panel del tablero. */
function FilaPersona({ g, sala, pausa, comparte }: { g: Seed; sala: string; pausa?: string; comparte?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-xl px-2 py-1.5", pausa ? "bg-warning/10" : "bg-primary/5")}>
      <UserAvatar name={nombreDe(g)} src={FOTO_DE(g)} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", pausa ? "bg-warning" : "bg-success")} />
          <span className="truncate text-xs text-foreground/90">{nombreDe(g)}</span>
        </div>
        <span className="block truncate text-[10px] text-primary/80">{sala}{pausa ? ` · ${pausa}` : ""}</span>
      </div>
      <span className="shrink-0">
        {comparte ? <Monitor className="h-3.5 w-3.5 text-primary" /> : <MonitorOff className="h-3.5 w-3.5 text-muted-foreground/40" />}
      </span>
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground">
        <MoreVertical className="h-4 w-4" />
      </span>
    </div>
  );
}

/** El tablero del supervisor, en chico y con datos de ejemplo. Decorativo:
 *  nada se puede tocar (es una imagen viva, no la app). */
export default function CoworkReal() {
  const [seg, setSeg] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setSeg((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const ahora = new Date();
  const reloj = ahora.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  const enSalas = SALAS.reduce((a, s) => a + s.gente.length, 0);

  return (
    // `dark`: el tablero se ve siempre como en la app (oscuro), aunque quien
    // visita tenga el sistema en claro.
    <div className="dark ov-cowork-real font-sans" aria-hidden="true">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-background text-foreground shadow-[0_40px_90px_-40px_rgba(0,0,0,.8)]">
        <div className="relative flex min-h-0 md:flex-row-reverse">
          {/* Panel «Supervisor Dashboard» (a la derecha en escritorio). */}
          <div className="hidden w-72 shrink-0 flex-col border-l border-border/60 bg-card/65 backdrop-blur-xl md:flex">
            <div className="border-b border-border/60 px-4 pb-3 pt-4">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">Supervisor Dashboard</p>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-display text-base font-semibold text-foreground">Turno mañana</p>
                <div className="flex shrink-0 items-center gap-0.5 rounded-xl bg-muted/40 p-0.5 text-muted-foreground">
                  <span className="grid h-8 w-8 place-items-center rounded-lg"><Share2 className="h-4 w-4" /></span>
                  <span className="grid h-8 w-8 place-items-center rounded-lg"><Coffee className="h-4 w-4" /></span>
                  <span className="grid h-8 w-8 place-items-center rounded-lg"><Settings2 className="h-4 w-4" /></span>
                  <span className="mx-0.5 h-4 w-px bg-border" />
                  <span className="grid h-8 w-8 place-items-center rounded-lg"><PanelRightClose className="h-4 w-4" /></span>
                </div>
              </div>
            </div>

            <section className="mx-3 mt-3 rounded-2xl border border-border/60 bg-background/50 p-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-success/15 text-success"><Radio className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">Supervisor Hub</p>
                  <p className="truncate text-[11px] text-muted-foreground">Conectado</p>
                </div>
                <span className="inline-flex h-7 shrink-0 items-center rounded-full border border-input px-2.5 text-[11px]">Minimizar</span>
              </div>
            </section>

            <section className="mx-3 mt-3 space-y-2 rounded-2xl border border-border/60 bg-background/50 p-3">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-warning/15 text-warning"><Hand className="h-3.5 w-3.5" /></span>
                <p className="text-xs font-semibold text-foreground">Solicitudes</p>
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">1</span>
              </div>
              <div className="space-y-1 rounded-xl bg-warning/10 p-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <UserAvatar name={nombreDe("emilio")} src={FOTO_DE("emilio")} size="sm" />
                    <span className="truncate text-xs font-medium text-foreground/90">{nombreDe("emilio")}</span>
                    <Hand className="h-3 w-3 shrink-0 text-warning" />
                  </div>
                  <Badge variant="outline" className="rounded-full border-warning/30 text-[9px] text-warning">Soporte</Badge>
                </div>
                <span className="inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium text-warning">Ir a la sala</span>
              </div>
            </section>

            <section className="mx-3 my-3 space-y-2 rounded-2xl border border-border/60 bg-background/50 p-3">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-primary"><Users2 className="h-3.5 w-3.5" /></span>
                <p className="text-xs font-semibold text-foreground">En las salas</p>
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{enSalas}</span>
              </div>
              {SALAS.flatMap((s) => s.gente.map((g) => (
                <FilaPersona key={g} g={g} sala={s.nombre} pausa={s.pausa ? "Baño" : undefined} comparte={s.comparte} />
              )))}
            </section>
          </div>

          {/* El área de las salas. */}
          <div className="call-ambiente min-w-0 flex-1 p-3 md:p-6">
            <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-border/70 bg-card/50 px-3.5 py-2 [box-shadow:inset_0_1px_0_hsl(0_0%_100%/.05)]">
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-destructive/70" />
                <span className="h-2 w-2 rounded-full bg-warning/70" />
                <span className="h-2 w-2 rounded-full bg-success/70" />
              </span>
              <span className="font-mono text-xs tracking-wide text-muted-foreground">cowork</span>
              <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-success">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                </span>
                en vivo
              </span>
              <span className="hidden min-w-0 truncate font-mono text-[11px] text-muted-foreground/70 sm:inline">{enSalas} en salas · 1 hablando</span>
              <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/60">{reloj}</span>
            </div>

            <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold leading-tight text-foreground">Salas</p>
                <p className="text-sm text-muted-foreground">{enSalas} personas conectadas en {SALAS.length} salas.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 rounded-full"><span><Volume2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Escuchar</span></span></Button>
                <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 rounded-full"><span><MicOff className="h-3.5 w-3.5" /><span className="hidden sm:inline">Hablar</span></span></Button>
                <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 rounded-full"><span><VideoOff className="h-3.5 w-3.5" /><span className="hidden sm:inline">Cámara</span></span></Button>
                <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 rounded-full"><span><ScreenShareOff className="h-3.5 w-3.5" /><span className="hidden sm:inline">Pantalla</span></span></Button>
                <Button asChild size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 rounded-full"><span><Video className="h-3.5 w-3.5" /><span className="hidden sm:inline">Meet</span></span></Button>
                <Button asChild size="sm" variant="outline" className="h-8 shrink-0 gap-1 rounded-full"><span><Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Añadir sala</span></span></Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] md:gap-4">
              {SALAS.map((s) => <Tarjeta key={s.nombre} s={s} seg={seg} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
