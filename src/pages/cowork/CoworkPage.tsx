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
    if (!sessionId || cowork.loading || cowork.myMembership || autoJoining || autoJoinFailed) return;

    const role = searchParams.get("role");
    const code = searchParams.get("code");
    const roomId = searchParams.get("room");

    const canAutoJoin = (role === "host" && code) || roomId;
    if (!canAutoJoin) return;

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
  }, [sessionId, cowork.loading, cowork.myMembership, autoJoining, autoJoinFailed, searchParams]);

  // No session selected → lobby
  if (!sessionId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6 p-6">
        <div className="text-center space-y-2">
          <Users2 className="h-16 w-16 mx-auto text-primary/60" />
          <h1 className="text-3xl font-bold text-foreground">Sala Cowork</h1>
          <p className="text-muted-foreground max-w-md">
            Crea una sesión cowork con múltiples salas.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={() => setShowCreate(true)} size="lg" className="gap-2">
            <Plus className="h-4 w-4" /> Crear sesión
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
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Not a member yet → lobby fallback (only shown when auto-join not possible or failed)
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
