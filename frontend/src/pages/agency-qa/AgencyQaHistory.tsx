import { useMemo, useState } from "react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  Mail,
  Trash2,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useUserProfile";
import { usePermissions } from "@/hooks/usePermissions";
import { useUserRole } from "@/hooks/useUserRole";
import {
  useQaCalls,
  useFireQaWebhook,
  useDeleteQaCall,
  useReprocessQaCall,
  scoreColor,
} from "@/hooks/useAgencyQa";

// AgencyQaHistory — feed de las QAs en formato tabla con columnas
// (Score · Fecha · Modelo · Cerrador · Estado · Acciones).
// Click en una row → full-page detail.
//
// Visibilidad:
//   - Admins ven TODAS las QAs (vista de gestión).
//   - Otros roles solo ven las suyas: matcheamos por uploaded_by (FK a
//     auth.users) y caemos a evaluator_name == nombre del perfil cuando
//     uploaded_by es NULL (rows legacy que existieron antes de la
//     migración 20260505200000).

const computeStatus = (call: {
  audio_path: string | null;
  transcript: string | null;
  claude_score: number;
  claude_analysis: { summary?: string };
  status?: string | null;
}): "ready" | "no-analysis" | "broken" | "processing" | "failed" => {
  // El status real del pipeline manda (subida nueva = 'processing' hasta que termina).
  if (call.status === "processing") return "processing";
  if (call.status === "failed") return "failed";
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
        className="gap-1 border-success/40 text-success"
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
        className="gap-1 border-warning/40 text-warning"
      >
        <Clock className="h-3 w-3" />
        Sin análisis
      </Badge>
    );
  }
  if (status === "processing") {
    return (
      <Badge variant="outline" className="gap-1 border-sky-500/40 text-sky-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        Procesando…
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
        <AlertTriangle className="h-3 w-3" />
        Falló
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
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

// Avatar de la modelo — mismo patrón que la tabla original de Calls
// (gradiente HSL determinístico desde el nombre + foto si existe).
const ModelAvatar = ({
  name,
  dataUrl,
  size = 32,
}: {
  name: string;
  dataUrl: string | null;
  size?: number;
}) => {
  const initial = (name?.trim().charAt(0) || "?").toUpperCase();
  let h = 0;
  for (let i = 0; i < name.length; i++)
    h = (h * 31 + name.charCodeAt(i)) % 360;
  const bg = `linear-gradient(135deg, hsl(${h}, 40%, 30%) 0%, hsl(${(h + 60) % 360}, 50%, 20%) 100%)`;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-white/90"
      style={{ width: size, height: size, background: bg }}
    >
      {dataUrl ? (
        <img src={dataUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </span>
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
  const deleteCall = useDeleteQaCall();
  const reprocess = useReprocessQaCall();

  // Reintenta transcribir+analizar una QA que quedó 'processing'/'failed'
  // (ej. un blip transitorio de ElevenLabs). La fila ya existe → no se pierde nada.
  const handleRetry = (e: React.MouseEvent, callId: string) => {
    e.stopPropagation();
    if (reprocess.isPending) return;
    toast.loading("Reprocesando…", { id: `retry-${callId}` });
    reprocess
      .mutateAsync(callId)
      .then((r) => toast.success(`Listo · score ${r.score}/100`, { id: `retry-${callId}` }))
      .catch((err) =>
        toast.error("Falló de nuevo", { id: `retry-${callId}`, description: (err as Error).message }),
      );
  };
  const { canAccess } = usePermissions();
  const { isAdmin } = useUserRole();
  const canDelete = canAccess("Agency QA", "Borrar Calls");

  // Modal de confirmación de borrado — guarda la QA target para el flow
  // <abrir confirmación> → <click confirmar> → <DELETE> sin confiar en
  // window.confirm.
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    label: string;
  } | null>(null);

  // Mismo flow para "Reenviar email": el correo automático ya se mandó al
  // terminar el análisis, entonces cualquier reenvío manual es duplicado.
  // El popup evita los clicks accidentales / repetidos de múltiples users
  // sobre la misma QA (caso real: 2026-05-15 sergiocarvajal7).
  const [pendingResend, setPendingResend] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const myUserId = user?.id ?? null;
  const myName = useMemo(() => {
    return (
      profileQ.data?.full_name?.trim() ||
      user?.user_metadata?.full_name?.trim() ||
      user?.email ||
      ""
    );
  }, [profileQ.data, user]);

  const visibleCalls = useMemo(() => {
    if (!callsQ.data) return [];
    // Admins ven todo el equipo en orden cronológico inverso (la lista
    // ya viene ordenada del query). El cap de 30 evita que la tabla
    // crezca infinito; si hace falta paginar lo agregamos cuando duela.
    if (isAdmin) {
      return callsQ.data.slice(0, 30);
    }
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
  }, [callsQ.data, isAdmin, myUserId, myName]);

  const askResend = (e: React.MouseEvent, callId: string, label: string) => {
    e.stopPropagation();
    setPendingResend({ id: callId, label });
  };

  const confirmResend = async () => {
    if (!pendingResend) return;
    const target = pendingResend;
    try {
      await fireWebhook.mutateAsync({ callId: target.id });
      toast.success("Email reenviado");
      setPendingResend(null);
    } catch (err) {
      toast.error("No se pudo reenviar el email", {
        description: (err as Error).message,
      });
    }
  };

  const askDelete = (
    e: React.MouseEvent,
    callId: string,
    label: string
  ) => {
    e.stopPropagation();
    setPendingDelete({ id: callId, label });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteCall.mutateAsync(pendingDelete.id);
      toast.success("QA borrada");
      setPendingDelete(null);
    } catch (err) {
      toast.error("No se pudo borrar la QA", {
        description: (err as Error).message,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">
          {isAdmin ? "Historial de QAs" : "Mis QAs recientes"}
        </h2>
        <p className="text-xs text-muted-foreground">
          {isAdmin
            ? "Listado completo de todas las QAs del equipo. Click en una fila para ver el detalle."
            : "Las llamadas que vos subiste. Click en una fila para ver el detalle completo."}
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {callsQ.isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : visibleCalls.length === 0 ? (
            <div className="space-y-2 p-6 text-center text-sm">
              <p className="text-muted-foreground">
                {isAdmin
                  ? "Todavía no hay QAs cargadas."
                  : "Todavía no subiste ninguna QA."}
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
                {visibleCalls.map((call) => {
                  const status = computeStatus(call);
                  const label =
                    `${call.model?.name ?? "(sin modelo)"} · ${
                      call.closer?.name ?? "(sin closer)"
                    }`;
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
                      {/* Modelo (avatar + nombre) */}
                      <TableCell>
                        {call.model ? (
                          <div className="flex items-center gap-2.5">
                            <ModelAvatar
                              name={call.model.name}
                              dataUrl={call.model.avatar_data_url}
                              size={32}
                            />
                            <span className="text-sm font-medium">
                              {call.model.name}
                            </span>
                            {/* Ventas (≠ reclutamiento): a creadora propia vs modelo externa */}
                            {call.call_type === "venta_servicio" && (
                              <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary whitespace-nowrap">
                                Venta: {call.service_sold || "servicio"}
                              </span>
                            )}
                            {call.call_type === "venta_externa" && (
                              <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning whitespace-nowrap">
                                Externa: {call.service_sold || "plataforma"}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">
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
                              className="hidden items-center gap-0.5 text-[11px] text-success lg:flex"
                              title="Análisis IA generado"
                            >
                              <Sparkles className="h-3 w-3" />
                              IA
                            </span>
                          )}
                        </div>
                      </TableCell>
                      {/* Acciones — Reenviar + Borrar */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(status === "failed" || status === "processing") && (
                            <button
                              type="button"
                              onClick={(e) => handleRetry(e, call.id)}
                              disabled={reprocess.isPending}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sky-500/10 hover:text-sky-400 disabled:opacity-50"
                              title="Reintentar transcripción + análisis"
                            >
                              <RotateCw className={reprocess.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => askResend(e, call.id, label)}
                            disabled={fireWebhook.isPending}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                            title="Reenviar email"
                          >
                            <Mail className="h-4 w-4" />
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={(e) => askDelete(e, call.id, label)}
                              disabled={deleteCall.isPending}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
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

      {/* Confirm delete dialog — estilo Maven (shadcn AlertDialog) */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Borrar QA
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que querés borrar la QA de{" "}
              <strong>{pendingDelete?.label}</strong>?
              <br />
              Se eliminan también sus feedbacks y comentarios. Esta acción no
              se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCall.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteCall.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCall.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Borrando…
                </>
              ) : (
                "Borrar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm resend dialog — estilo Maven. El correo automático ya
          salió al terminar el análisis, así que cada reenvío manual genera
          un duplicado para los recipients. Le pedimos confirmación para
          evitar clicks repetidos. */}
      <AlertDialog
        open={!!pendingResend}
        onOpenChange={(open) => !open && setPendingResend(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Reenviar email del QA
            </AlertDialogTitle>
            <AlertDialogDescription>
              Vas a reenviar el reporte de <strong>{pendingResend?.label}</strong>{" "}
              a todos los destinatarios configurados.
              <br />
              El correo automático ya se mandó al terminar el análisis. Solo
              reenvíalo si necesitás una segunda copia.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={fireWebhook.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmResend}
              disabled={fireWebhook.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {fireWebhook.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Reenviando…
                </>
              ) : (
                "Reenviar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AgencyQaHistory;
