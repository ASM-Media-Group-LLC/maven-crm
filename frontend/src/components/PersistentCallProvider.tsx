import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { createPortal } from "react-dom";
import { Minimize2, Maximize2, PhoneOff, PictureInPicture2, GripHorizontal } from "lucide-react";
import LiveKitCallView from "@/pages/messenger/videocall/LiveKitCallView";
import { usePipWindow, docPipSupported } from "@/pages/cowork/usePipWindow";

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

type CallConfig = React.ComponentProps<typeof LiveKitCallView> & { key: string };

interface Ctx {
  /** Arranca (o reemplaza) la llamada persistente. */
  startCall: (config: CallConfig) => void;
  /** Cuelga y la saca de la pantalla. */
  endCall: () => void;
  /** La página registra su hueco; al desmontarse, la llamada se va a flotante. */
  registerOutlet: (el: HTMLElement | null) => void;
  activeKey: string | null;
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
  const ref = useCallback((el: HTMLDivElement | null) => {
    registerOutlet(el);
  }, [registerOutlet]);
  return <div ref={ref} className={className ?? "w-full h-full"} />;
}

const POS_KEY = "maven.call.float.pos";

import { useCoworkRequestAlerts } from "@/hooks/useCoworkRequestAlerts";

export function PersistentCallProvider({ children }: { children: React.ReactNode }) {
  // Las manos levantadas de Cowork suenan desde acá y no desde la pagina del
  // coordinador: si vivieran ahi, navegar a otra seccion lo dejaria sordo justo
  // cuando alguien esta pidiendo ayuda.
  useCoworkRequestAlerts();

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
    return { x: window.innerWidth - 360, y: window.innerHeight - 280 };
  });

  const startCall = useCallback((next: CallConfig) => {
    setConfig(next);
    setMinimizada(false);
  }, []);

  const endCall = useCallback(() => {
    setConfig(null);
    closePip();
  }, [closePip]);

  const registerOutlet = useCallback((el: HTMLElement | null) => {
    // Al navegar entre dos páginas que ofrecen hueco, el nuevo se registra antes
    // de que el viejo se limpie. Si el que quedó guardado ya salió del documento,
    // no sirve: eso es exactamente "me fui de la página" y toca ir a flotante.
    setOutlet((prev) => {
      if (el) return el;
      return prev && document.contains(prev) ? prev : null;
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
      setPos((p) => {
        try { window.localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* noop */ }
        return p;
      });
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }, [pos, floatEl]);

  const ctx = useMemo<Ctx>(
    () => ({ startCall, endCall, registerOutlet, activeKey: config?.key ?? null }),
    [startCall, endCall, registerOutlet, config?.key],
  );

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

  // Red de seguridad: mover la llamada de contenedor la saca del documento un
  // instante, y el navegador PAUSA todo <video>/<audio> que sale del documento
  // (esta en la spec). Al reinsertarlo no vuelve solo: queda negro y mudo. Esto
  // pasa en cada mudanza — al hueco, a la ventanita y a la ventana del sistema —
  // asi que se reanuda despues de cada una en vez de arreglar solo un camino.
  useEffect(() => {
    if (!destino || !config) return;
    let intentos = 0;
    const reanudar = () => {
      destino.querySelectorAll("video, audio").forEach((el) => {
        const m = el as HTMLMediaElement;
        if (m.paused) m.play().catch(() => { /* sin gesto del usuario, se reintenta */ });
      });
      // Los tracks tardan en re-adjuntarse; unos pocos reintentos cubren el hueco
      // sin dejar un intervalo corriendo para siempre.
      if (++intentos < 6) window.setTimeout(reanudar, 250);
    };
    const id = window.setTimeout(reanudar, 60);
    return () => window.clearTimeout(id);
  }, [destino, config]);

  return (
    <PersistentCallContext.Provider value={ctx}>
      {children}

      {config && enFlotante && (
        <div
          ref={setFloatEl}
          className="fixed z-[150] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col"
          style={{ left: pos.x, top: pos.y, width: minimizada ? 220 : 340, height: minimizada ? 44 : 240 }}
        >
          <div
            className="flex items-center justify-between gap-1 px-2 py-1.5 bg-muted border-b border-border shrink-0 cursor-grab active:cursor-grabbing"
            onPointerDown={onDragStart}
          >
            <span className="flex items-center gap-1.5 text-[11px] text-foreground/80 truncate">
              <GripHorizontal className="h-3 w-3 shrink-0 text-muted-foreground" />
              {config.callDisplayName || "En llamada"}
            </span>
            <span className="flex items-center gap-0.5 shrink-0">
              {docPipSupported() && (
                <button
                  type="button"
                  title="Sacar del navegador"
                  aria-label="Sacar del navegador"
                  onClick={() => { void openPip({ width: 420, height: 300 }); }}
                  className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-background/60"
                >
                  <PictureInPicture2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                title={minimizada ? "Agrandar" : "Minimizar"}
                aria-label={minimizada ? "Agrandar" : "Minimizar"}
                onClick={() => setMinimizada((v) => !v)}
                className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background/60"
              >
                {minimizada ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                title="Colgar"
                aria-label="Colgar"
                onClick={() => { config.onLeave?.(); endCall(); }}
                className="h-6 w-6 rounded-md flex items-center justify-center text-destructive hover:bg-destructive/10"
              >
                <PhoneOff className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
          {/* Acá adentro se porta la llamada cuando está flotante. */}
          <div ref={setFloatSlot} className={minimizada ? "hidden" : "flex-1 min-h-0"} />
        </div>
      )}

      {/* La llamada se monta UNA sola vez y se porta al destino que corresponda:
          así cambiar de página mueve el video, no lo reinicia. */}
      {config && destino && createPortal(
        <div className="w-full h-full">
          <LiveKitCallView {...config} compact={enFlotante || !!pipWindow} />
        </div>,
        destino,
      )}
    </PersistentCallContext.Provider>
  );
}
