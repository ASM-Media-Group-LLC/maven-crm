import { useEffect, useRef, useState } from "react";
import { UsersRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/hooks/useLanguage";
import { usePermissions } from "@/hooks/usePermissions";
import { leerPanelAccesos, resolverAcceso, type PanelAccesos } from "@/lib/coworkAccesos";

export default function CoworkAccesosDialog({ sessionId }: { sessionId?: string }) {
  const { canFunction } = usePermissions();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PanelAccesos | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [sesion, setSesion] = useState(sessionId ?? "");
  const [persona, setPersona] = useState("");
  const [sala, setSala] = useState("");
  const [solicitud, setSolicitud] = useState(false);
  const version = useRef(0);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const load = async () => {
      const v = ++version.current;
      setLoading(true);
      try {
        const next = await leerPanelAccesos(sessionId);
        if (alive && version.current === v) { setData(next); setError(""); }
      } catch (e) { if (alive && version.current === v) setError((e as Error).message); }
      finally { if (alive && version.current === v) setLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [open, sessionId, revision]);
  if (!canFunction("N:cowork.miembros", false)) return null;
  const rooms = data?.sesiones.find(s => s.id === sesion)?.salas ?? [];
  const visible = data?.personas.filter(p => p.nombre?.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? [];
  const submit = async (aprobar: boolean) => {
    setBusy(true); setError(""); setSuccess("");
    try {
      await resolverAcceso(sesion, persona, aprobar ? sala : null, aprobar);
      setSuccess(t(aprobar ? "cowork.access.approved" : "cowork.access.rejected"));
      setPersona(""); setSala(""); setSolicitud(false); setRevision(r => r + 1);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const selectClass = "w-full rounded-xl border border-input bg-background p-2.5 text-sm text-foreground";
  return <Dialog open={open} onOpenChange={v => { if (!busy) setOpen(v); }}>
    <DialogTrigger asChild><Button variant="outline" className="gap-2 rounded-full"><UsersRound className="h-4 w-4" />{t("cowork.access.title")}</Button></DialogTrigger>
    <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>{t("cowork.access.title")}</DialogTitle><DialogDescription>{t("cowork.access.description")}</DialogDescription></DialogHeader>
      {error && <div role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm"><p>{error}</p><Button variant="outline" size="sm" onClick={() => setRevision(r => r + 1)} disabled={loading}>{t("cowork.access.refresh")}</Button></div>}
      {success && <p role="status" className="text-sm text-foreground">{success}</p>}
      {loading && !data ? <Loader2 className="animate-spin" aria-label={t("cowork.access.loading")} /> : data && <>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t("cowork.access.pending", { n: data.solicitudes.length })}</h3>
          {data.solicitudes.length === 0 ? <p className="text-sm text-muted-foreground">{t("cowork.access.none")}</p> : data.solicitudes.map(q => <button key={`${q.sessionId}:${q.userId}`} disabled={busy} type="button" onClick={() => {
            setSesion(q.sessionId); setPersona(q.userId); setSala(q.roomId ?? ""); setSolicitud(true); setSearch(""); setSuccess("");
          }} className="flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
            <span><strong className="block text-sm">{q.nombre}</strong><span className="text-xs text-muted-foreground">{q.sessionName}</span></span><span className="text-sm">{t("cowork.access.review")}</span>
          </button>)}
        </section>
        <fieldset disabled={busy || loading || !!error} className="space-y-3 border-t pt-4">
          <legend className="sr-only">{t("cowork.access.assign")}</legend>
          <label className="block text-sm">{t("cowork.access.session")}<select className={selectClass} value={sesion} onChange={e => { setSesion(e.target.value); setSala(""); setSolicitud(false); }}><option value="">{t("cowork.access.chooseSession")}</option>{data.sesiones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
          <label className="block text-sm">{t("cowork.access.search")}<Input value={search} onChange={e => setSearch(e.target.value)} /></label>
          <label className="block text-sm">{t("cowork.access.person")}<select className={selectClass} value={persona} onChange={e => { setPersona(e.target.value); setSolicitud(false); }}><option value="">{t("cowork.access.choosePerson")}</option>{data.personas.filter(p => visible.includes(p) || p.id === persona).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
          <label className="block text-sm">{t("cowork.access.room")}<select className={selectClass} value={sala} onChange={e => setSala(e.target.value)}><option value="">{t("cowork.access.chooseRoom")}</option>{rooms.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
          <p className="text-xs text-muted-foreground">{t("cowork.access.offline")}</p>
          <div className="flex flex-wrap gap-2"><Button disabled={!sesion || !persona || !rooms.some(r => r.id === sala)} onClick={() => void submit(true)}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t(solicitud ? "cowork.access.approve" : "cowork.access.add")}</Button>
          {solicitud && <Button variant="outline" onClick={() => void submit(false)}>{t("cowork.access.reject")}</Button>}</div>
        </fieldset>
      </>}
    </DialogContent>
  </Dialog>;
}
