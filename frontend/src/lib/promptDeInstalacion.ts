// Captura del evento `beforeinstallprompt` (Android Chrome / escritorio).
//
// Chrome lo dispara DURANTE la carga, antes de que monte cualquier hook de
// React: si se escucha desde un useEffect, ya pasó y el botón "Instalar Maven"
// nunca aparece. Por eso el listener vive a nivel de módulo y main.tsx importa
// este archivo antes de createRoot. El hook useInstalarMaven lo lee con
// useSyncExternalStore.
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

let promptGuardado: BeforeInstallPromptEvent | null = null;
const oyentes = new Set<() => void>();

function avisar() {
  oyentes.forEach((cb) => cb());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Sin preventDefault, Chrome muestra su mini-barra propia cuando quiere;
    // guardado, lo disparamos nosotros desde el botón.
    e.preventDefault();
    promptGuardado = e as BeforeInstallPromptEvent;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    promptGuardado = null;
    avisar();
  });
}

export function obtenerPrompt(): BeforeInstallPromptEvent | null {
  return promptGuardado;
}

/** Tras usarlo, el evento no sirve más: se descarta y se avisa. */
export function consumirPrompt(): void {
  promptGuardado = null;
  avisar();
}

export function suscribir(cb: () => void): () => void {
  oyentes.add(cb);
  return () => {
    oyentes.delete(cb);
  };
}
