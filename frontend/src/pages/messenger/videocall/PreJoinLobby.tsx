import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Mic, MicOff, Video as VideoIcon, VideoOff,
  ChevronDown, Monitor, Volume2, Loader2, Settings,
} from "lucide-react";
import { createLocalTracks, LocalAudioTrack, LocalVideoTrack } from "livekit-client";
import { BackgroundProcessor, supportsBackgroundProcessors } from "@livekit/track-processors";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";
import BackgroundSelector from "./BackgroundSelector";
import {
  BACKGROUND_TEMPLATES, esBlur, radioDeBlur, isCustomBackground,
  resolverImagenDeFondo, leerFondoGuardado, guardarFondo,
  type BackgroundEffect, type ImagenDeFondo,
} from "@/lib/fondoDeLlamada";
import QuienesEstan from "./QuienesEstan";
import { nombreDelFondo } from "./nombreDelFondo";
import type { PersonaEnSala } from "@/hooks/useQuienesEstanEnLaSala";
import { useLanguage } from "@/hooks/useLanguage";
// traducir() en la enumeración de dispositivos: arma una etiqueta de respaldo
// que se guarda en el estado una vez, y el hook ahí obligaría a reiniciar las
// pistas de cámara y micro cada vez que cambia el idioma.
import { traducir, type TranslationKey } from "@/lib/i18n";


interface PreJoinLobbyProps {
  roomName: string;
  displayName: string;
  callDisplayName?: string;
  onJoin: (opts: { micOn: boolean; camOn: boolean; audioDeviceId?: string; videoDeviceId?: string; audioOutputDeviceId?: string; backgroundEffect?: BackgroundEffect }) => void;
  /** Quién ya está adentro (como en Google Meet). Sin esto, el bloque no se dibuja. */
  quienesEstan?: { personas: PersonaEnSala[]; cargando?: boolean };
}


interface DeviceInfo {
  deviceId: string;
  label: string;
}

const PREJOIN_BG_ATTACH_TIMEOUT_MS = 4000;
const PREJOIN_BG_SWITCH_TIMEOUT_MS = 5000;
const PREJOIN_BG_FAILURE_COOLDOWN_MS = 8000;

// ⚠️ LA SALA DE ESPERA SE QUEDABA EN "APLICANDO FONDO…" Y LA PERSONA NO SE VEÍA
// (Grace, 29/09/2026). Mientras se prepara el fondo el video se esconde a
// propósito —para no mostrar un cuadro sin fondo— y se ve la foto de la
// plantilla. Pero dos esperas no tenían tope (pedir la cámara y precargar la
// foto) y nada sacaba el velo si la cadena se trababa: la persona se quedaba
// mirando un café, sin verse, para siempre. Encima el cartel mentía: se
// prendía ANTES de pedir la cámara, así que una cámara trabada también decía
// "Aplicando fondo…".
//
// Ahora cada espera tiene tope, el cartel dice lo que de verdad se espera, y si
// el fondo no está listo en PREJOIN_BG_TOTAL_TIMEOUT_MS la persona se ve igual,
// sin fondo (el fondo se vuelve a intentar al entrar a la llamada).

/** Cuánto se espera a que la cámara entregue imagen. `createLocalTracks` no
 *  tiene tope propio: un permiso sin contestar u otra aplicación usando la
 *  cámara lo dejan esperando para siempre. */
const PREJOIN_CAMARA_TIMEOUT_MS = 12_000;
/** Tope de TODA la preparación del fondo antes de mostrar a la persona. */
const PREJOIN_BG_TOTAL_TIMEOUT_MS = 10_000;

/** Los errores de la cámara (los del micrófono comparten el mismo cartel). */
const ERRORES_DE_CAMARA: ReadonlySet<TranslationKey> = new Set<TranslationKey>([
  "messenger.lobby.permisoCamaraDenegado", "messenger.lobby.noSePudoCamara",
  "messenger.lobby.camaraNoResponde", "messenger.lobby.permiteLaCamara",
]);

/** Qué decir cuando la cámara no contesta a tiempo. Si el navegador está
 *  esperando que la persona dé permiso, eso: el tope también corre mientras el
 *  aviso de permiso está abierto, y "no responde" la mandaba a revisar lo que no
 *  está roto. Safari no deja preguntar por "camera": ahí va el mensaje general. */
async function mensajeDeCamaraQueNoContesta(): Promise<TranslationKey> {
  try {
    const estado = await withTimeout(
      navigator.permissions.query({ name: "camera" as PermissionName }), 1_000, "prejoin-permiso");
    if (estado.state === "prompt") return "messenger.lobby.permiteLaCamara";
  } catch { /* no se puede saber */ }
  return "messenger.lobby.camaraNoResponde";
}

// isTemplateBackground, isCustomBackground, getCustomBackgroundUrl imported from BackgroundSelector


async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}-timeout`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default function PreJoinLobby({ roomName, displayName, callDisplayName, onJoin, quienesEstan }: PreJoinLobbyProps) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoTrackRef = useRef<LocalVideoTrack | null>(null);
  const attachedVideoElRef = useRef<HTMLVideoElement | null>(null);
  const audioTrackRef = useRef<LocalAudioTrack | null>(null);
  const bgProcessorRef = useRef<any>(null);
  const bgAttachedTrackRef = useRef<LocalVideoTrack | null>(null);
  const bgOpRef = useRef(0);
  const mountedRef = useRef(true);
  const preloadedRef = useRef<Set<string>>(new Set());
  const bgEffectRef = useRef<BackgroundEffect>("none");
  const bgRequestedEffectRef = useRef<BackgroundEffect>("none");
  const bgLastAppliedEffectRef = useRef<BackgroundEffect>("none");
  const bgApplyQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const bgFailureCooldownUntilRef = useRef(0);

  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [joining, setJoining] = useState(false);
  // Arranca con lo último elegido (09/09/2026). Inicializador perezoso: leer
  // localStorage en cada render sería trabajo al vicio, y bajarlo por prop
  // haría reconectar la sala en la vista de llamada.
  const [bgEffect, setBgEffectEstado] = useState<BackgroundEffect>(() => leerFondoGuardado());
  const setBgEffect = useCallback((e: BackgroundEffect) => {
    setBgEffectEstado(e);
    guardarFondo(e);
  }, []);
  
  const [backgroundPreviewUnsupported, setBackgroundPreviewUnsupported] = useState(false);
  const [isPreparingBackgroundFirstFrame, setIsPreparingBackgroundFirstFrame] = useState(false);
  // Esperando que la cámara entregue la primera imagen. Es otra espera que la
  // del fondo y se dice distinto: si se traba la cámara, no es culpa del fondo.
  const [abriendoCamara, setAbriendoCamara] = useState(false);
  // El fondo no estuvo listo a tiempo: se muestra a la persona sin fondo.
  const [fondoTardo, setFondoTardo] = useState(false);
  // Número de la corrida de "prender la cámara" VIGENTE. Si se pedía otra
  // mientras la primera esperaba, las dos pisaban la pista y la primera nunca se
  // apagaba: la cámara quedaba prendida por fuera.
  const camaraGenRef = useRef(0);
  // Lo mismo para el micrófono: una apertura vieja que contestaba tarde quedaba
  // capturando sin ninguna referencia, y nada la apagaba.
  const microfonoGenRef = useRef(0);

  const [audioInputs, setAudioInputs] = useState<DeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<DeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<DeviceInfo[]>([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState<string>("");
  const [selectedVideoInput, setSelectedVideoInput] = useState<string>("");
  // Lo que la persona ELIGIÓ ("" = el de siempre). Es lo único que reabre la
  // cámara o el micrófono. `selected*` es lo que se muestra, y `enumerateDevices`
  // lo llena con el aparato de verdad apenas hay permiso: cuando esa misma
  // variable disparaba la reapertura, la primera vez que se prendía la cámara
  // se abría DOS veces (y el fondo con ella), que es media espera de Grace.
  const [camaraPedida, setCamaraPedida] = useState<string>("");
  const [microfonoPedido, setMicrofonoPedido] = useState<string>("");
  const [selectedAudioOutput, setSelectedAudioOutput] = useState<string>("");

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<TranslationKey | null>(null);

  // ── Enumerate devices ───────────────────────────────────────
  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const ai = devices.filter((d) => d.kind === "audioinput" && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label || traducir("messenger.call.microfonoN", { id: d.deviceId.slice(0, 5) }) }));
      const vi = devices.filter((d) => d.kind === "videoinput" && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label || traducir("messenger.call.camaraN", { id: d.deviceId.slice(0, 5) }) }));
      const ao = devices.filter((d) => d.kind === "audiooutput" && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label || traducir("messenger.call.altavozN", { id: d.deviceId.slice(0, 5) }) }));
      setAudioInputs(ai);
      setVideoInputs(vi);
      setAudioOutputs(ao);

      setSelectedAudioInput((prev) =>
        ai.some((d) => d.deviceId === prev) ? prev : (ai[0]?.deviceId || "")
      );
      setSelectedVideoInput((prev) =>
        vi.some((d) => d.deviceId === prev) ? prev : (vi[0]?.deviceId || "")
      );
      setSelectedAudioOutput((prev) =>
        ao.some((d) => d.deviceId === prev) ? prev : (ao[0]?.deviceId || "")
      );
    } catch (e) {
      console.warn("[PreJoin] No se pudieron listar los dispositivos:", e);
    }
  }, []);


  // ── Stop individual tracks ──────────────────────────────────
  const stopVideoTrack = useCallback(() => {
    const track = videoTrackRef.current;
    const activeVideoEl = attachedVideoElRef.current || videoRef.current;
    if (track) {
      try {
        if (activeVideoEl) { track.detach(activeVideoEl); } else { track.detach(); }
      } catch {}
      try { track.stop(); } catch {}
      videoTrackRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    attachedVideoElRef.current = null;
    bgAttachedTrackRef.current = null;
    bgLastAppliedEffectRef.current = "none";
  }, []);

  const stopAudioTrack = useCallback(() => {
    const track = audioTrackRef.current;
    if (track) {
      try { track.stop(); } catch {}
      audioTrackRef.current = null;
    }
  }, []);

  const disposeBackgroundProcessor = useCallback(async () => {
    bgOpRef.current += 1;
    const processor = bgProcessorRef.current;
    bgProcessorRef.current = null;
    bgAttachedTrackRef.current = null;
    bgLastAppliedEffectRef.current = "none";
    if (!processor) return; // Fast path: nothing to dispose
    if (processor.destroy) {
      try { await withTimeout(Promise.resolve(processor.destroy()), 1500, "prejoin-bg-destroy"); } catch {}
    }
  }, []);

  // ── Background helpers ──────────────────────────────────────
  const applyBackgroundToTrack = useCallback(async (track: LocalVideoTrack, effect: BackgroundEffect) => {
    if (!mountedRef.current) return false;
    if (effect !== "none" && !supportsBackgroundProcessors()) {
      setBackgroundPreviewUnsupported(true);
      return false;
    }
    if (effect !== "none" && Date.now() < bgFailureCooldownUntilRef.current) return false;
    const opId = ++bgOpRef.current;
    try {
      if (effect === "none") {
        const processor = bgProcessorRef.current;
        if (processor?.switchTo) {
          await withTimeout(Promise.resolve(processor.switchTo({ mode: "disabled" })), PREJOIN_BG_SWITCH_TIMEOUT_MS, "prejoin-bg-disable");
        }
        bgLastAppliedEffectRef.current = "none";
        setBackgroundPreviewUnsupported(false);
        return true;
      }
      let processor = bgProcessorRef.current;
      if (!processor) {
        processor = BackgroundProcessor({ mode: "disabled" });
        bgProcessorRef.current = processor;
      }
      if (bgAttachedTrackRef.current !== track) {
        await withTimeout(Promise.resolve(track.setProcessor(processor, true)), PREJOIN_BG_ATTACH_TIMEOUT_MS, "prejoin-bg-attach");
        bgAttachedTrackRef.current = track;
      }
      if (opId !== bgOpRef.current) return false;
      if (esBlur(effect)) {
        await withTimeout(Promise.resolve(processor.switchTo({ mode: "background-blur", blurRadius: radioDeBlur(effect) })), PREJOIN_BG_SWITCH_TIMEOUT_MS, "prejoin-bg-blur");
      } else {
        // Plantillas y fondos propios por el MISMO resolvedor que usa la
        // llamada: si acá se resolviera distinto, la vista previa mentiría.
        // CON TIMEOUT, igual que en la llamada: un pedido de IndexedDB que no
        // dispara ni onsuccess ni onerror dejaría esta cola muerta para toda la
        // sesión, y la vista previa tapada por el velo de "preparando".
        const imagen = await withTimeout(
          resolverImagenDeFondo(effect, window.location.origin),
          PREJOIN_BG_SWITCH_TIMEOUT_MS,
          "prejoin-bg-resolver",
        ).catch((): ImagenDeFondo => ({ falta: false }));
        // ⚠️ Re-chequeo tras el await: si la persona ya eligió otra cosa, seguir
        // acá le pisaría la elección nueva y hasta le borraría la preferencia.
        if (opId !== bgOpRef.current) return false;
        const urlImagen = "url" in imagen ? imagen.url : null;
        if (!urlImagen) {
          // Solo si la imagen DE VERDAD no está se limpia lo guardado. Si el
          // almacenamiento tuvo un hipo, la preferencia se respeta.
          if ("falta" in imagen && imagen.falta) {
            guardarFondo("none");
            setBgEffectEstado("none");
            toast.error(traducir("messenger.lobby.fondoNoDisponible"), { description: traducir("messenger.lobby.eligeOtro"), id: "fondo-perdido" });
          }
          return false;
        }
        if (!preloadedRef.current.has(urlImagen)) {
          // Con tope: una red que se cuelga justo acá dejaba la cola trabada.
          await withTimeout(new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.src = urlImagen;
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("bg-image-load-failed"));
          }), PREJOIN_BG_SWITCH_TIMEOUT_MS, "prejoin-bg-precarga");
          preloadedRef.current.add(urlImagen);
        }
        if (opId !== bgOpRef.current) return false;
        await withTimeout(Promise.resolve(processor.switchTo({ mode: "virtual-background", imagePath: urlImagen })), PREJOIN_BG_SWITCH_TIMEOUT_MS, "prejoin-bg-imagen");
      }
      if (opId !== bgOpRef.current) return false;
      bgFailureCooldownUntilRef.current = 0;
      bgLastAppliedEffectRef.current = effect;
      setBackgroundPreviewUnsupported(false);
      return true;
    } catch (err) {
      console.warn("[PreJoin] Background preview failed:", err);
      if (opId !== bgOpRef.current) return false;
      bgFailureCooldownUntilRef.current = Date.now() + PREJOIN_BG_FAILURE_COOLDOWN_MS;
      try { await withTimeout(Promise.resolve((track as any).stopProcessor?.()), 1500, "prejoin-bg-stop"); } catch {}
      bgAttachedTrackRef.current = null;
      bgLastAppliedEffectRef.current = "none";
      await disposeBackgroundProcessor();
      if (videoRef.current && track && mountedRef.current && videoTrackRef.current === track) {
        try { track.detach(); track.attach(videoRef.current); attachedVideoElRef.current = videoRef.current; videoRef.current.play?.().catch(() => {}); } catch {}
      }
      // Un paso que se pasó de su tope (la foto que no termina de bajar, el motor
      // que no contesta) NO es "tu navegador no soporta": en el caso de Grace ese
      // aviso culpaba a Chrome. Se dice que el fondo tardó.
      const fueUnTope = /-timeout$/.test(String((err as Error)?.message ?? ""));
      setBackgroundPreviewUnsupported(effect !== "none" && !fueUnTope);
      if (fueUnTope && effect !== "none") setFondoTardo(true);
      return false;
    }
  }, [disposeBackgroundProcessor]);

  const queueBackgroundApply = useCallback((effect: BackgroundEffect) => {
    bgRequestedEffectRef.current = effect;
    bgApplyQueueRef.current = bgApplyQueueRef.current
      .catch(() => false)
      .then(async () => {
        while (mountedRef.current) {
          const nextEffect = bgRequestedEffectRef.current;
          const track = videoTrackRef.current;
          if (!track || !camOn) { bgLastAppliedEffectRef.current = "none"; return nextEffect === "none"; }
          const processorAttached = bgAttachedTrackRef.current === track;
          if (nextEffect === bgLastAppliedEffectRef.current && (nextEffect === "none" || processorAttached)) return true;
          const applied = await applyBackgroundToTrack(track, nextEffect);
          if (bgRequestedEffectRef.current === nextEffect) return applied;
        }
        return false;
      });
    return bgApplyQueueRef.current;
  }, [applyBackgroundToTrack, camOn]);

  /** Aplica el fondo con un TOPE TOTAL. Si no llega a tiempo, deja de esperar:
   *  invalida lo que siga en vuelo, destraba la cola y avisa que se muestra sin
   *  fondo. Devuelve si quedó aplicado. */
  const aplicarFondoConTope = useCallback(async (effect: BackgroundEffect): Promise<boolean> => {
    try {
      const ok = await withTimeout(queueBackgroundApply(effect), PREJOIN_BG_TOTAL_TIMEOUT_MS, "prejoin-bg-total");
      if (ok || effect === "none") setFondoTardo(false);
      return ok;
    } catch (e) {
      console.warn("[PreJoin] El fondo no estuvo listo a tiempo; se muestra sin fondo:", e);
      bgOpRef.current += 1; // lo que siga en vuelo ya no aplica
      bgApplyQueueRef.current = Promise.resolve(false); // la cola no queda trabada detrás
      if (mountedRef.current) setFondoTardo(true);
      return false;
    }
  }, [queueBackgroundApply]);

  const startVideoTrack = useCallback(async () => {
    const gen = ++camaraGenRef.current;
    const vigente = () => gen === camaraGenRef.current && mountedRef.current;
    stopVideoTrack();
    setIsPreparingBackgroundFirstFrame(false);
    setAbriendoCamara(false);
    setFondoTardo(false);

    // Un motor de fondo POR PISTA. Reutilizarlo entre pistas dejaba colgado el
    // anterior: cada apagar/prender sumaba otro segmentador y otro contexto de
    // WebGL sin cerrar, hasta que el navegador empezaba a perder contextos.
    await disposeBackgroundProcessor();
    if (!vigente()) return;
    // Un error viejo de la CÁMARA se va al volver a intentar (los del micrófono no).
    setPermissionError((e) => (e && ERRORES_DE_CAMARA.has(e) ? null : e));
    if (!camOn) return;

    setAbriendoCamara(true);

    try {
      const pedido = createLocalTracks({
        video: camaraPedida ? { deviceId: { ideal: camaraPedida } } : true,
        audio: false,
      });
      let tracks: Awaited<typeof pedido>;
      try {
        tracks = await withTimeout(pedido, PREJOIN_CAMARA_TIMEOUT_MS, "prejoin-camara");
      } catch (e) {
        if ((e as Error)?.message !== "prejoin-camara-timeout") throw e;
        // ⚠️ El tope AVISA, pero no descarta: se sigue esperando. Si la cámara
        // contesta tarde (la persona encontró el aviso de permiso a los 15 s) y
        // esta corrida sigue siendo la vigente, se usa. Descartarla apagaba la
        // cámara que la persona acababa de permitir.
        if (vigente()) {
          setAbriendoCamara(false);
          setPermissionError(await mensajeDeCamaraQueNoContesta());
        }
        tracks = await pedido;
      }
      if (!vigente()) {
        tracks.forEach((t) => t.stop());
        return;
      }

      const vTrack = tracks.find((t): t is LocalVideoTrack => t.kind === "video") || null;
      videoTrackRef.current = vTrack;
      setAbriendoCamara(false);
      setPermissionError((e) => (e && ERRORES_DE_CAMARA.has(e) ? null : e));
      // El fondo se lee AHORA, con la pista en la mano: si se lee antes de pedir
      // la cámara, un cambio de fondo hecho mientras abría se perdía.
      const requestedEffect = bgEffectRef.current;

      // El fondo se prepara ANTES de mostrar el primer cuadro (para no mostrar
      // la habitación ni un instante), pero con tope: si no llega, se muestra a
      // la persona sin fondo en vez de dejarla sin verse.
      if (vTrack && requestedEffect !== "none") {
        setIsPreparingBackgroundFirstFrame(true);
        await aplicarFondoConTope(requestedEffect);
        if (!vigente()) return;
        setIsPreparingBackgroundFirstFrame(false);
      }

      if (videoRef.current && vTrack) {
        vTrack.attach(videoRef.current);
        attachedVideoElRef.current = videoRef.current;
        videoRef.current.play?.().catch(() => {});
      }

      setPermissionError(null);
      await enumerateDevices();
    } catch (err: any) {
      if (!vigente()) return;
      if (err?.message === "prejoin-camara-timeout") {
        setPermissionError("messenger.lobby.camaraNoResponde");
      } else if (err?.name === "NotAllowedError") {
        setPermissionError("messenger.lobby.permisoCamaraDenegado");
      } else {
        setPermissionError("messenger.lobby.noSePudoCamara");
      }
    } finally {
      if (vigente()) {
        setIsPreparingBackgroundFirstFrame(false);
        setAbriendoCamara(false);
      }
    }
  }, [camOn, camaraPedida, stopVideoTrack, disposeBackgroundProcessor, aplicarFondoConTope, enumerateDevices]);

  const startAudioTrack = useCallback(async () => {
    const gen = ++microfonoGenRef.current;
    const vigente = () => gen === microfonoGenRef.current && mountedRef.current;
    stopAudioTrack();
    if (!micOn) return;
    try {
      const tracks = await createLocalTracks({ video: false, audio: microfonoPedido ? { deviceId: { ideal: microfonoPedido } } : true });
      if (!vigente()) { tracks.forEach((t) => t.stop()); return; }
      const aTrack = tracks.find((t): t is LocalAudioTrack => t.kind === "audio") || null;
      audioTrackRef.current = aTrack;
      setPermissionError(null);
      await enumerateDevices();
    } catch (err: any) {
      if (!vigente()) return;
      if (err?.name === "NotAllowedError") { setPermissionError("messenger.lobby.permisoMicrofonoDenegado"); }
    }
  }, [micOn, microfonoPedido, stopAudioTrack, enumerateDevices]);

  useEffect(() => { startVideoTrack(); return () => { stopVideoTrack(); }; }, [startVideoTrack, stopVideoTrack]);
  useEffect(() => { startAudioTrack(); return () => { stopAudioTrack(); }; }, [startAudioTrack, stopAudioTrack]);

  useEffect(() => {
    bgEffectRef.current = bgEffect;
    bgRequestedEffectRef.current = bgEffect;

    if (!camOn) {
      setIsPreparingBackgroundFirstFrame(false);
      return;
    }

    if (!videoTrackRef.current) return;

    const shouldPrepareBackgroundFirst = bgEffect !== "none";
    if (shouldPrepareBackgroundFirst) {
      setIsPreparingBackgroundFirstFrame(true);
    }

    // Mismo tope que al prender la cámara: el velo esconde el video, y sin tope
    // un cambio de fondo que se trababa la dejaba sin verse.
    void aplicarFondoConTope(bgEffect).finally(() => {
      if (mountedRef.current) {
        setIsPreparingBackgroundFirstFrame(false);
      }
    });
  }, [bgEffect, camOn, aplicarFondoConTope]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      bgRequestedEffectRef.current = "none";
      void disposeBackgroundProcessor();
    };
  }, [disposeBackgroundProcessor]);

  const handleToggleMic = () => setMicOn((v) => !v);
  const handleToggleCam = () => setCamOn((v) => {
    const next = !v;
    if (!next) {
      setIsPreparingBackgroundFirstFrame(false);
    }
    return next;
  });

  const handleJoin = async () => {
    setJoining(true);


    await disposeBackgroundProcessor();
    stopVideoTrack();
    stopAudioTrack();
    onJoin({ micOn, camOn, audioDeviceId: selectedAudioInput || undefined, videoDeviceId: selectedVideoInput || undefined, audioOutputDeviceId: selectedAudioOutput || undefined, backgroundEffect: bgEffect });
  };

  useEffect(() => {
    if (!openDropdown) return;
    const handler = () => setOpenDropdown(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openDropdown]);

  const truncateLabel = (label: string, max = 18) =>
    label.length > max ? label.slice(0, max) + "…" : label;

  const selectedBackgroundLabel =
    bgEffect === "none" ? t("messenger.bg.sinFondo")
    : bgEffect === "blur" ? t("messenger.call.difuminarFondo")
    : bgEffect === "blur-strong" ? t("messenger.bg.difuminarMas")
    : isCustomBackground(bgEffect) ? t("messenger.bg.tuFondo")
    : (() => {
        const tpl = BACKGROUND_TEMPLATES.find((x) => x.id === bgEffect);
        return tpl ? nombreDelFondo(tpl, t) : t("messenger.bg.fondoVirtual");
      })();

  const selectedBackgroundTemplate = BACKGROUND_TEMPLATES.find((tpl) => tpl.id === bgEffect) || null;
  const showBackgroundWarmupOverlay = camOn && isPreparingBackgroundFirstFrame && bgEffect !== "none";
  const mostrarAbriendoCamara = camOn && abriendoCamara;

  return (
    <div className="h-screen w-screen bg-background flex items-center justify-center p-4 md:p-8">
      <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-10 max-w-5xl w-full">

        {/* ── Left: Camera preview ── */}
        <div className="flex flex-col items-center gap-5 flex-1 w-full max-w-[640px]">
          <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-card">
            {/* Background template preview fallback */}
            {selectedBackgroundTemplate && (backgroundPreviewUnsupported || showBackgroundWarmupOverlay) && (
              <img src={selectedBackgroundTemplate.src} alt={t("messenger.lobby.vistaPreviaFondo", { fondo: nombreDelFondo(selectedBackgroundTemplate, t) })} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
            )}

            {showBackgroundWarmupOverlay && !selectedBackgroundTemplate && (
              <div className="absolute inset-0 bg-card" />
            )}

            {camOn ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                // `contain`: esta es la pantalla donde uno se mira ANTES de entrar. Si
                // recorta, la persona se acomoda para una imagen que no es la que van
                // a ver los demás.
                className={cn("absolute inset-0 w-full h-full object-contain transition-opacity duration-150", showBackgroundWarmupOverlay && "opacity-0")}
                style={{ transform: "scaleX(-1)" }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-card">
                <UserAvatar
                  name={displayName}
                  size="xl"
                  className="h-20 w-20 md:h-24 md:w-24"
                />
              </div>
            )}

            {(showBackgroundWarmupOverlay || mostrarAbriendoCamara) && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-[hsl(220_3%_14%/0.45)] backdrop-blur-[2px]">
                <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(220_3%_14%/0.8)] px-3 py-1.5 text-xs text-foreground border border-border">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t(mostrarAbriendoCamara ? "messenger.lobby.abriendoCamara" : "messenger.lobby.aplicandoFondo")}
                </div>
              </div>
            )}

            {/* Name tag */}
            <div className="absolute bottom-3 left-3 z-10">
              <span className="text-sm font-medium text-white drop-shadow-md">{displayName}</span>
            </div>

            {/* Mic & Cam toggle buttons overlaid on preview */}
            {/* z-30: por ENCIMA de los carteles (z-20). Si no, el aviso de error
                tapaba el botón de la cámara y no se podía volver a intentar. */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 z-30">
              <button
                onClick={handleToggleMic}
                className={cn(
                  "h-11 w-11 rounded-full flex items-center justify-center transition-all",
                  micOn
                    ? "bg-muted hover:bg-muted text-white"
                    : "bg-destructive hover:bg-destructive/90 text-white"
                )}
                title={micOn ? t("messenger.lobby.desactivarMicrofono") : t("messenger.lobby.activarMicrofono")}
              >
                {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>
              <button
                onClick={handleToggleCam}
                className={cn(
                  "h-11 w-11 rounded-full flex items-center justify-center transition-all",
                  camOn
                    ? "bg-muted hover:bg-muted text-white"
                    : "bg-destructive hover:bg-destructive/90 text-white"
                )}
                title={camOn ? t("messenger.lobby.desactivarCamara") : t("messenger.lobby.activarCamara")}
              >
                {camOn ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
              </button>
            </div>

            {permissionError && (
              <div className="absolute inset-0 flex items-center justify-center bg-[hsl(220_3%_14%/0.95)] z-20 px-6">
                <p className="text-sm text-destructive text-center">{t(permissionError)}</p>
              </div>
            )}
          </div>

          {/* Device selectors — Google Meet style pills */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <DeviceDropdown
              icon={<Mic className="h-3.5 w-3.5 shrink-0" />}
              label={truncateLabel(audioInputs.find((d) => d.deviceId === selectedAudioInput)?.label || t("messenger.call.microfono"))}
              devices={audioInputs}
              selectedId={selectedAudioInput}
              onSelect={(id) => { setSelectedAudioInput(id); setMicrofonoPedido(id); }}
              isOpen={openDropdown === "mic"}
              onToggle={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === "mic" ? null : "mic"); }}
            />
            <DeviceDropdown
              icon={<Volume2 className="h-3.5 w-3.5 shrink-0" />}
              label={truncateLabel(audioOutputs.find((d) => d.deviceId === selectedAudioOutput)?.label || t("messenger.lobby.altavoces"))}
              devices={audioOutputs}
              selectedId={selectedAudioOutput}
              onSelect={(id) => setSelectedAudioOutput(id)}
              isOpen={openDropdown === "speaker"}
              onToggle={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === "speaker" ? null : "speaker"); }}
            />
            <DeviceDropdown
              icon={<Monitor className="h-3.5 w-3.5 shrink-0" />}
              label={truncateLabel(videoInputs.find((d) => d.deviceId === selectedVideoInput)?.label || t("messenger.input.camara"))}
              devices={videoInputs}
              selectedId={selectedVideoInput}
              onSelect={(id) => { setSelectedVideoInput(id); setCamaraPedida(id); }}
              isOpen={openDropdown === "cam"}
              onToggle={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === "cam" ? null : "cam"); }}
            />
            <BackgroundSelector selected={bgEffect} onSelect={setBgEffect} />
          </div>

          {bgEffect !== "none" && (
            <p className="text-xs text-muted-foreground text-center">
              {t("messenger.lobby.fondo")} <span className="text-foreground">{selectedBackgroundLabel}</span>
            </p>
          )}
          {backgroundPreviewUnsupported && bgEffect !== "none" && (
            <p className="text-[11px] text-muted-foreground text-center max-w-md">
              {t("messenger.lobby.sinVistaPrevia")}
            </p>
          )}
          {fondoTardo && !backgroundPreviewUnsupported && bgEffect !== "none" && camOn && (
            <p className="text-[11px] text-muted-foreground text-center max-w-md">
              {t("messenger.lobby.fondoTardo")}
            </p>
          )}
        </div>

        {/* ── Right: Join panel ── */}
        <div className="flex flex-col items-center gap-5 text-center min-w-[260px] max-w-[320px]">
          <h1 className="text-xl md:text-2xl font-normal text-white">
            {t("messenger.lobby.listo")}
          </h1>
          {callDisplayName && (
            <p className="text-sm text-muted-foreground">{callDisplayName}</p>
          )}

          {quienesEstan && (
            <QuienesEstan personas={quienesEstan.personas} cargando={quienesEstan.cargando} />
          )}

          <button
            onClick={handleJoin}
            disabled={joining}
            className={cn(
              "w-full max-w-[260px] h-12 rounded-full font-medium text-sm tracking-wide transition-all",
              "bg-primary text-white hover:bg-primary/90 hover:shadow-lg",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "flex items-center justify-center gap-2"
            )}
          >
            {joining ? (
              <><Loader2 className="h-4 w-4 animate-spin" />{t("messenger.lobby.conectando")}</>
            ) : (
              t("messenger.lobby.unirseAhora")
            )}
          </button>

          <p className="text-xs text-muted-foreground">
            {t("messenger.lobby.sePuedenCambiar")}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Device dropdown selector (Google Meet pill style) ────────────
function DeviceDropdown({
  icon, label, devices, selectedId, onSelect, isOpen, onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  devices: DeviceInfo[];
  selectedId: string;
  onSelect: (id: string) => void;
  isOpen: boolean;
  onToggle: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs transition-colors bg-card text-foreground hover:bg-muted border border-border"
      >
        {icon}
        <span className="max-w-[120px] truncate">{label}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      {isOpen && devices.length > 0 && (
        <div
          className="absolute bottom-full mb-1 left-0 z-50 min-w-[220px] max-w-[300px] rounded-lg bg-card border border-border shadow-xl p-1"
          onClick={(e) => e.stopPropagation()}
        >
          {devices.map((d) => (
            <button
              key={d.deviceId}
              onClick={() => onSelect(d.deviceId)}
              className={cn(
                "w-full text-left text-xs px-3 py-2 rounded-md transition-colors truncate",
                d.deviceId === selectedId
                  ? "bg-primary/15 text-primary font-medium"
                  : "text-foreground hover:bg-muted"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
