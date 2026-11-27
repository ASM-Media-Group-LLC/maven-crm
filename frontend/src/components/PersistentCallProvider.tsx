import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { createPortal } from "react-dom";
import { Minimize2, Maximize2, PhoneOff, PictureInPicture2, GripHorizontal, Volume2, VolumeX, Scaling, Undo2 } from "lucide-react";
import { useInRouterContext, useNavigate } from "react-router-dom";
import LiveKitCallView from "@/components/VistaDeLlamadaDiferida";
import { usePipWindow, docPipSupported } from "@/pages/cowork/usePipWindow";
import { useLanguageSiHay } from "@/hooks/useLanguage";
import { traducir } from "@/lib/i18n";
import { TAMANOS_FLOTANTE, acotarTamano, siguienteTamano } from "@/lib/ventanitaFlotante";

// Llamada que SOBREVIVE a cambiar de página.
//
// EL PROBLEMA: la videollamada vivía dentro de la página de Cowork. Al navegar a
// otra sección, React desmonta esa página y la llamada se cae con ella. No era un
// bug: era dónde estaba montada.
//
// LA SOLUCIÓN: la llamada vive acá, por ENCIMA del router, y se dibuja donde
// haga falta:
//   · Si la página actual ofrece un hueco (<CallOutlet/>), se dibuja ahí, grande.
//   · Si no hay hueco —te fuiste a otra sección— pasa sola a una ventanita
//     flotante, arrastrable, y la llamada nunca se corta.
//
// POR QUÉ LA VENTANITA ES IN-APP Y NO LA DEL SISTEMA: la ventana flotante del
// sistema (Document PiP) solo se puede abrir DENTRO de un clic del usuario. Al
// navegar ese permiso ya se perdió, así que abrirla sola falla en silencio. La
// ventanita in-app funciona siempre; el botón de "sacar del navegador" queda a
// un clic, que es cuando el navegador sí lo permite.

type CallConfig = React.ComponentProps<typeof LiveKitCallView> & {
  key: string;
  /** Ruta a la que vuelve «Volver a Cowork» desde la ventanita (p. ej. el
   *  Supervisor Hub: /cowork?session=…). Sin ruta, no hay botón. */
  volverA?: string;
};

interface Ctx {
  /** Arranca (o reemplaza) la llamada persistente. */
  startCall: (config: CallConfig) => void;
  /** Cuelga y la saca de la pantalla. */
  endCall: () => void;
  /** La página registra su hueco; al desmontarse, la llamada se va a flotante.
   *  En la baja va `el: null` + el nodo que se está yendo, para poder ignorarla
   *  si otra página ya registró el suyo. */
  registerOutlet: (el: HTMLElement | null, saliente?: HTMLElement | null) => void;
  activeKey: string | null;
  /** Saca la llamada a una ventana del sistema (movible a otro monitor).
   *  La ofrece el provider y no cada página para que sea la MISMA llamada la
   *  que se muda: montar una segunda la reconectaría. Solo funciona dentro de
   *  un clic del usuario — el navegador no la abre de otra forma. */
  abrirVentanaDelSistema: (medidas?: { width: number; height: number }) => Promise<boolean>;
  cerrarVentanaDelSistema: () => void;
  ventanaDelSistemaAbierta: boolean;
  ventanaDelSistemaSoportada: boolean;
}

const PersistentCallContext = createContext<Ctx | null>(null);

export function usePersistentCall(): Ctx {
  const ctx = useContext(PersistentCallContext);
  if (!ctx) throw new Error("usePersistentCall fuera del PersistentCallProvider");
  return ctx;
}

/**
 * Hueco donde la página quiere ver la llamada. Mientras esté montado, la llamada
 * se dibuja acá; cuando se desmonta (navegaste), pasa a la ventanita.
 */
export function CallOutlet({ className }: { className?: string }) {
  const { registerOutlet } = usePersistentCall();
  // Callback ref y NO useEffect: se ejecuta durante el commit, antes de que la
  // pagina dispare su efecto de arrancar la llamada. Con useEffect existia una
  // ventana de un render donde el hueco todavia no estaba: la llamada se montaba
  // en la ventanita flotante y enseguida se MOVIA al hueco, y mover un <video>
  // de lugar en el DOM lo deja pausado en varios navegadores — pantalla negra.
  // Se recuerda el propio nodo para poder DARSE DE BAJA por identidad: en la
  // baja React solo manda `null`, y sin saber cuál se fue no se puede distinguir
  // "se desmontó el hueco" de "otra página ya registró el suyo".
  const mio = useRef<HTMLDivElement | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (el) { mio.current = el; registerOutlet(el); return; }
    registerOutlet(null, mio.current);
    mio.current = null;
  }, [registerOutlet]);
  return <div ref={ref} className={className ?? "w-full h-full"} />;
}

const POS_KEY = "maven.call.float.pos";
const SIZE_KEY = "maven.call.float.size";

/** Dónde va la ventanita sin mover: abajo a la derecha, con 16 px de aire. */
function esquinaAbajoDerecha(t: { w: number; h: number }, ancho: number, alto: number): { x: number; y: number } {
  return { x: Math.max(8, ancho - t.w - 16), y: Math.max(8, alto - t.h - 16) };
}
function leerPosGuardada(): boolean {
  try { return !!window.localStorage.getItem(POS_KEY); } catch { return false; }
}

// Tamaños de la ventanita (tres fijos + mínimo + acotar): lib/ventanitaFlotante.ts.
const TAMANO_INICIAL = TAMANOS_FLOTANTE[1];

/** Deja en la ref el navigate del router. Va aparte porque el provider también
 *  se monta sin router (en las pruebas) y useNavigate ahí revienta. */
function NavegarEnRef({ destino }: { destino: React.MutableRefObject<((ruta: string) => void) | null> }) {
  const navigate = useNavigate();
  destino.current = navigate;
  return null;
}

import { useCoworkRequestAlerts } from "@/hooks/useCoworkRequestAlerts";
import { useAutoFlotante } from "@/hooks/useAutoFlotante";
import { useReanudarMedia } from "@/hooks/useReanudarMedia";

/** La config sin lo que es solo de la ventanita. */
function sinVolverA(c: CallConfig): Omit<CallConfig, "volverA"> {
  const { volverA: _v, ...resto } = c;
  void _v;
  return resto;
}

export function PersistentCallProvider({ children }: { children: React.ReactNode }) {
  // Las manos levantadas de Cowork suenan desde acá y no desde la pagina del
  // coordinador: si vivieran ahi, navegar a otra seccion lo dejaria sordo justo
  // cuando alguien esta pidiendo ayuda.
  useCoworkRequestAlerts();

  // El texto de la ventanita en el idioma de la interfaz. Sin LanguageProvider
  // (algún test monta el provider suelto) usa traducir(), que no tira: una
  // etiqueta nunca puede ser la razón de que se caiga una llamada.
  const t = useLanguageSiHay()?.t ?? traducir;

  const [config, setConfig] = useState<CallConfig | null>(null);
  const [outlet, setOutlet] = useState<HTMLElement | null>(null);
  const [minimizada, setMinimizada] = useState(false);
  // El panel flotante y su hueco interno van en ESTADO, no en refs: el portal
  // necesita re-renderizar cuando el nodo aparece, y una ref no lo dispara.
  const [floatEl, setFloatEl] = useState<HTMLDivElement | null>(null);
  const [floatSlot, setFloatSlot] = useState<HTMLDivElement | null>(null);
  const { pipWindow, openPip, closePip } = usePipWindow();

  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = window.localStorage.getItem(POS_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* sin posición guardada */ }
    return esquinaAbajoDerecha(TAMANO_INICIAL, window.innerWidth, window.innerHeight);
  });
  // Mientras nadie la mueva, vive en la esquina de abajo a la derecha y se
  // queda AHÍ aunque cambie la pantalla (Alvaro, 26/11/2026: «se descuadra»).
  // Al arrastrarla, recuerda dónde la dejaste.
  const anclada = useRef(!leerPosGuardada());

  // En una pantalla angosta la ventanita de 340px no entra; se achica al ancho
  // disponible en vez de salirse. Va en ESTADO, no leído en el render: lo único
  // que re-renderiza al cambiar de tamaño es `acotar`, y `acotar` devuelve el
  // mismo objeto —y React corta el render— cuando la posición ya estaba
  // acotada. Leerlo en el render lo dejaba viejo justo en ese caso.
  const [anchoPantalla, setAnchoPantalla] = useState(() => window.innerWidth);
  const [altoPantalla, setAltoPantalla] = useState(() => window.innerHeight);
  const [tamano, setTamano] = useState<{ w: number; h: number }>(() => {
    try {
      const raw = window.localStorage.getItem(SIZE_KEY);
      if (raw) {
        const t = JSON.parse(raw) as { w?: unknown; h?: unknown };
        if (typeof t.w === "number" && typeof t.h === "number") return { w: t.w, h: t.h };
      }
    } catch { /* sin tamaño guardado */ }
    return { w: TAMANO_INICIAL.w, h: TAMANO_INICIAL.h };
  });
  const guardarTamano = useCallback((t: { w: number; h: number }) => {
    try { window.localStorage.setItem(SIZE_KEY, JSON.stringify(t)); } catch { /* noop */ }
  }, []);
  // Lo que se dibuja: el tamaño elegido, acotado a la pantalla de ahora.
  const tamanoVisible = acotarTamano(tamano, anchoPantalla, altoPantalla);
  const anchoFlotante = minimizada ? Math.min(220, anchoPantalla - 16) : tamanoVisible.w;
  const altoFlotante = minimizada ? 44 : tamanoVisible.h;
  const tamanoRef = useRef(tamanoVisible);
  tamanoRef.current = tamanoVisible;
  const enRouter = useInRouterContext();
  const navegarRef = useRef<((ruta: string) => void) | null>(null);

  // Traerla de vuelta a la pantalla: al montar (la posición guardada puede ser
  // de un monitor mucho más ancho) y cada vez que la ventana cambia de tamaño
  // o el teléfono rota.
  useEffect(() => {
    const acotar = () => {
      setAnchoPantalla(window.innerWidth);
      setAltoPantalla(window.innerHeight);
      setPos((p) => {
      const t = acotarTamano(tamanoRef.current, window.innerWidth, window.innerHeight);
      const ancho = minimizada ? Math.min(220, window.innerWidth - 16) : t.w;
      const alto = minimizada ? 44 : t.h;
      if (anclada.current) {
        const e = esquinaAbajoDerecha({ w: ancho, h: alto }, window.innerWidth, window.innerHeight);
        return e.x === p.x && e.y === p.y ? p : e;
      }
      const x = Math.min(Math.max(8, p.x), Math.max(8, window.innerWidth - ancho - 8));
      const y = Math.min(Math.max(8, p.y), Math.max(8, window.innerHeight - alto - 8));
      return x === p.x && y === p.y ? p : { x, y };
      });
    };
    acotar();
    window.addEventListener("resize", acotar);
    window.addEventListener("orientationchange", acotar);
    return () => {
      window.removeEventListener("resize", acotar);
      window.removeEventListener("orientationchange", acotar);
    };
  }, [minimizada, tamano]);

  const startCall = useCallback((next: CallConfig) => {
    setConfig(next);
    setMinimizada(false);
  }, []);

  const endCall = useCallback(() => {
    setConfig(null);
    closePip();
  }, [closePip]);

  const registerOutlet = useCallback((el: HTMLElement | null, saliente?: HTMLElement | null) => {
    // La baja se resuelve por IDENTIDAD, no preguntando si el nodo sigue en el
    // documento: React llama a la ref con null ANTES de sacarlo del DOM (está
    // pineado en refDetachOrden.test.tsx), así que `document.contains` siempre
    // decía "sigue vivo" y el hueco no se limpiaba nunca. La llamada quedaba
    // dibujada dentro de un div huérfano: invisible, muda y sin ventanita.
    //
    // Solo se limpia si el que se va es el que está puesto. Si al navegar entre
    // dos páginas con hueco el nuevo llegara primero, la baja del viejo no lo
    // pisa.
    setOutlet((prev) => {
      if (el) return el;
      return prev === saliente ? null : prev;
    });
  }, []);

  // La ventana del sistema se cierra si la llamada terminó.
  useEffect(() => { if (!config) closePip(); }, [config, closePip]);

  // Arrastre de la ventanita, con la posición recordada entre sesiones.
  const onDragStart = useCallback((e: React.PointerEvent) => {
    const inicio = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    const mover = (ev: PointerEvent) => {
      const ancho = floatEl?.offsetWidth ?? 340;
      const alto = floatEl?.offsetHeight ?? 240;
      const x = Math.max(8, Math.min(window.innerWidth - ancho - 8, inicio.px + (ev.clientX - inicio.x)));
      const y = Math.max(8, Math.min(window.innerHeight - alto - 8, inicio.py + (ev.clientY - inicio.y)));
      setPos({ x, y });
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      anclada.current = false;
      setPos((p) => {
        try { window.localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* noop */ }
        return p;
      });
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    // Sin esto, un gesto que el navegador se queda como scroll dejaba el
    // listener de pointermove pegado a window para siempre.
    window.addEventListener("pointercancel", soltar);
  }, [pos, floatEl]);

  // Estirar la ventanita desde la esquina inferior derecha (mismo gesto que la
  // del Hub dentro de Cowork: CoworkHostDashboard › startWindowResize).
  const onResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const inicio = { x: e.clientX, y: e.clientY, w: tamanoRef.current.w, h: tamanoRef.current.h };
    let ultimo: { w: number; h: number } | null = null;
    const mover = (ev: PointerEvent) => {
      // Que no se salga por la derecha ni por abajo desde donde está.
      const t = acotarTamano(
        { w: inicio.w + (ev.clientX - inicio.x), h: inicio.h + (ev.clientY - inicio.y) },
        anclada.current ? window.innerWidth : window.innerWidth - Math.max(0, pos.x - 8),
        anclada.current ? window.innerHeight : window.innerHeight - Math.max(0, pos.y - 8),
      );
      ultimo = t;
      setTamano(t);
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      if (ultimo) guardarTamano(ultimo);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  }, [pos, guardarTamano]);

  // Los tres tamaños fijos, uno por clic.
  const ciclarTamano = useCallback(() => {
    const p = siguienteTamano(tamanoRef.current);
    const t = { w: p.w, h: p.h };
    setTamano(t);
    guardarTamano(t);
    setMinimizada(false);
  }, [guardarTamano]);

  const ctx = useMemo<Ctx>(
    () => ({
      startCall, endCall, registerOutlet, activeKey: config?.key ?? null,
      // Sin medidas: que mande el tamaño por defecto de usePipWindow (retrato,
      // como Meet). Acá había un 420x300 fijo que pisaba ese default y dejaba
      // la ventana apaisada y aplastada — o sea que el ajuste de tamaño no
      // llegaba a aplicarse nunca.
      abrirVentanaDelSistema: (medidas) => openPip(medidas),
      cerrarVentanaDelSistema: closePip,
      ventanaDelSistemaAbierta: !!pipWindow,
      ventanaDelSistemaSoportada: docPipSupported(),
    }),
    [startCall, endCall, registerOutlet, config?.key, openPip, closePip, pipWindow],
  );

  // VOLVER A UNA PÁGINA QUE OFRECE HUECO CIERRA LA VENTANA DEL SISTEMA.
  //
  // La ventana del sistema le gana al hueco de la página (es una elección
  // explícita: alguien la sacó del navegador para ponerla en otro monitor).
  // Pero al VOLVER a la sala, esa prioridad dejaba el hueco de la página vacío
  // —pantalla negra— con la llamada atrapada en la ventanita. Jhon: "cuando el
  // chatter vuelve a cowork, la pantalla sale negra y persiste la flotante".
  //
  // Se cierra SOLO EN LA TRANSICIÓN de "no había hueco" a "hay hueco", no
  // mientras el hueco ya estaba: así quien la saca a un segundo monitor
  // ESTANDO en el dashboard la conserva, y quien vuelve a su sala la recupera
  // adentro, que es lo que espera al entrar.
  const habiaHueco = useRef(!!outlet);
  useEffect(() => {
    const hayHueco = !!outlet;
    if (hayHueco && !habiaHueco.current && pipWindow) closePip();
    habiaHueco.current = hayHueco;
  }, [outlet, pipWindow, closePip]);

  // Que la llamada salga sola al irse a otro programa, y se guarde sola al
  // volver. La lógica vive en useAutoFlotante porque también la usan las
  // pantallas de Meet y videollamada, que no pasan por este provider.
  useAutoFlotante({ activa: !!config, ventana: pipWindow, abrir: openPip, cerrar: closePip });

  // Dónde se dibuja la llamada, por orden de prioridad: la ventana del sistema
  // (si la abrió a mano), el hueco de la página, o la ventanita flotante.
  const destino = pipWindow?.document?.body ?? outlet ?? floatSlot;
  // Antes de decidir que "no hay hueco" se espera un frame. Sin esto, arrancar
  // una llamada en una pagina que SI tiene hueco podia dibujarla un instante en
  // la ventanita y mudarla despues, dejando el video pausado en negro.
  const [puedeFlotar, setPuedeFlotar] = useState(false);
  useEffect(() => {
    if (outlet || !config) { setPuedeFlotar(false); return; }
    const id = window.setTimeout(() => setPuedeFlotar(true), 250);
    return () => window.clearTimeout(id);
  }, [outlet, config]);
  const enFlotante = !pipWindow && !outlet && puedeFlotar;

  // LA CAJA: el contenedor real de la llamada. Se crea UNA vez y se muda a mano
  // con appendChild.
  //
  // Por qué no simplemente `createPortal(…, destino)` cambiando el destino: al
  // cambiarle el container a un portal, React DESMONTA el subárbol y lo vuelve a
  // montar. O sea, cada mudanza reconectaba la llamada — se caía el audio unos
  // segundos y para los demás la persona salía y volvía a entrar. Con la caja
  // fija, React nunca se entera de la mudanza: solo se mueve un nodo del DOM y
  // el objeto Room de LiveKit sigue siendo el mismo.
  const [caja] = useState(() => {
    const d = document.createElement("div");
    d.style.width = "100%";
    d.style.height = "100%";
    return d;
  });

  // La caja se muda al destino que toque. No se limpia al desmontar: sacarla del
  // DOM aunque sea un instante pausa el video, y el próximo destino la va a
  // reclamar de todas formas (appendChild mueve, no copia).
  useEffect(() => {
    if (destino && caja.parentNode !== destino) destino.appendChild(caja);
  }, [destino, caja]);

  // Sin llamada, la caja no cuelga de ningún lado.
  useEffect(() => {
    if (!config) caja.remove();
  }, [config, caja]);

  // Reanudar el video y el audio despues de cada mudanza (ver el hook).
  useReanudarMedia(caja, destino, !!config);

  // «Volver a Cowork»: a la página dueña de la llamada, donde su hueco la
  // recibe de vuelta (la misma llamada, sin reconectar).
  const volverA = config?.volverA ?? null;
  const volver = useCallback(() => {
    if (!volverA) return;
    if (navegarRef.current) navegarRef.current(volverA);
    else window.location.assign(volverA);
  }, [volverA]);
  const siguiente = siguienteTamano(tamanoVisible);

  return (
    <PersistentCallContext.Provider value={ctx}>
      {children}
      {enRouter && <NavegarEnRef destino={navegarRef} />}

      {config && enFlotante && (
        <div
          ref={setFloatEl}
          className="sin-arrastre fixed z-[150] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col"
          style={{ left: pos.x, top: pos.y, width: anchoFlotante, height: altoFlotante }}
        >
          <div
            className="flex items-center justify-between gap-1 px-2 py-1.5 bg-muted border-b border-border shrink-0 touch-none cursor-grab active:cursor-grabbing"
            onPointerDown={onDragStart}
          >
            <span className="flex items-center gap-1.5 text-[11px] text-foreground/80 truncate">
              <GripHorizontal className="h-3 w-3 shrink-0 text-muted-foreground" />
              {config.callDisplayName || t("shared.floatCall.inCall")}
            </span>
            <span className="flex items-center gap-0.5 shrink-0">
              {volverA && (
                <button
                  type="button"
                  title={t("shared.floatCall.backToCoworkHint")}
                  aria-label={t("shared.floatCall.backToCowork")}
                  onClick={volver}
                  className="h-6 flex items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-primary hover:bg-primary/10"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden />
                  {anchoFlotante >= 400 && <span>{t("shared.floatCall.backToCowork")}</span>}
                </button>
              )}
              {/* Silencio local del audio entrante (p.ej. el Hub de Cowork).
                  Solo aparece si la llamada OPTÓ por el control (el dueño pasó
                  incomingAudioMuted en la config): en una llamada común no
                  tiene sentido "no escuchar a nadie" desde aquí. */}
              {config.incomingAudioMuted !== undefined && (
                <button
                  type="button"
                  title={config.incomingAudioMuted
                    ? t("shared.floatCall.mutedForYou")
                    : t("shared.floatCall.muteForYou")}
                  aria-label={config.incomingAudioMuted ? t("shared.floatCall.listenAgain") : t("shared.floatCall.muteForMe")}
                  onClick={() => {
                    const next = !config.incomingAudioMuted;
                    setConfig((c) => (c ? { ...c, incomingAudioMuted: next } : c));
                    // Que el dueño de la llamada (p.ej. el dashboard de Cowork)
                    // sincronice su propio estado/persistencia.
                    config.onIncomingAudioMutedChange?.(next);
                  }}
                  className={`h-6 w-6 rounded-md flex items-center justify-center hover:bg-background/60 ${config.incomingAudioMuted ? "text-warning hover:text-warning/80" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {config.incomingAudioMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>
              )}
              {docPipSupported() && (
                <button
                  type="button"
                  title={t("shared.floatCall.popOut")}
                  aria-label={t("shared.floatCall.popOut")}
                  onClick={() => { void openPip({ width: 420, height: 300 }); }}
                  className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-background/60"
                >
                  <PictureInPicture2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                title={t("shared.floatCall.size", { tamano: t(`shared.floatCall.${siguiente.id}`) })}
                aria-label={t("shared.floatCall.size", { tamano: t(`shared.floatCall.${siguiente.id}`) })}
                onClick={ciclarTamano}
                className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background/60"
              >
                <Scaling className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title={minimizada ? t("shared.window.expand") : t("shared.window.minimize")}
                aria-label={minimizada ? t("shared.window.expand") : t("shared.window.minimize")}
                onClick={() => setMinimizada((v) => !v)}
                className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background/60"
              >
                {minimizada ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                title={t("shared.floatCall.hangUp")}
                aria-label={t("shared.floatCall.hangUp")}
                onClick={() => { config.onLeave?.(); endCall(); }}
                className="h-6 w-6 rounded-md flex items-center justify-center text-destructive hover:bg-destructive/10"
              >
                <PhoneOff className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
          {/* Acá adentro se porta la llamada cuando está flotante. Doble clic
              sobre el video (no sobre un botón) = volver a Cowork. */}
          <div
            ref={setFloatSlot}
            className={minimizada ? "hidden" : "flex-1 min-h-0"}
            onDoubleClick={volverA ? (e) => {
              if ((e.target as HTMLElement).closest("button, a, input, select, textarea, [role='button'], [role='dialog']")) return;
              volver();
            } : undefined}
          />
          {!minimizada && (
            <div
              role="separator"
              aria-label={t("shared.floatCall.resize")}
              title={t("shared.floatCall.resize")}
              onPointerDown={onResizeStart}
              className="absolute bottom-0 right-0 z-[5] h-4 w-4 cursor-nwse-resize touch-none"
              style={{ background: "linear-gradient(135deg, transparent 50%, hsl(var(--muted-foreground) / 0.55) 50%)" }}
            />
          )}
        </div>
      )}

      {/* El 🔇 local también en la VENTANA DEL SISTEMA (Document PiP): ahí la
          llamada se porta directo al body, sin nuestro header, así que el botón
          de la ventanita no existe. Se portala al documento del PiP como botón
          flotante — mismo opt-in (incomingAudioMuted en la config) y misma
          sincronización con el dueño. Los estilos llegan porque usePipWindow
          copia las hojas al abrir la ventana. */}
      {config && pipWindow && config.incomingAudioMuted !== undefined && createPortal(
        <button
          type="button"
          title={config.incomingAudioMuted
            ? t("shared.floatCall.mutedForYou")
            : t("shared.floatCall.muteForYou")}
          aria-label={config.incomingAudioMuted ? t("shared.floatCall.listenAgain") : t("shared.floatCall.muteForMe")}
          onClick={() => {
            const next = !config.incomingAudioMuted;
            setConfig((c) => (c ? { ...c, incomingAudioMuted: next } : c));
            config.onIncomingAudioMutedChange?.(next);
          }}
          className={`sin-arrastre fixed top-2 left-2 z-[200] h-8 w-8 rounded-full flex items-center justify-center bg-black/55 backdrop-blur-sm transition-colors ${config.incomingAudioMuted ? "text-warning hover:text-warning/80" : "text-white/80 hover:text-white"}`}
        >
          {config.incomingAudioMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>,
        pipWindow.document.body,
      )}

      {/* La llamada se monta UNA sola vez, siempre dentro de la MISMA caja: así
          cambiar de página mueve el video, no lo reinicia. La caja es la que
          viaja al hueco / a la ventanita / a la ventana del sistema. */}
      {config && createPortal(
        <LiveKitCallView {...sinVolverA(config)} compact={enFlotante || !!pipWindow} autoPip={!docPipSupported()} />,
        caja,
      )}
    </PersistentCallContext.Provider>
  );
}
