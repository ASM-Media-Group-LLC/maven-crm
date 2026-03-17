import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Users2, Crown, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";

interface Props {
  sessionId: string;
  session: any;
  roomId?: string | null;
  onJoin: (role: string, hostCode?: string, roomId?: string) => Promise<void>;
}

export default function CoworkLobby({ sessionId, session, roomId, onJoin }: Props) {
  const [searchParams] = useSearchParams();
  const suggestedRole = searchParams.get("role");
  const codeFromUrl = searchParams.get("code") || "";
  const isHostLink = suggestedRole === "host";

  const [hostCode, setHostCode] = useState(codeFromUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleJoin = async (role: string) => {
    setLoading(true);
    setError("");
    try {
      await onJoin(role, role === "host" ? hostCode : undefined, role !== "host" ? (roomId || undefined) : undefined);
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
          {isHostLink ? (
            <>
              <div className="space-y-2">
                <Input
                  placeholder="Código de host"
                  value={hostCode}
                  onChange={(e) => setHostCode(e.target.value)}
                  className="text-center tracking-widest"
                />
                <Button
                  onClick={() => handleJoin("host")}
                  size="lg"
                  className="w-full gap-2"
                  disabled={loading || !hostCode.trim()}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
                  Unirse como host
                </Button>
              </div>
              <Button
                onClick={() => handleJoin("participant")}
                size="lg"
                variant="outline"
                className="w-full gap-2"
                disabled={loading}
              >
                <Users2 className="h-4 w-4" /> Unirse como participante
              </Button>
            </>
          ) : (
            <Button
              onClick={() => handleJoin("participant")}
              size="lg"
              className="w-full gap-2"
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users2 className="h-4 w-4" />}
              Unirse como participante
            </Button>
          )}

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
