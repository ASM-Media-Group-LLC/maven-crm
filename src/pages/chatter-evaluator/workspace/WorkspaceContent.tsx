import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  useChatterSessions,
  useChatterConfig,
} from "@/hooks/useChatterEvaluator";
import { CriteriaPanel, readScoresFromStorage, type CriteriaScores } from "./CriteriaPanel";
import { SessionsPanel } from "./SessionsPanel";
import { ChatPanel } from "./ChatPanel";

const ACTIVE_KEY = "maven.chatter.workspace.activeSessionId";

const WorkspaceContent = () => {
  const sessionsQ = useChatterSessions("all");
  const configQ = useChatterConfig();
  const [params, setParams] = useSearchParams();

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

  const handleSubmit = async () => {
    if (!selectedSession) return;
    const scores = scoresBySession[selectedSession.id] ?? {};
    const filled = Object.values(scores).filter(Boolean).length;
    if (filled === 0) {
      toast.error("No hay criterios calificados");
      return;
    }
    // For now, just toast — the full submission flow (verdict + feedback +
    // Apps Script webhook) is wired in Phase 4.
    toast.message("Phase 4 wires the verdict modal + webhook", {
      description: `${filled} criterio(s) calificados. Próximo paso: modal de verdict + envío al webhook de Apps Script.`,
    });
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/chatter-evaluator">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver
          </Link>
        </Button>
        <div className="text-xs text-muted-foreground">
          fan: {configQ.data?.fan_name ?? "JavixBuster"}
        </div>
      </div>

      {/* 3-panel grid */}
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[280px_280px_1fr]">
        <aside className="min-h-0 border-r">
          <CriteriaPanel
            session={selectedSession}
            scores={selectedId ? scoresBySession[selectedId] ?? {} : {}}
            setScores={setScoresForCurrent}
            onSubmitEvaluation={handleSubmit}
          />
        </aside>
        <aside className="min-h-0 border-r">
          <SessionsPanel selectedId={selectedId} onSelect={setSelectedId} />
        </aside>
        <section className="min-h-0">
          <ChatPanel session={selectedSession} />
        </section>
      </div>
    </main>
  );
};

export default WorkspaceContent;
