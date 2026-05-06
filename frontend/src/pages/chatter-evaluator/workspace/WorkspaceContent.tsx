import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, History as HistoryIcon } from "lucide-react";
import { toast } from "sonner";
import {
  useChatterSessions,
  useChatterConfig,
  useChatterCriteria,
} from "@/hooks/useChatterEvaluator";
import { CriteriaPanel, readScoresFromStorage, type CriteriaScores } from "./CriteriaPanel";
import { SessionsPanel } from "./SessionsPanel";
import { HistoryPanel } from "./HistoryPanel";
import { ChatPanel } from "./ChatPanel";
import { EvaluationVerdictDialog } from "./EvaluationVerdictDialog";
import { CharacterInfoPanel } from "./CharacterInfoPanel";
import { useChatterLang } from "./ChatToolbar";
import {
  useChatterProfiles,
} from "@/hooks/useChatterEvaluator";

const ACTIVE_KEY = "maven.chatter.workspace.activeSessionId";
const CRITERIA_HIDDEN_KEY = "maven.chatter.workspace.criteriaHidden";
const INFO_HIDDEN_KEY = "maven.chatter.workspace.infoHidden";

// Breakpoint debajo del cual los rails laterales (criterios + info
// personaje) se ocultan automáticamente. Cálculo:
//   viewport - sidebar global (~240px) - sessions (240px) - chat min (500px)
//   = espacio sobrante para criterios + info
// A 1500px nos quedan ~520px que cubren los dos rails (220 + 300).
// Debajo de 1500 sacamos los rails de los lados; el usuario los puede
// mostrar manualmente con los toggles si quiere.
const NARROW_BREAKPOINT = 1500;
const useIsNarrow = (): boolean => {
  const [narrow, setNarrow] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < NARROW_BREAKPOINT,
  );
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < NARROW_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return narrow;
};

const WorkspaceContent = () => {
  const sessionsQ = useChatterSessions("all");
  const configQ = useChatterConfig();
  const criteriaQ = useChatterCriteria();
  const [params, setParams] = useSearchParams();
  const [verdictOpen, setVerdictOpen] = useState(false);
  // Each side rail can be hidden independently. Persisted per browser so
  // reloads keep the choice. Also auto-hidden on narrow viewports so the
  // chat keeps a usable width.
  const [criteriaHiddenByUser, setCriteriaHiddenByUser] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(CRITERIA_HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  // Info personaje tiene 3 estados:
  //   "1"  → usuario lo ocultó manualmente (forzado oculto)
  //   "0"  → usuario lo mostró manualmente (forzado visible, incluso en narrow)
  //   null → sin override; cae al auto-hide por isNarrow
  // Esto deja que el toggle funcione siempre — el usuario puede forzar
  // mostrarlo aún en pantallas chicas si lo necesita.
  const [infoOverride, setInfoOverride] = useState<"show" | "hide" | null>(() => {
    try {
      const raw = window.localStorage.getItem(INFO_HIDDEN_KEY);
      if (raw === "1") return "hide";
      if (raw === "0") return "show";
      return null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(CRITERIA_HIDDEN_KEY, criteriaHiddenByUser ? "1" : "0");
    } catch {
      /* no-op */
    }
  }, [criteriaHiddenByUser]);
  useEffect(() => {
    try {
      if (infoOverride === "hide") {
        window.localStorage.setItem(INFO_HIDDEN_KEY, "1");
      } else if (infoOverride === "show") {
        window.localStorage.setItem(INFO_HIDDEN_KEY, "0");
      } else {
        window.localStorage.removeItem(INFO_HIDDEN_KEY);
      }
    } catch {
      /* no-op */
    }
  }, [infoOverride]);
  // Tab activo del rail derecho (persistido). Lifted up para que los
  // botones del topbar puedan setearlo sin tener que abrir el rail
  // primero.
  const [rightTab, setRightTab] = useState<"info" | "history">(() => {
    try {
      const v = window.localStorage.getItem(RIGHT_TAB_KEY);
      return v === "history" ? "history" : "info";
    } catch {
      return "info";
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(RIGHT_TAB_KEY, rightTab);
    } catch {
      /* no-op */
    }
  }, [rightTab]);

  const isNarrow = useIsNarrow();
  // Visibilidad de los rails:
  //   - Criterios: SOLO sigue el toggle manual del usuario.
  //   - Info personaje: 3-state — el usuario puede forzar show/hide
  //     y eso pisa el auto-hide. Sin override, en narrow se auto-oculta.
  const criteriaHidden = criteriaHiddenByUser;
  const infoHidden =
    infoOverride === "hide" ? true : infoOverride === "show" ? false : isNarrow;

  // Active session: priority is ?session=<id> in URL, else last from
  // localStorage, else the first open session.
  const sessionsList = sessionsQ.data ?? [];
  const fromUrl = params.get("session");
  const fromStorage = typeof window !== "undefined"
    ? window.localStorage.getItem(ACTIVE_KEY)
    : null;
  const initial =
    fromUrl ??
    fromStorage ??
    sessionsList.find((s) => s.status !== "ended")?.id ??
    null;

  const [selectedId, setSelectedId] = useState<string | null>(initial);

  // Sync URL + storage whenever selection changes
  useEffect(() => {
    if (selectedId) {
      window.localStorage.setItem(ACTIVE_KEY, selectedId);
      if (params.get("session") !== selectedId) {
        const next = new URLSearchParams(params);
        next.set("session", selectedId);
        setParams(next, { replace: true });
      }
    } else {
      window.localStorage.removeItem(ACTIVE_KEY);
      if (params.has("session")) {
        const next = new URLSearchParams(params);
        next.delete("session");
        setParams(next, { replace: true });
      }
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // If selectedId points to a session that no longer exists in the list, clear it
  useEffect(() => {
    if (!selectedId) return;
    if (!sessionsQ.isLoading && !sessionsList.find((s) => s.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, sessionsList, sessionsQ.isLoading]);

  const selectedSession = useMemo(
    () => sessionsList.find((s) => s.id === selectedId) ?? null,
    [sessionsList, selectedId]
  );

  // Per-session criteria scores (in memory + localStorage via the hook)
  const [scoresBySession, setScoresBySession] = useState<Record<string, CriteriaScores>>({});

  useEffect(() => {
    if (!selectedId) return;
    if (scoresBySession[selectedId]) return;
    const initial = readScoresFromStorage(selectedId);
    setScoresBySession((prev) => ({ ...prev, [selectedId]: initial }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const setScoresForCurrent = (next: CriteriaScores) => {
    if (!selectedId) return;
    setScoresBySession((prev) => ({ ...prev, [selectedId]: next }));
  };

  const currentScores = selectedId ? scoresBySession[selectedId] ?? {} : {};

  const currentScorePct = useMemo(() => {
    const criteria = criteriaQ.data ?? [];
    if (criteria.length === 0) return 0;
    let pass = 0, part = 0;
    for (const c of criteria) {
      const s = currentScores[c.id];
      if (s === "pass") pass++;
      else if (s === "partial") part++;
    }
    return Math.round(((pass + part * 0.5) / criteria.length) * 100);
  }, [currentScores, criteriaQ.data]);

  const handleSubmit = () => {
    if (!selectedSession) return;
    // Only count scores against current criterion ids — see the same
    // guard in EvaluationVerdictDialog: stale ids from a prior reset
    // would otherwise bypass this check.
    const criteria = criteriaQ.data ?? [];
    const filled = criteria.reduce(
      (n, c) => (currentScores[c.id] ? n + 1 : n),
      0,
    );
    if (filled === 0) {
      toast.error("No hay criterios calificados");
      return;
    }
    setVerdictOpen(true);
  };

  const handleSubmitted = () => {
    // Clear scores for the just-submitted session
    if (!selectedId) return;
    setScoresBySession((prev) => {
      const next = { ...prev };
      delete next[selectedId];
      return next;
    });
    window.localStorage.removeItem(`maven.chatter.scores.${selectedId}`);
    setSelectedId(null);
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link to="/chatter-evaluator">
              <ArrowLeft className="mr-2 h-4 w-4" /> Volver
            </Link>
          </Button>
          {/* Toggle the criteria rail. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCriteriaHiddenByUser((v) => !v)}
            title={criteriaHidden ? "Mostrar criterios" : "Ocultar criterios"}
            className="gap-2"
          >
            {criteriaHidden ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
            <span className="hidden sm:inline text-xs">Criterios</span>
          </Button>
          {/* Toggle del tab "Info personaje" del rail derecho. Si el
              rail está oculto, lo abre. Si ya está abierto en este tab,
              lo cierra. Si está abierto pero en History, switchea acá. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (!infoHidden && rightTab === "info") {
                // ya visible y activo → ocultar el rail
                setInfoOverride("hide");
              } else {
                // ocultar el rail por user toggle? mostrarlo. ya
                // visible pero en otro tab? cambiar de tab. mismo
                // resultado: abrir + setear tab.
                setInfoOverride("show");
                setRightTab("info");
              }
            }}
            title={
              infoHidden
                ? "Mostrar info personaje"
                : rightTab === "info"
                  ? "Ocultar info personaje"
                  : "Cambiar a info personaje"
            }
            className={`gap-2 ${!infoHidden && rightTab === "info" ? "bg-muted" : ""}`}
          >
            {infoHidden ? (
              <PanelRightOpen className="h-4 w-4" />
            ) : (
              <PanelRightClose className="h-4 w-4" />
            )}
            <span className="hidden sm:inline text-xs">Info personaje</span>
          </Button>
          {/* Toggle del tab "History" del rail derecho. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (!infoHidden && rightTab === "history") {
                setInfoOverride("hide");
              } else {
                setInfoOverride("show");
                setRightTab("history");
              }
            }}
            title={
              infoHidden
                ? "Mostrar historial de sesiones"
                : rightTab === "history"
                  ? "Ocultar historial"
                  : "Cambiar a historial"
            }
            className={`gap-2 ${!infoHidden && rightTab === "history" ? "bg-muted" : ""}`}
          >
            <HistoryIcon className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">History</span>
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          fan: {configQ.data?.fan_name ?? "JavixBuster"}
        </div>
      </div>

      {/* Layout fijo con flex en lugar de panels resizables. Cada rail
          tiene un ancho fijo razonable; el chat toma el resto del
          espacio con flex-1. Esto NO se rompe sin importar qué tan
          chico/grande haga el viewport el usuario, y no requiere
          guardar layouts en localStorage que después se desincronizan
          (el problema del ResizablePanelGroup anterior).

          Anchos elegidos: Criterios 220px (sus labels son cortos),
          Sessions 240px (tiene avatares + última activity), Character
          Info 300px (cards grandes con vault). Si el viewport es
          narrow, los rails se ocultan automáticamente vía useIsNarrow.

          Para mensajes muy largos en el chat, min-w-0 + overflow-hidden
          previene que el chat empuje los rails fuera de la pantalla. */}
      <div className="flex min-h-0 flex-1">
        {!criteriaHidden && (
          <aside className="w-[220px] shrink-0 border-r border-border min-h-0">
            <CriteriaPanel
              session={selectedSession}
              scores={currentScores}
              setScores={setScoresForCurrent}
              onSubmitEvaluation={handleSubmit}
            />
          </aside>
        )}
        {/* Slim sessions rail — solo el botón de "+ Nueva". El listado
            completo de sesiones (abiertas + cerradas) vive ahora en el
            tab History del rail derecho. */}
        <aside className="w-[110px] shrink-0 border-r border-border min-h-0">
          <SessionsPanel />
        </aside>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ChatPanel session={selectedSession} />
        </section>
        {!infoHidden && (
          <aside className="w-[320px] shrink-0 border-l border-border min-h-0">
            <RightRailTabs
              profileId={selectedSession?.profile_id ?? null}
              selectedSessionId={selectedId}
              onSelectSession={setSelectedId}
              tab={rightTab}
              onTabChange={setRightTab}
            />
          </aside>
        )}
      </div>

      {selectedSession && (
        <EvaluationVerdictDialog
          session={selectedSession}
          scores={currentScores}
          scorePct={currentScorePct}
          open={verdictOpen}
          onOpenChange={setVerdictOpen}
          onSubmitted={handleSubmitted}
        />
      )}
    </main>
  );
};

// Right-rail con dos tabs: Info personaje y History (todas las sesiones).
// Recordamos la última pestaña seleccionada en localStorage para no
// resetearla en cada montaje.
const RIGHT_TAB_KEY = "maven.chatter.workspace.rightTab";
type RightTab = "info" | "history";

const RightRailTabs = ({
  profileId,
  selectedSessionId,
  onSelectSession,
  tab,
  onTabChange,
}: {
  profileId: string | null;
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  tab: RightTab;
  onTabChange: (next: RightTab) => void;
}) => {
  const profilesQ = useChatterProfiles();
  const [lang] = useChatterLang();
  const profile = profileId
    ? (profilesQ.data ?? []).find((p) => p.id === profileId) ?? null
    : null;

  return (
    <aside className="flex h-full min-h-0 flex-col bg-card">
      {/* Tab strip */}
      <div className="flex shrink-0 items-stretch border-b border-border">
        <button
          type="button"
          onClick={() => onTabChange("info")}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            tab === "info"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Info personaje
        </button>
        <button
          type="button"
          onClick={() => onTabChange("history")}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            tab === "history"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          History
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "info" ? (
          profile ? (
            <div className="h-full overflow-y-auto">
              <CharacterInfoPanel profile={profile} lang={lang} compact />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
              Seleccioná una sesión para ver la información del personaje.
            </div>
          )
        ) : (
          <HistoryPanel
            selectedId={selectedSessionId}
            onSelect={onSelectSession}
          />
        )}
      </div>
    </aside>
  );
};

export default WorkspaceContent;
