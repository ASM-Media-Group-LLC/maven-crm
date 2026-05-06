import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  FileAudio,
  FileText,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useUserProfile";
import { useQaCalls, useFireQaWebhook, scoreColor } from "@/hooks/useAgencyQa";

// AgencyQaHistory — feed de las QAs que YO subí, con su estado de
// procesamiento. Click en una row → full-page detail (via onOpenDetail).

const computeStatus = (call: {
  audio_path: string | null;
  transcript: string;
  claude_score: number;
  claude_analysis: { summary?: string };
}): "ready" | "no-analysis" | "broken" => {
  if (!call.transcript) return "broken";
  const hasAnalysis =
    call.claude_score > 0 || (call.claude_analysis?.summary?.length ?? 0) > 0;
  if (hasAnalysis) return "ready";
  return "no-analysis";
};

const StatusBadge = ({
  status,
}: {
  status: ReturnType<typeof computeStatus>;
}) => {
  if (status === "ready") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-emerald-500/40 text-emerald-500"
      >
        <CheckCircle2 className="h-3 w-3" />
        Listo
      </Badge>
    );
  }
  if (status === "no-analysis") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-500/40 text-amber-500"
      >
        <Clock className="h-3 w-3" />
        Sin análisis
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 border-rose-500/40 text-rose-400"
    >
      <AlertCircle className="h-3 w-3" />
      Sin transcript
    </Badge>
  );
};

interface AgencyQaHistoryProps {
  onOpenDetail?: (callId: string) => void;
}

const AgencyQaHistory = ({ onOpenDetail }: AgencyQaHistoryProps) => {
  const { user } = useAuth();
  const profileQ = useMyProfile();
  const callsQ = useQaCalls();
  const fireWebhook = useFireQaWebhook();

  const myName = useMemo(() => {
    return (
      profileQ.data?.full_name?.trim() ||
      user?.user_metadata?.full_name?.trim() ||
      user?.email ||
      ""
    );
  }, [profileQ.data, user]);

  const myCalls = useMemo(() => {
    if (!callsQ.data || !myName) return [];
    return callsQ.data
      .filter(
        (c) =>
          c.evaluator_name?.toLowerCase().trim() ===
          myName.toLowerCase().trim()
      )
      .slice(0, 30);
  }, [callsQ.data, myName]);

  const handleResendEmail = async (
    e: React.MouseEvent,
    callId: string
  ) => {
    e.stopPropagation();
    try {
      await fireWebhook.mutateAsync({ callId });
      toast.success("Email reenviado");
    } catch (err) {
      toast.error("No se pudo reenviar el email", {
        description: (err as Error).message,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Mis QAs recientes</h2>
        <p className="text-xs text-muted-foreground">
          Las llamadas que vos subiste — con estado de transcripción y análisis
          IA. Click en una row para ver el detalle completo.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {callsQ.isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : myCalls.length === 0 ? (
            <div className="space-y-2 p-6 text-center text-sm">
              <p className="text-muted-foreground">
                Todavía no subiste ninguna QA.
              </p>
              <p className="text-xs text-muted-foreground">
                Andá al tab Nueva QA, subí el audio de una llamada y al volver
                acá vas a ver el estado del análisis.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {myCalls.map((call) => {
                const status = computeStatus(call);
                return (
                  <div
                    key={call.id}
                    className="flex w-full items-center gap-3 p-3 transition-colors hover:bg-muted/40"
                  >
                    {/* Clickable main content */}
                    <button
                      type="button"
                      onClick={() => onOpenDetail?.(call.id)}
                      className="flex flex-1 items-center gap-3 text-left"
                    >
                      <div className="flex shrink-0 flex-col items-center gap-0.5">
                        <span
                          className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{
                            background: scoreColor(call.claude_score),
                          }}
                        >
                          {call.claude_score || "—"}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <span className="truncate">
                            {call.model?.name ?? "(sin modelo)"}
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {call.closer?.name ?? "(sin closer)"}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{call.call_date}</span>
                          {call.audio_path && (
                            <span className="flex items-center gap-0.5">
                              <FileAudio className="h-3 w-3" />
                              audio
                            </span>
                          )}
                          {call.transcript && (
                            <span className="flex items-center gap-0.5">
                              <FileText className="h-3 w-3" />
                              transcript
                            </span>
                          )}
                          {status === "ready" && (
                            <span className="flex items-center gap-0.5 text-emerald-500">
                              <Sparkles className="h-3 w-3" />
                              análisis IA
                            </span>
                          )}
                        </div>
                      </div>
                      <StatusBadge status={status} />
                    </button>

                    {/* Resend email button */}
                    <button
                      type="button"
                      onClick={(e) => handleResendEmail(e, call.id)}
                      disabled={fireWebhook.isPending}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                      title="Reenviar email"
                    >
                      <Mail className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AgencyQaHistory;
