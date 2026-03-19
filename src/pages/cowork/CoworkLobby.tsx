import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Users2, Loader2 } from "lucide-react";

interface Props {
  sessionId: string;
  session: any;
  onJoin: (role: string, hostCode?: string, roomId?: string) => Promise<void>;
}

export default function CoworkLobby({ sessionId, session, onJoin }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleJoin = async () => {
    setLoading(true);
    setError("");
    try {
      await onJoin("participant");
    } catch (e: any) {
      setError(e.message || "Error al unirse");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh] p-6">
      <div className="max-w-md w-full bg-card rounded-3xl border border-border/50 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 px-8 pt-10 pb-6">
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-primary/10">
            <Users2 className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground text-center">
            {session?.name || "Sesión Cowork"}
          </h2>
          {session?.description && (
            <p className="text-sm text-muted-foreground text-center">{session.description}</p>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-col gap-3 px-8 pb-8">
          <Button
            onClick={handleJoin}
            size="lg"
            className="w-full gap-2 rounded-full"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Users2 className="h-4 w-4" />
            )}
            Unirse como participante
          </Button>

          {error && (
            <p className="text-xs text-destructive text-center">{error}</p>
          )}

          <p className="text-xs text-muted-foreground text-center mt-2">
            ID: {sessionId}
          </p>
        </div>
      </div>
    </div>
  );
}
