import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { toast } from "sonner";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
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

const WorkspaceContent = () => {
  const sessionsQ = useChatterSessions("all");
  const configQ = useChatterConfig();
  const criteriaQ = useChatterCriteria();
  const [params, setParams] = useSearchParams();
  const [verdictOpen, setVerdictOpen] = useState(false);
  // Criteria rail can be hidden when the examiner just wants to focus on
  // the chat. Persisted per browser so reloads keep the choice.
  const [criteriaHidden, setCriteriaHidden] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(CRITERIA_HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(CRITERIA_HIDDEN_KEY, criteriaHidden ? "1" : "0");
    } catch {
      /* no-op */
    }
  }, [criteriaHidden]);

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
          {/* Toggle the criteria rail. The examiner can collapse it to
              get more horizontal real estate for the chat + character
              info while a session is in progress, then re-open it when
              they're ready to grade. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCriteriaHidden((v) => !v)}
            title={criteriaHidden ? "Mostrar criterios" : "Ocultar criterios"}
            className="gap-2"
          >
            {criteriaHidden ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
            <span className="hidden sm:inline text-xs">
              {criteriaHidden ? "Mostrar criterios" : "Ocultar criterios"}
            </span>
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          fan: {configQ.data?.fan_name ?? "JavixBuster"}
        </div>
      </div>

      {/* Resizable panel layout. Each panel can be dragged via its
          handle; criteria can be fully hidden via the toolbar toggle.
          react-resizable-panels persists each panel's size under
          autoSaveId so the browser remembers the layout. */}
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId="maven-chatter-workspace-v1"
        className="min-h-0 flex-1"
      >
        {!criteriaHidden && (
          <>
            <ResizablePanel defaultSize={20} minSize={14} maxSize={32} className="min-h-0">
              <CriteriaPanel
                session={selectedSession}
                scores={currentScores}
                setScores={setScoresForCurrent}
                onSubmitEvaluation={handleSubmit}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        )}
        <ResizablePanel defaultSize={20} minSize={14} maxSize={32} className="min-h-0">
          <SessionsPanel selectedId={selectedId} onSelect={setSelectedId} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={40} minSize={25} className="min-h-0">
          <ChatPanel session={selectedSession} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={20} minSize={16} maxSize={32} className="min-h-0">
          <CharacterInfoSidebar profileId={selectedSession?.profile_id ?? null} />
        </ResizablePanel>
      </ResizablePanelGroup>

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
