import { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  Mail,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useUserProfile";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useQaCalls,
  useFireQaWebhook,
  useDeleteQaCall,
  scoreColor,
} from "@/hooks/useAgencyQa";

// AgencyQaHistory — feed de las QAs que YO subí, en formato tabla
// con columnas (Score · Fecha · Modelo · Cerrador · Estado · Acciones).
// Click en una row → full-page detail.

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
    <Badge variant="outline" className="gap-1 border-rose-500/40 text-rose-400">
      <AlertCircle className="h-3 w-3" />
      Sin transcript
    </Badge>
  );
};

const fmtDate = (iso: string) => {
  try {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

interface AgencyQaHistoryProps {
  onOpenDetail?: (callId: string) => void;
}

const AgencyQaHistory = ({ onOpenDetail }: AgencyQaHistoryProps) => {
  const { user } = useAuth();
  const profileQ = useMyProfile();
  const callsQ = useQaCalls();
  const fireWebhook = useFireQaWebhook();
  const deleteCall = useDeleteQaCall();
  // El borrado vive acá ahora. Permiso configurable desde
  // Settings → Usuarios → Roles → Agency QA → "Borrar Calls". Admins lo
  // tienen always-true. La RLS del DB también filtra el DELETE.
  const { canAccess } = usePermissions();
  const canDelete = canAccess("Agency QA", "Borrar Calls");

  const myUserId = user?.id ?? null;
  const myName = useMemo(() => {
    return (
      profileQ.data?.full_name?.trim() ||
      user?.user_metadata?.full_name?.trim() ||
      user?.email ||
      ""
    );
  }, [profileQ.data, user]);

  // Filtramos "mis QAs": preferimos uploaded_by (FK a auth.users) y
  // caemos a evaluator_name match para rows legacy donde uploaded_by
  // todavía es NULL.
  const myCalls = useMemo(() => {
    if (!callsQ.data) return [];
    const myNameLc = myName.toLowerCase().trim();
    return callsQ.data
      .filter((c) => {
        if (c.uploaded_by) {
          return myUserId ? c.uploaded_by === myUserId : false;
        }
        if (!myNameLc) return false;
        return c.evaluator_name?.toLowerCase().trim() === myNameLc;
      })
      .slice(0, 30);
  }, [callsQ.data, myUserId, myName]);

  const handleResendEmail = async (e: React.MouseEvent, callId: string) => {
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

  const handleDelete = async (e: React.MouseEvent, callId: string) => {
    e.stopPropagation();
    if (
      !window.confirm(
        "¿Borrar esta QA permanentemente? No se puede deshacer."
      )
    ) {
      return;
    }
    try {
      await deleteCall.mutateAsync(callId);
      toast.success("QA borrada");
    } catch (err) {
      toast.error("No se pudo borrar la QA", {
        description: (err as Error).message,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Mis QAs recientes</h2>
        <p className="text-xs text-muted-foreground">
          Las llamadas que vos subiste. Click en una fila para ver el detalle
          completo.
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
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-[80px] text-[10px] font-bold uppercase tracking-widest">
                    Score
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest">
                    Fecha
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest">
                    Modelo
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest">
                    Cerrador
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest">
                    Estado
                  </TableHead>
                  <TableHead className="w-[120px] text-right text-[10px] font-bold uppercase tracking-widest">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myCalls.map((call) => {
                  const status = computeStatus(call);
                  return (
                    <TableRow
                      key={call.id}
                      className="cursor-pointer transition-colors hover:bg-muted/30"
                      onClick={() => onOpenDetail?.(call.id)}
                    >
                      {/* Score */}
                      <TableCell>
                        <span
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ background: scoreColor(call.claude_score) }}
                        >
                          {call.claude_score || "—"}
                        </span>
                      </TableCell>
                      {/* Fecha */}
                      <TableCell className="tabular-nums text-sm">
                        {fmtDate(call.call_date)}
                      </TableCell>
                      {/* Modelo */}
                      <TableCell className="text-sm font-medium">
                        {call.model?.name ?? (
                          <span className="text-muted-foreground">
                            (sin modelo)
                          </span>
                        )}
                      </TableCell>
                      {/* Cerrador */}
                      <TableCell className="text-sm">
                        {call.closer?.name ?? (
                          <span className="text-muted-foreground">
                            (sin closer)
                          </span>
                        )}
                      </TableCell>
                      {/* Estado */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={status} />
                          {status === "ready" && (
                            <span
                              className="hidden items-center gap-0.5 text-[11px] text-emerald-500 lg:flex"
                              title="Análisis IA generado"
                            >
                              <Sparkles className="h-3 w-3" />
                              IA
                            </span>
                          )}
                        </div>
                      </TableCell>
                      {/* Acciones — Reenviar + Borrar (admin) */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={(e) => handleResendEmail(e, call.id)}
                            disabled={fireWebhook.isPending}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                            title="Reenviar email"
                          >
                            <Mail className="h-4 w-4" />
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={(e) => handleDelete(e, call.id)}
                              disabled={deleteCall.isPending}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
                              title="Borrar QA"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AgencyQaHistory;
