import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users2, Crown } from "lucide-react";
import { useSearchParams } from "react-router-dom";

interface Props {
  sessionId: string;
  session: any;
  onJoin: (role: string) => Promise<void>;
}

export default function CoworkLobby({ sessionId, session, onJoin }: Props) {
  const [searchParams] = useSearchParams();
  const suggestedRole = searchParams.get("role"); // "host" hint from shared link

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
          {suggestedRole === "host" ? (
            <>
              <Button onClick={() => onJoin("host")} size="lg" className="w-full gap-2">
                <Crown className="h-4 w-4" /> Unirse como host
              </Button>
              <Button onClick={() => onJoin("participant")} size="lg" variant="outline" className="w-full gap-2">
                <Users2 className="h-4 w-4" /> Unirse como participante
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => onJoin("participant")} size="lg" className="w-full gap-2">
                <Users2 className="h-4 w-4" /> Unirse como participante
              </Button>
              <Button onClick={() => onJoin("host")} size="lg" variant="outline" className="w-full gap-2">
                <Crown className="h-4 w-4" /> Unirse como host
              </Button>
            </>
          )}
          <p className="text-xs text-muted-foreground text-center mt-2">
            ID: {sessionId}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
