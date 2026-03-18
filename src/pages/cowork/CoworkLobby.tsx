import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <Users2 className="h-12 w-12 mx-auto text-primary/60 mb-2" />
          <CardTitle>{session?.name || "Sesión Cowork"}</CardTitle>
          {session?.description && (
            <p className="text-sm text-muted-foreground">{session.description}</p>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            onClick={handleJoin}
            size="lg"
            className="w-full gap-2"
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users2 className="h-4 w-4" />}
            Unirse como participante
          </Button>

          {error && (
            <p className="text-xs text-destructive text-center">{error}</p>
          )}

          <p className="text-xs text-muted-foreground text-center mt-2">
            ID: {sessionId}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
