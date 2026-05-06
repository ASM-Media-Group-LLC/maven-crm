// Detalle read-only de una sesión cerrada del Chatter Evaluator.
//
// Esta es la landing del botón "Ver transcript" del email de notificación:
// el receptor del correo (cliente / supervisor / auditor) llega aquí
// directamente y ve el chat completo + el verdict + criterios sin tener
// que pasar por la lista. Workspace es para sesiones VIVAS; History es
// el repositorio post-evaluación, y este es el read-only viewer.
//
// La ruta es /chatter-evaluator/history/:sessionId. Si la sesión no
// existe o el usuario no tiene permiso, mostramos un estado vacío con
// link de vuelta al listado.

import { Link, useParams } from "react-router-dom";
import { useMemo } from "react";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  useChatterSession,
  useChatterMessages,
  useChatterSessionEvaluation,
  useChatterProfiles,
  useChatterConfig,
} from "@/hooks/useChatterEvaluator";

const fmtDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const statusLabel = (s: "pass" | "partial" | "fail"): string =>
  s === "pass" ? "Cumple" : s === "partial" ? "Parcial" : "No cumple";

const statusColors = (s: "pass" | "partial" | "fail") =>
  s === "pass"
    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : s === "partial"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "bg-rose-500/10 text-rose-600 dark:text-rose-400";

const HistorySessionDetail = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const sessionQ = useChatterSession(sessionId);
  const messagesQ = useChatterMessages(sessionId);
  const evalQ = useChatterSessionEvaluation(sessionId);
  const profilesQ = useChatterProfiles();
  const configQ = useChatterConfig();

  const profile = useMemo(() => {
    if (!sessionQ.data) return null;
    return (
      (profilesQ.data ?? []).find((p) => p.id === sessionQ.data?.profile_id) ??
      null
    );
  }, [sessionQ.data, profilesQ.data]);

  const fanName = configQ.data?.fan_name ?? "Fan";
  const session = sessionQ.data;
  const evaluation = evalQ.data;
  const messages = messagesQ.data ?? [];

  const isLoading = sessionQ.isLoading || evalQ.isLoading || messagesQ.isLoading;

  // Sesión inexistente — link 404 amistoso.
  if (!isLoading && !session) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="space-y-3 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Esta sesión no existe o fue eliminada.
            </p>
            <Button asChild variant="outline">
              <Link to="/chatter-evaluator/history">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver al historial
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex items-center justify-between">
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link to="/chatter-evaluator/history">
              <ArrowLeft className="h-4 w-4" />
              Historial
            </Link>
          </Button>
          {session?.created_at && (
            <span className="text-xs text-muted-foreground">
              Sesión del {fmtDate(session.created_at)}
            </span>
          )}
        </div>

        {/* Header — chatter + perfil que interpretaba */}
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="aspect-square h-14 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.name}
                  className="h-full w-full object-cover"
                  style={{
                    objectPosition: `${profile.avatar_x ?? 50}% ${profile.avatar_y ?? 50}%`,
                    transform: `scale(${(profile.avatar_zoom ?? 100) / 100})`,
                  }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg">
                  {(profile?.name ?? session?.chatter_name ?? "?")[0]}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold">
                {session?.chatter_name ?? "(sin chatter)"}
              </h1>
              <p className="text-sm text-muted-foreground">
                Interpretó a <strong>{profile?.name ?? "(perfil eliminado)"}</strong>
                {profile?.category ? ` · ${profile.category}` : ""}
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">
              cerrada
            </Badge>
          </CardContent>
        </Card>

        {/* Verdict + score + examiner */}
        {evaluation && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {evaluation.verdict === "apto" ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  ) : (
                    <XCircle className="h-6 w-6 text-rose-500" />
                  )}
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Verdict
                    </div>
                    <div
                      className={`text-xl font-bold ${
                        evaluation.verdict === "apto"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {evaluation.verdict === "apto" ? "APTO" : "NO APTO"}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Puntuación
                  </div>
                  <div className="text-xl font-bold">
                    {evaluation.score_pct ?? 0}%
                  </div>
                </div>
              </div>

              {evaluation.examiner_name && (
                <div className="text-xs text-muted-foreground">
                  Evaluado por <strong>{evaluation.examiner_name}</strong>
                </div>
              )}

              {evaluation.criteria_results.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Criterios
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {evaluation.criteria_results.map((c) => (
                      <div
                        key={c.criterion_id}
                        className="flex items-center justify-between rounded-md border border-border/50 p-2 text-sm"
                      >
                        <span className="truncate">{c.label}</span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColors(c.status)}`}
                        >
                          {statusLabel(c.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {evaluation.feedback && (
                <div className="border-t pt-3">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Feedback
                  </div>
                  <p className="whitespace-pre-wrap rounded-md border-l-2 border-primary bg-muted/40 p-3 text-sm">
                    {evaluation.feedback}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Transcript */}
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">
                Transcripción ({messages.length} mensaje{messages.length === 1 ? "" : "s"})
              </h2>
            </div>

            {messagesQ.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando transcripción…
              </div>
            ) : messages.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sin mensajes en esta sesión.
              </p>
            ) : (
              <div className="space-y-2">
                {messages.map((m) => {
                  const isFan = m.role === "fan";
                  const isSystem = m.role === "system";
                  if (isSystem) {
                    return (
                      <div
                        key={m.id}
                        className="text-center text-xs italic text-muted-foreground"
                      >
                        {m.content}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={m.id}
                      className={`flex ${isFan ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                          isFan
                            ? "bg-muted text-foreground"
                            : "bg-primary text-primary-foreground"
                        }`}
                      >
                        <div className="mb-0.5 text-[10px] font-semibold opacity-75">
                          {isFan ? fanName : session?.chatter_name ?? "Chatter"}
                        </div>
                        {m.msg_type === "tip" && m.price ? (
                          <div className="font-medium">
                            💰 Tip: ${m.price.toFixed(2)}
                            {m.content ? ` — ${m.content}` : ""}
                          </div>
                        ) : m.msg_type === "purchase" && m.price ? (
                          <div className="font-medium">
                            🛒 Compra: ${m.price.toFixed(2)}
                            {m.content ? ` — ${m.content}` : ""}
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap">{m.content}</div>
                        )}
                        <div className="mt-1 text-right text-[9px] opacity-60">
                          {new Date(m.created_at).toLocaleTimeString("es-ES", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default HistorySessionDetail;
