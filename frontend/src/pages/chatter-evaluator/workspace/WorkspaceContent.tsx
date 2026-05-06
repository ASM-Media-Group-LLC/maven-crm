import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { toast } from "sonner";
import {
  useChatterSessions,
  useChatterConfig,
  useChatterCriteria,
} from "@/hooks/useChatterEvaluator";
import { CriteriaPanel, readScoresFromStorage, type CriteriaScores } from "./CriteriaPanel";
import { SessionsPanel } from "./SessionsPanel";
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
  const [infoHiddenByUser, setInfoHiddenByUser] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(INFO_HIDDEN_KEY) === "1";
    } catch {
      return false;
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
      window.localStorage.setItem(INFO_HIDDEN_KEY, infoHiddenByUser ? "1" : "0");
    } catch {
      /* no-op */
    }
  }, [infoHiddenByUser]);
  const isNarrow = useIsNarrow();
  // Effective visibility = user pref OR narrow viewport. The toggle
  // buttons keep working in either case — pressing "Mostrar" on a narrow
  // viewport will reveal the rail temporarily even if the user later
  // resizes wide and back.
  const criteriaHidden = criteriaHiddenByUser || isNarrow;
  const infoHidden = infoHiddenByUser || isNarrow;

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
            disabled={isNarrow && !criteriaHiddenByUser}
          >
            {criteriaHidden ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
            <span className="hidden sm:inline text-xs">Criterios</span>
          </Button>
          {/* Toggle the right-side character info rail. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setInfoHiddenByUser((v) => !v)}
            title={infoHidden ? "Mostrar info personaje" : "Ocultar info personaje"}
            className="gap-2"
            disabled={isNarrow && !infoHiddenByUser}
          >
            {infoHidden ? (
              <PanelRightOpen className="h-4 w-4" />
            ) : (
              <PanelRightClose className="h-4 w-4" />
            )}
            <span className="hidden sm:inline text-xs">Info personaje</span>
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
        <aside className="w-[240px] shrink-0 border-r border-border min-h-0">
          <SessionsPanel selectedId={selectedId} onSelect={setSelectedId} />
        </aside>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ChatPanel session={selectedSession} />
        </section>
        {!infoHidden && (
          <aside className="w-[300px] shrink-0 border-l border-border min-h-0">
            <CharacterInfoSidebar profileId={selectedSession?.profile_id ?? null} />
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

// Lightweight wrapper that resolves the profile from the cached profiles
// list and renders the same CharacterInfoPanel the chatter sees, in compact
// mode so it fits the 300px rail.
const CharacterInfoSidebar = ({ profileId }: { profileId: string | null }) => {
  const profilesQ = useChatterProfiles();
  const [lang] = useChatterLang();
  const profile = profileId
    ? (profilesQ.data ?? []).find((p) => p.id === profileId) ?? null
    : null;

  return (
    <aside className="h-full min-h-0 overflow-y-auto bg-card">
      {profile ? (
        <CharacterInfoPanel profile={profile} lang={lang} compact />
      ) : (
        <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
          Selecciona una sesión para ver la información del personaje.
        </div>
      )}
    </aside>
  );
};

export default WorkspaceContent;
