import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  type Plataforma,
  detectarPlataforma,
  estaInstalada,
  instalacionPospuesta,
  posponerInstalacion,
} from "@/lib/plataformaPwa";
import { consumirPrompt, obtenerPrompt, suscribir } from "@/lib/promptDeInstalacion";

export type ResultadoInstalar = "aceptado" | "rechazado" | "sin-prompt";

/** Estado de instalación de la PWA para el banner y el panel de Ajustes. */
export function useInstalarMaven(): {
  instalada: boolean;
  plataforma: Plataforma;
  /** Hay un `beforeinstallprompt` capturado: Android/escritorio Chrome. */
  puedeInstalarNativo: boolean;
  /** Teléfono, no instalada y no pospuesta hace menos de 7 días. */
  mostrarGuia: boolean;
  instalar(): Promise<ResultadoInstalar>;
  posponer(): void;
} {
  const prompt = useSyncExternalStore(suscribir, obtenerPrompt, () => null);
  const plataforma = useMemo<Plataforma>(
    () => (typeof navigator !== "undefined" ? detectarPlataforma() : "escritorio"),
    [],
  );
  const [instalada, setInstalada] = useState(() => typeof window !== "undefined" && estaInstalada());
  const [pospuesta, setPospuesta] = useState(() => instalacionPospuesta());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const alCambiar = () => setInstalada(estaInstalada());
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia?.("(display-mode: standalone)") ?? null;
    } catch {
      mq = null;
    }
    mq?.addEventListener?.("change", alCambiar);
    window.addEventListener("appinstalled", alCambiar);
    return () => {
      mq?.removeEventListener?.("change", alCambiar);
      window.removeEventListener("appinstalled", alCambiar);
    };
  }, []);

  const instalar = useCallback(async (): Promise<ResultadoInstalar> => {
    const p = obtenerPrompt();
    if (!p) return "sin-prompt";
    try {
      await p.prompt();
      const { outcome } = await p.userChoice;
      return outcome === "accepted" ? "aceptado" : "rechazado";
    } finally {
      consumirPrompt();
    }
  }, []);

  const posponer = useCallback(() => {
    posponerInstalacion();
    setPospuesta(true);
  }, []);

  return {
    instalada,
    plataforma,
    puedeInstalarNativo: !!prompt,
    mostrarGuia: plataforma !== "escritorio" && !instalada && !pospuesta,
    instalar,
    posponer,
  };
}
