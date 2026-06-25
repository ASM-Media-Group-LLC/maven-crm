// "Dismiss" local del workspace de Chatter Evaluator: qué sesiones NO se muestran en el
// rail (SessionsPanel). Es por-usuario y NO toca el status del DB — solo localStorage; la
// sesión sigue existiendo y aparece en History. Compartido entre SessionsPanel (X manual) y
// WorkspaceContent (auto al enviar la evaluación), sincronizado vía un CustomEvent para que
// ambas vistas re-lean el set al cambiar.
export const DISMISSED_STORAGE_KEY = "chatter:dismissed-sessions";
export const DISMISSED_EVENT = "chatter:dismissed-changed";

export const loadDismissedFromStorage = (): Set<string> => {
  try {
    const raw = window.localStorage.getItem(DISMISSED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
};

const persist = (set: Set<string>) => {
  try {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* best effort */
  }
};

// Agrega una sesión al set de dismissed + notifica a los listeners (otras vistas re-leen).
// Idempotente. dispatchEvent es síncrono → los listeners del mismo window se actualizan ya.
export const dismissSession = (sessionId: string) => {
  const set = loadDismissedFromStorage();
  if (set.has(sessionId)) return;
  set.add(sessionId);
  persist(set);
  try {
    window.dispatchEvent(new CustomEvent(DISMISSED_EVENT));
  } catch {
    /* no-op */
  }
};
