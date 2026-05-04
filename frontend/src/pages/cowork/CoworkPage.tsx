import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useCoworkSession } from "@/hooks/useCoworkSession";
import { supabase } from "@/integrations/supabase/client";
import CoworkCreateDialog from "./CoworkCreateDialog";
import CoworkLobby from "./CoworkLobby";
import CoworkHostDashboard from "./CoworkHostDashboard";
import CoworkParticipantView from "./CoworkParticipantView";
import { Button } from "@/components/ui/button";
import { Plus, Users2 } from "lucide-react";
import { toast } from "sonner";

export default function CoworkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get("session");
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [autoJoining, setAutoJoining] = useState(false);
  const [autoJoinFailed, setAutoJoinFailed] = useState(false);
  
  const [userId, setUserId] = useState<string | null>(null);

  const cowork = useCoworkSession(sessionId);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null));
  }, []);

  // Auto-join from invite URL params
  useEffect(() => {
    if (!sessionId || cowork.loading || autoJoining || autoJoinFailed) return;

    const role = searchParams.get("role");
    const code = searchParams.get("code");
    const roomId = searchParams.get("room");

    const canAutoJoin = (role === "host" && code) || roomId;
    if (!canAutoJoin) return;

    if (cowork.myMembership) {
      const wantsHost = role === "host" && code;
      const isHost = cowork.myMembership.role === "host";
      const needsRoomAssignment = !wantsHost && !isHost && roomId && !cowork.myAssignment;
      if (((wantsHost && isHost) || (!wantsHost && !isHost)) && !needsRoomAssignment) return;
    }

    setAutoJoining(true);
    const doJoin = async () => {
      try {
        if (role === "host" && code) {
          await cowork.joinSession(sessionId, "host", code);
        } else if (roomId) {
          await cowork.joinSession(sessionId, "participant", undefined, roomId);
        }
        cowork.refetch();
      } catch (e) {
        console.error("Auto-join failed:", e);
        setAutoJoinFailed(true);
      } finally {
        setAutoJoining(false);
      }
    };
    doJoin();
  }, [sessionId, cowork.loading, cowork.myMembership, cowork.myAssignment, autoJoining, autoJoinFailed, searchParams]);

  // No session selected → landing
  if (!sessionId) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6 p-4 md:p-6">
        <div className="flex flex-col items-center gap-4 bg-primary/5 rounded-3xl px-6 md:px-10 py-10 md:py-12 max-w-lg w-full">
          <div className="flex items-center justify-center h-16 w-16 md:h-20 md:w-20 rounded-full bg-primary/10">
            <Users2 className="h-8 w-8 md:h-10 md:w-10 text-primary" />
          </div>
          <h1 className="text-xl md:text-3xl font-bold text-foreground tracking-tight text-center">
            Sala Cowork
          </h1>
          <p className="text-muted-foreground text-center text-sm md:text-base max-w-sm">
            Crea una sesión cowork con múltiples salas y colabora en tiempo real.
          </p>
          <Button
            onClick={() => setShowCreate(true)}
            size="lg"
            className="gap-2 rounded-full px-8 mt-2 shadow-md"
          >
            <Plus className="h-5 w-5" /> Crear sesión
          </Button>
        </div>

        <CoworkCreateDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          onCreate={async (name, roomNames, description) => {
            const result = await cowork.createSession(name, roomNames, description);
            setSearchParams({ session: result.sessionId });
            setShowCreate(false);
          }}
        />
      </div>
    );
  }

  if (cowork.loading || autoJoining) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-10 w-10 rounded-full border-[3px] border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  // Session ended → auto-redirect to main Maven dashboard
  if (cowork.session?.status === "ended") {
    return <CoworkSessionEndedRedirect />;
  }

  // Not a member yet → lobby
  if (!cowork.myMembership) {
    return (
      <CoworkLobby
        sessionId={sessionId}
        session={cowork.session}
        onJoin={async (role, hostCode, roomId) => {
          await cowork.joinSession(sessionId, role, hostCode, roomId);
          cowork.refetch();
        }}
      />
    );
  }

  // Host view
  if (cowork.isHost) {
    return <CoworkHostDashboard cowork={cowork} userId={userId!} />;
  }

  // Participant view
  return <CoworkParticipantView cowork={cowork} userId={userId!} />;
}

// Shown briefly while we redirect participants out of an ended Cowork session
// back to the main Maven dashboard.
function CoworkSessionEndedRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    toast.info("La sesión fue finalizada por el coordinador");
    const t = setTimeout(() => navigate("/dashboard", { replace: true }), 50);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center h-screen gap-5 p-4 md:p-6">
      <div className="flex flex-col items-center gap-3 bg-muted/50 rounded-3xl px-6 md:px-10 py-8 md:py-10 max-w-sm w-full">
        <div className="flex items-center justify-center h-14 w-14 rounded-full bg-muted">
          <Users2 className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Esta sesión ha finalizado</h2>
        <Button
          variant="secondary"
          className="rounded-full px-6 mt-1"
          onClick={() => navigate("/dashboard", { replace: true })}
        >
          Volver al dashboard
        </Button>
      </div>
    </div>
  );
}
