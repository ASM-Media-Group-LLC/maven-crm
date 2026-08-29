import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCoworkMediaPresence, type MediaState } from "@/hooks/useCoworkMediaPresence";
import { playCoordinatorRequestSound } from "@/lib/coordinatorRequestSound";
import { hablar } from "@/lib/voz";
import { cuentaPausa, nombreYApellido, AVISAR_SUPERVISOR_PASADO_MS } from "@/lib/pausaCowork";
import { AVISAR_COORDINADOR_MS, debeAvisarSinPantalla } from "@/hooks/useFaceNudge";
import { olvidarAusentes } from "@/lib/avisosSupervisor";
import { leerLimitesPausa } from "@/lib/coworkTablas";

// Los avisos del supervisor, EN CUALQUIER PARTE DE MAVEN.
//
// Antes vivían dentro del dashboard de Cowork. Al navegar a otra sección el
// componente se desmontaba y el supervisor dejaba de enterarse de todo: quién
// no está en cámara, quién no comparte pantalla, quién se pasó de su pausa.
//
// Y esa es justo la ventana en la que más falta hacen. Un supervisor no se
// queda ocho horas mirando la grilla: entra a un ticket, contesta un mensaje,
// revisa un contacto. Si las alertas solo funcionan mientras tiene Cowork
// adelante, funcionan cuando ya estaba mirando — o sea, cuando no hacían falta.
//
// Es el mismo movimiento que ya se le hizo a los avisos de mano levantada
// (useCoworkRequestAlerts), con el mismo argumento: quien pide ayuda no puede
// depender de qué pestaña esté mirando quien tiene que atenderla.
//
// ⚠️ ESTE HOOK ES EL ÚNICO DUEÑO DE ESTOS AVISOS. El dashboard ya NO los
// dispara. Si se dejaran en los dos lados sonarían DOS VECES mientras el
// supervisor está parado en Cowork — que es exactamente lo que dice el
// comentario que quedó en el dashboard cuando se mudaron las manos levantadas.
//
// El dashboard sigue dibujando sus chapas y contadores: eso es información en
// pantalla, no un aviso, y no tiene sentido fuera de Cowork.

/** Cada cuánto se recalculan los contadores. Los avisos dependen de tiempo
 *  transcurrido, no de que llegue un evento: si esperáramos a un evento de
 *  presence, alguien inmóvil frente a una cámara apagada no dispararía nada. */
const TIC_MS = 1000;

/** Cuánto tiene que llevar un problema de encuadre para que cuente. Por debajo
 *  de esto es un parpadeo del detector, no una ausencia. */
const FACE_MINIMO_MS = 60_000;

function problemaDeEncuadre(ms: MediaState | undefined, ahora: number): string | null {
  if (!ms || !ms.faceState || !ms.faceSince) return null;
  if (ms.onBreak) return null;                     // avisó que se iba
  if (ms.faceState === "ok") return null;
  if (ms.faceState === "unavailable") return null; // el detector no cargó en su equipo
  if (ahora - ms.faceSince < FACE_MINIMO_MS) return null;
  return ms.faceState === "no_face" ? "Sin rostro"
    : ms.faceState === "too_small" ? "Fuera de cuadro"
    : ms.faceState === "too_dark" ? "Sin luz"
    : ms.faceState === "cam_off" ? "Cámara apagada"
    : null;
}

export function useCoworkSupervisorAlerts() {
  const { user } = useAuth();
  // El ID, no el objeto: `useAuth` emite un `user` nuevo por referencia en cada
  // lectura de sesión y depender del objeto re-corre los efectos de gusto.
  const uid = user?.id;

  const [sessionId, setSessionId] = useState<string | undefined>();
  const [perfiles, setPerfiles] = useState<Record<string, string>>({});
  const [limites, setLimites] = useState<Record<string, number>>({});
  const [ahora, setAhora] = useState(() => Date.now());

  // ── Mi sesión de Cowork como host, si hay alguna activa ────────────────────
  useEffect(() => {
    if (!uid) { setSessionId(undefined); return; }
    let cancelado = false;
    const buscar = async () => {
      const { data } = await supabase
        .from("cowork_memberships")
        .select("session_id, cowork_sessions!inner(status)")
        .eq("user_id", uid).eq("role", "host")
        .eq("cowork_sessions.status", "active");
      if (cancelado) return;
      setSessionId((data?.[0] as { session_id?: string } | undefined)?.session_id);
    };
    void buscar();
    // Se relee cada tanto porque una sesión puede abrirse o cerrarse mientras la
    // persona está en otra sección de Maven — que es todo el punto de este hook.
    const id = window.setInterval(() => void buscar(), 60_000);
    return () => { cancelado = true; window.clearInterval(id); };
  }, [uid]);

  // `persistente` para que el canal sobreviva a navegar: si se cerrara al salir
  // de Cowork, este hook se quedaría sin datos justo cuando empieza a servir.
  const { mediaStates } = useCoworkMediaPresence(sessionId, uid, { persistente: true });

  // ── Reloj ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    const id = window.setInterval(() => setAhora(Date.now()), TIC_MS);
    return () => window.clearInterval(id);
  }, [sessionId]);

  // ── Topes de pausa ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    void leerLimitesPausa(supabase).then(setLimites);
  }, [sessionId]);

  // ── Nombres ───────────────────────────────────────────────────────────────
  // Solo se piden los que faltan. Un aviso que dice "alguien" no sirve: en una
  // grilla de nueve salas, saber A QUIÉN mirar es la mitad del aviso.
  const uidsPresentes = Object.keys(mediaStates).sort().join(",");
  useEffect(() => {
    const faltan = Object.keys(mediaStates).filter((u) => !(u in perfiles));
    if (!faltan.length) return;
    let cancelado = false;
    void supabase.from("profiles").select("id, full_name").in("id", faltan).then(({ data }) => {
      if (cancelado || !data) return;
      setPerfiles((prev) => {
        const nuevo = { ...prev };
        for (const p of data as { id: string; full_name: string | null }[]) {
          nuevo[p.id] = p.full_name ?? "";
        }
        return nuevo;
      });
    });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uidsPresentes]);

  // ── 1. Encuadre ───────────────────────────────────────────────────────────
  const avisadoEncuadre = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Quien se fue de la sesión pierde su marca: si no, al volver figura como
    // "ya avisado" y no vuelve a sonar NUNCA.
    olvidarAusentes(avisadoEncuadre.current, mediaStates);
    for (const [u, st] of Object.entries(mediaStates)) {
      const problema = problemaDeEncuadre(st, ahora);
      const bastante = !!problema && !!st.faceSince && (ahora - st.faceSince) >= AVISAR_COORDINADOR_MS;
      if (!bastante) { if (!problema) avisadoEncuadre.current.delete(u); continue; }
      if (avisadoEncuadre.current.has(u)) continue;
      avisadoEncuadre.current.add(u);
      const quien = nombreYApellido(perfiles[u]);
      playCoordinatorRequestSound();
      hablar(
        problema === "Sin luz" ? `${quien} no tiene luz suficiente.`
        : problema === "Fuera de cuadro" ? `${quien} está fuera de cuadro.`
        : problema === "Cámara apagada" ? `${quien} tiene la cámara apagada y no marcó pausa.`
        : `${quien} no está frente a la cámara.`,
        { volumen: 0.85 },
      );
      toast.warning(`${quien}: ${problema.toLowerCase()}`, {
        description: "Lleva más de tres minutos así y ya se le avisó dos veces.",
        duration: 8000,
      });
    }
  }, [mediaStates, ahora, perfiles]);

  // ── 2. Compartir pantalla ─────────────────────────────────────────────────
  const avisadoPantalla = useRef<Set<string>>(new Set());
  useEffect(() => {
    olvidarAusentes(avisadoPantalla.current, mediaStates);
    for (const [u, st] of Object.entries(mediaStates)) {
      if (!debeAvisarSinPantalla(st, ahora)) {
        // Se rearma solo cuando VUELVE a compartir, no apenas deja de cumplirse
        // la condición: si se rearmara con la pausa, volvería a sonar al volver
        // del baño sin que la persona haya hecho nada distinto.
        if (st.screenShareOn) avisadoPantalla.current.delete(u);
        continue;
      }
      if (avisadoPantalla.current.has(u)) continue;
      avisadoPantalla.current.add(u);
      const quien = nombreYApellido(perfiles[u]);
      const minutos = Math.floor((ahora - (st.screenShareSince as number)) / 60000);
      playCoordinatorRequestSound();
      hablar(`${quien} lleva ${minutos} minutos sin compartir pantalla.`, { volumen: 0.85 });
      toast.warning(`${quien}: sin compartir pantalla`, {
        description: `Lleva ${minutos} minutos así y ya se le avisó dos veces.`,
        duration: 8000,
      });
    }
  }, [mediaStates, ahora, perfiles]);

  // ── 3. Pasado de pausa ────────────────────────────────────────────────────
  const avisadoPausa = useRef<Set<string>>(new Set());
  useEffect(() => {
    olvidarAusentes(avisadoPausa.current, mediaStates);
    for (const [u, st] of Object.entries(mediaStates)) {
      if (!st?.onBreak || !st.breakStartedAt) { avisadoPausa.current.delete(u); continue; }
      const kind = st.breakKind === "break" ? "break" : "bano";
      const transcurrido = Math.max(0, Math.floor((ahora - (st.breakStartedAt as number)) / 1000));
      // La cuenta la hace lib/pausaCowork, el MISMO módulo que usa la pantalla
      // del empleado: si cada lado la calculara por su cuenta, dirían cosas
      // distintas sobre el mismo minuto y se acaba la conversación sobre si
      // alguien se pasó o no.
      const cuenta = cuentaPausa(transcurrido, limites[kind], kind === "bano" ? (st.banoConsumidoSeg ?? 0) : 0);
      const pasadoSeg = -cuenta.restante;
      if (pasadoSeg * 1000 < AVISAR_SUPERVISOR_PASADO_MS) continue;
      if (avisadoPausa.current.has(u)) continue;
      avisadoPausa.current.add(u);
      const quien = nombreYApellido(perfiles[u]);
      const etiqueta = kind === "break" ? "break" : "baño";
      playCoordinatorRequestSound();
      hablar(`${quien} lleva ${Math.floor(pasadoSeg / 60)} minutos pasado de su ${etiqueta}.`, { volumen: 0.85 });
      toast.warning(`${quien}: pasado de ${etiqueta}`, {
        description: `Lleva ${cuenta.texto.replace("−", "")} de más y ya se le avisó por voz.`,
        duration: 10_000,
      });
    }
  }, [mediaStates, ahora, perfiles, limites]);
}
