import { useEffect, useState } from "react";
import { Clock3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { leerSolicitudPropia, type SolicitudPropia } from "@/lib/coworkAccesos";
export default function CoworkSolicitud({ sessionId, onEnter, onBack }: {
  sessionId: string; onEnter: (roomId: string) => Promise<void>; onBack: () => void;
}) {
  const { t } = useLanguage();
  const [data, setData] = useState<SolicitudPropia | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true, running = false;
    const load = async () => {
      if (running) return;
      running = true;
      try { const next = await leerSolicitudPropia(sessionId); if (alive) { setData(next); setError(""); setLoaded(true); } }
      catch (e) { if (alive) { setError((e as Error).message); setLoaded(true); } }
      finally { running = false; }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 10000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [sessionId, revision]);
  const enter = async () => {
    if (!data?.roomId) return;
    setBusy(true); setError("");
    try { await onEnter(data.roomId); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const key = data?.estado === "aprobada" ? "ready" : data?.estado === "rechazada" ? "denied" : loaded && !data ? "missing" : "waiting";
  return <div className="flex flex-1 items-center justify-center p-6"><section className="w-full max-w-md space-y-4 rounded-3xl border bg-card p-8 text-center text-card-foreground">
    <Clock3 className="mx-auto h-10 w-10 text-primary" />
    <h1 className="text-xl font-semibold">{t(`cowork.access.${key}`)}</h1>
    {data && <p className="text-sm font-medium">{data.sessionName}{data.roomName ? ` · ${data.roomName}` : ""}</p>}
    <p className="text-sm text-muted-foreground">{t(`cowork.access.${key}Description`)}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!loaded && !error && <Loader2 className="mx-auto animate-spin" />}
    {data?.estado === "aprobada" && data.roomId && <Button className="w-full" disabled={busy || !!error} onClick={() => void enter()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("cowork.access.enter")}</Button>}
    <div className="flex justify-center gap-2"><Button variant="outline" disabled={busy} onClick={() => setRevision(r => r + 1)}>{t("cowork.access.refresh")}</Button><Button variant="ghost" disabled={busy} onClick={onBack}>{t("cowork.access.back")}</Button></div>
  </section></div>;
}
