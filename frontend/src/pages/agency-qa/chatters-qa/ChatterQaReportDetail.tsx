import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Trash2, Sparkles, Save, Loader2, AlertTriangle, Pencil, X,
  ThumbsUp, Wrench, MessageSquareText, Lightbulb, Flag, FileText, Users, Quote, ExternalLink, ChevronDown, Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBluModels, bluModelLabel } from "../../sales-performance/useBluMp";
import { companyLabel, periodLabel } from "./useChatterScorecards";
import {
  VEREDICTOS, veredictoLabel, veredictoTone,
  useQaReport, useUpdateQaReport, useGenerateQaDraft, useSendChatterQaEmail,
  type ChatterQaReport, type QaReportBody, type EvaluatedModel,
} from "./useChatterQaReports";

type FanIndex = Record<string, { m: number; c: number; n?: string }>;
const toneBadge: Record<string, string> = {
  good: "border-success/40 bg-success/10 text-success",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  bad: "border-destructive/40 bg-destructive/10 text-destructive",
};

// @handle → link a la conversación real en Mensajes Pro (si lo tenemos en el índice).
function FanLink({ handle, fanIndex }: { handle: string; fanIndex: FanIndex }) {
  const hit = fanIndex[handle];
  if (!hit) return <span className="font-mono text-[0.95em] text-muted-foreground">{handle}</span>;
  return (
    <Link to={`/conversaciones?model=${hit.m}&chat=${hit.c}`}
      className="inline-flex items-center gap-1 text-[0.95em] font-medium text-primary hover:underline"
      title="Abrir la conversación en Mensajes Pro">
      {hit.n ? <>{hit.n} <span className="font-mono opacity-80">{handle}</span></> : <span className="font-mono">{handle}</span>}
      <ExternalLink className="h-3 w-3 opacity-70" />
    </Link>
  );
}
// Renderiza texto reemplazando los @handles por links a la conversación.
function Linkified({ text, fanIndex }: { text: string; fanIndex: FanIndex }) {
  const parts = String(text || "").split(/(@[A-Za-z0-9_.]+)/g);
  return <>{parts.map((p, i) => (/^@[A-Za-z0-9_.]+$/.test(p) ? <FanLink key={i} handle={p} fanIndex={fanIndex} /> : <Fragment key={i}>{p}</Fragment>))}</>;
}

// ── Editor de lista de strings (modo edición) ──
function StringList({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold">{label}</p>
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2">
          <Textarea value={it} placeholder={placeholder} rows={2}
            onChange={(e) => { const n = [...items]; n[i] = e.target.value; onChange(n); }}
            className="min-h-0 flex-1 text-sm" />
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="mt-2 text-muted-foreground/50 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onChange([...items, ""])}>
        <Plus className="h-3.5 w-3.5" /> Agregar
      </Button>
    </div>
  );
}

// ── Card de sección. En lectura puede ser colapsable (chevron); en edición siempre abierta. ──
function Section({ icon: Icon, title, accent, collapsible, defaultOpen = true, count, children }:
  { icon: any; title: string; accent?: string; collapsible?: boolean; defaultOpen?: boolean; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const head = (
    <>
      <span className={`flex h-6 w-6 items-center justify-center rounded-md ${accent ?? "bg-muted text-muted-foreground"}`}><Icon className="h-3.5 w-3.5" /></span>
      <h4 className="text-sm font-semibold tracking-tight">{title}</h4>
      {typeof count === "number" && <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{count}</span>}
      {collapsible && <ChevronDown className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />}
    </>
  );
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      {collapsible
        ? <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left">{head}</button>
        : <div className="mb-2.5 flex items-center gap-2">{head}</div>}
      {(!collapsible || open) && <div className={collapsible ? "mt-3" : ""}>{children}</div>}
    </div>
  );
}

export default function ChatterQaReportDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: row, isLoading } = useQaReport(id);
  const update = useUpdateQaReport();
  const draft = useGenerateQaDraft();
  const sendEmail = useSendChatterQaEmail();
  const { data: models = [] } = useBluModels();

  const [report, setReport] = useState<QaReportBody>({});
  const [veredicto, setVeredicto] = useState<string>("");
  const [evModels, setEvModels] = useState<EvaluatedModel[]>([]);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<boolean | null>(null);

  const hasContent = (r?: ChatterQaReport | null) => {
    const b = r?.report ?? {};
    return !!(r?.veredicto || b.intro || b.resumen || b.conclusion || b.hallazgo_principal ||
      b.aspectos_positivos?.length || b.aspectos_mejora?.length || b.observaciones_por_modelo?.length || b.recomendaciones?.length);
  };

  useEffect(() => {
    if (!row || dirty) return;
    setReport(row.report ?? {});
    setVeredicto(row.veredicto ?? "");
    setEvModels(row.evaluated_models ?? []);
    if (editing === null) setEditing(!hasContent(row)); // reporte vacío → arranca en edición
  }, [row, dirty, editing]);

  const fanIndex = useMemo<FanIndex>(() => ((row?.sampling as any)?.fan_index ?? {}) as FanIndex, [row]);

  if (isLoading || !row || editing === null) return <div className="p-6 text-sm text-muted-foreground">Cargando reporte…</div>;

  const patch = (p: Partial<QaReportBody>) => { setReport((r) => ({ ...r, ...p })); setDirty(true); };
  const mejoras = report.aspectos_mejora ?? [];
  const obs = report.observaciones_por_modelo ?? [];

  const save = () => {
    update.mutate(
      { id, patch: { report, veredicto: (veredicto || null) as ChatterQaReport["veredicto"], evaluated_models: evModels, source: row.source === "ai_draft" ? "ai_edited" : row.source } },
      { onSuccess: () => { setDirty(false); setEditing(false); toast.success("Reporte guardado"); }, onError: (e) => toast.error((e as Error).message) },
    );
  };
  const addModel = (mid: string) => {
    const m = models.find((x) => String(x.id) === mid);
    if (!m || evModels.some((e) => e.model_id === m.id)) return;
    setEvModels([...evModels, { model_id: m.id, model_name: bluModelLabel(m) }]); setDirty(true);
  };

  const sampling = row.sampling as any;
  const tone = veredictoTone(veredicto);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* ── Hero ── */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-card to-card/30 p-5">
        <div className="flex items-start justify-between gap-3">
          <button onClick={onBack} className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Volver</button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {row.status === "processing" && <Badge variant="outline" className="gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> generando…</Badge>}
            {row.status === "failed" && <Badge variant="outline" className="gap-1.5 border-destructive/40 text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> falló</Badge>}
            <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled={draft.isPending || evModels.length === 0}
              onClick={() => draft.mutate({ id }, { onError: (e) => toast.error((e as Error).message), onSuccess: () => toast.success("Borrador IA en curso…") })}>
              <Sparkles className="h-4 w-4" /> {row.source === "manual" && !hasContent(row) ? "Generar con IA" : "Regenerar IA"}
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled={sendEmail.isPending || row.status !== "ready" || !hasContent(row)}
              onClick={() => sendEmail.mutate(row, { onSuccess: () => toast.success("Email enviado"), onError: (e) => toast.error((e as Error).message) })}
              title={row.email_sent_at ? `Ya se envió ${new Date(row.email_sent_at).toLocaleString()}` : "Enviar el QA por email"}>
              {sendEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} {row.email_sent_at ? "Reenviar email" : "Enviar email"}
            </Button>
            {!editing
              ? <Button size="sm" className="h-8 gap-1.5" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Editar</Button>
              : <>
                  <Button size="sm" className="h-8 gap-1.5" disabled={!dirty || update.isPending} onClick={save}><Save className="h-4 w-4" /> Guardar</Button>
                  <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={() => { setEditing(false); setDirty(false); setReport(row.report ?? {}); setVeredicto(row.veredicto ?? ""); setEvModels(row.evaluated_models ?? []); }}><X className="h-4 w-4" /></Button>
                </>}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-2xl font-bold tracking-tight">{row.chatter_name}</h2>
          {veredicto && !editing && <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-sm font-semibold ${toneBadge[tone]}`}>{veredictoLabel(veredicto)}</span>}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {companyLabel(row.company)} ({row.company}) · {periodLabel(row.period)} · {row.evaluator_name}
          {sampling?.threads_sampled ? <> · <Sparkles className="inline h-3 w-3" /> {sampling.models} modelo(s) · {sampling.threads_sampled} hilos · {sampling.messages_read} mensajes</> : null}
        </p>
        {row.status === "failed" && row.error_message && <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{row.error_message}</p>}
      </div>

      {editing ? (
        /* ══════════ MODO EDICIÓN ══════════ */
        <div className="space-y-4">
          <Section icon={Flag} title="Resultado y modelos">
            <div className="flex flex-wrap items-center gap-3">
              <Select value={veredicto} onValueChange={(v) => { setVeredicto(v); setDirty(true); }}>
                <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Veredicto" /></SelectTrigger>
                <SelectContent>{VEREDICTOS.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex flex-wrap items-center gap-1.5">
                {evModels.map((m) => (
                  <Badge key={m.model_id} variant="secondary" className="gap-1">{m.model_name}
                    <button type="button" onClick={() => { setEvModels(evModels.filter((e) => e.model_id !== m.model_id)); setDirty(true); }}><Trash2 className="h-3 w-3" /></button>
                  </Badge>
                ))}
                <Select value="" onValueChange={addModel}>
                  <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="+ Agregar modelo" /></SelectTrigger>
                  <SelectContent className="max-h-72">{models.map((m) => <SelectItem key={m.id} value={String(m.id)}>{bluModelLabel(m)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </Section>
          <Section icon={FileText} title="Introducción / objetivo"><Textarea rows={2} value={report.intro ?? ""} onChange={(e) => patch({ intro: e.target.value })} placeholder="Objetivo de la evaluación…" /></Section>
          <Section icon={MessageSquareText} title="Resumen / diagnóstico"><Textarea rows={3} value={report.resumen ?? ""} onChange={(e) => patch({ resumen: e.target.value })} /></Section>
          <Section icon={ThumbsUp} title="Aspectos positivos" accent="bg-success/15 text-success"><StringList label="" items={report.aspectos_positivos ?? []} onChange={(v) => patch({ aspectos_positivos: v })} /></Section>
          <Section icon={Wrench} title="Aspectos de mejora" accent="bg-amber-500/15 text-amber-600">
            {mejoras.map((m, i) => (
              <div key={i} className="mb-2 flex items-start gap-2">
                <div className="flex-1 space-y-1.5">
                  <Input value={m.categoria} placeholder="Categoría (ej. Falta de calentamiento)" onChange={(e) => { const n = [...mejoras]; n[i] = { ...m, categoria: e.target.value }; patch({ aspectos_mejora: n }); }} />
                  <Textarea rows={2} value={m.detalle} placeholder="Detalle" onChange={(e) => { const n = [...mejoras]; n[i] = { ...m, detalle: e.target.value }; patch({ aspectos_mejora: n }); }} />
                </div>
                <button type="button" onClick={() => patch({ aspectos_mejora: mejoras.filter((_, j) => j !== i) })} className="mt-2 text-muted-foreground/50 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => patch({ aspectos_mejora: [...mejoras, { categoria: "", detalle: "" }] })}><Plus className="h-3.5 w-3.5" /> Agregar categoría</Button>
          </Section>
          <Section icon={Users} title="Observaciones por modelo">
            {obs.map((o, i) => (
              <div key={i} className="mb-2 rounded-md border border-border/60 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Input value={o.model_name ?? ""} placeholder="Modelo" className="h-8 w-56 font-medium" onChange={(e) => { const n = [...obs]; n[i] = { ...o, model_name: e.target.value }; patch({ observaciones_por_modelo: n }); }} />
                  <button type="button" onClick={() => patch({ observaciones_por_modelo: obs.filter((_, j) => j !== i) })} className="text-muted-foreground/50 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
                <StringList label="Observaciones" items={o.observaciones ?? []} onChange={(v) => { const n = [...obs]; n[i] = { ...o, observaciones: v }; patch({ observaciones_por_modelo: n }); }} />
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => patch({ observaciones_por_modelo: [...obs, { model_name: "", observaciones: [""] }] })}><Plus className="h-3.5 w-3.5" /> Agregar modelo</Button>
          </Section>
          <Section icon={Lightbulb} title="Recomendaciones" accent="bg-primary/15 text-primary"><StringList label="" items={report.recomendaciones ?? []} onChange={(v) => patch({ recomendaciones: v })} /></Section>
          <Section icon={Flag} title="Conclusión y hallazgo">
            <Textarea rows={3} value={report.conclusion ?? ""} onChange={(e) => patch({ conclusion: e.target.value })} placeholder="Conclusión" className="mb-2" />
            <Textarea rows={2} value={report.hallazgo_principal ?? ""} onChange={(e) => patch({ hallazgo_principal: e.target.value })} placeholder="Hallazgo principal" />
          </Section>
        </div>
      ) : (
        /* ══════════ MODO LECTURA ══════════ */
        <div className="space-y-4">
          {evModels.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Modelos:</span>
              {evModels.map((m) => <Badge key={m.model_id} variant="secondary">{m.model_name}</Badge>)}
            </div>
          )}
          {report.intro && <p className="text-sm text-muted-foreground">{report.intro}</p>}
          {report.resumen && (
            <Section icon={MessageSquareText} title="Resumen" collapsible defaultOpen><p className="text-sm leading-relaxed text-foreground/90"><Linkified text={report.resumen} fanIndex={fanIndex} /></p></Section>
          )}
          {!!report.aspectos_positivos?.length && (
            <Section icon={ThumbsUp} title="Aspectos positivos" accent="bg-success/15 text-success" collapsible defaultOpen={false} count={report.aspectos_positivos?.length}>
              <ul className="space-y-1.5">{report.aspectos_positivos.map((p, i) => <li key={i} className="flex gap-2 text-sm"><ThumbsUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /><span><Linkified text={p} fanIndex={fanIndex} /></span></li>)}</ul>
            </Section>
          )}
          {!!report.aspectos_mejora?.length && (
            <Section icon={Wrench} title="Aspectos de mejora" accent="bg-amber-500/15 text-amber-600" collapsible defaultOpen={false} count={report.aspectos_mejora?.length}>
              <div className="space-y-2.5">{report.aspectos_mejora.map((m, i) => (
                <div key={i} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
                  <p className="text-sm font-semibold text-amber-600">{m.categoria}</p>
                  <p className="mt-0.5 text-sm text-foreground/85"><Linkified text={m.detalle} fanIndex={fanIndex} /></p>
                </div>
              ))}</div>
            </Section>
          )}
          {!!report.observaciones_por_modelo?.length && (
            <Section icon={Users} title="Observaciones por modelo" collapsible defaultOpen={false} count={report.observaciones_por_modelo?.length}>
              <div className="space-y-3">{report.observaciones_por_modelo.map((o, i) => (
                <div key={i} className="rounded-lg border border-border/60 p-3">
                  <p className="mb-1.5 text-sm font-semibold">{o.model_name}</p>
                  <ul className="space-y-1">{(o.observaciones ?? []).map((ob, k) => <li key={k} className="flex gap-2 text-sm text-foreground/85"><span className="text-muted-foreground">·</span><span><Linkified text={ob} fanIndex={fanIndex} /></span></li>)}</ul>
                  {!!o.ejemplos?.length && (
                    <div className="mt-2.5 space-y-1.5">{o.ejemplos.map((ej, k) => (
                      <div key={k} className="rounded-md border border-border/50 bg-muted/30 p-2.5 text-xs">
                        {ej.fan && <div className="mb-1"><FanLink handle={ej.fan} fanIndex={fanIndex} /></div>}
                        <p className="flex gap-1.5 italic text-foreground/80"><Quote className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />"{ej.quote}"</p>
                        <p className="mt-1 text-muted-foreground">→ {ej.por_que}</p>
                      </div>
                    ))}</div>
                  )}
                </div>
              ))}</div>
            </Section>
          )}
          {!!report.recomendaciones?.length && (
            <Section icon={Lightbulb} title="Recomendaciones" accent="bg-primary/15 text-primary" collapsible defaultOpen={false} count={report.recomendaciones?.length}>
              <ul className="space-y-1.5">{report.recomendaciones.map((r, i) => <li key={i} className="flex gap-2 text-sm"><Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /><span><Linkified text={r} fanIndex={fanIndex} /></span></li>)}</ul>
            </Section>
          )}
          {report.conclusion && <Section icon={Flag} title="Conclusión" collapsible defaultOpen={false}><p className="text-sm leading-relaxed text-foreground/90"><Linkified text={report.conclusion} fanIndex={fanIndex} /></p></Section>}
          {report.hallazgo_principal && (
            <div className={`rounded-xl border p-4 ${toneBadge[tone]}`}>
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-80"><Flag className="h-3.5 w-3.5" /> Hallazgo principal</p>
              <p className="text-sm font-medium leading-relaxed"><Linkified text={report.hallazgo_principal} fanIndex={fanIndex} /></p>
            </div>
          )}
          {!hasContent(row) && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Reporte vacío. Tocá <b>Editar</b> para redactarlo, o <b>Generar con IA</b> (agregá modelos primero).</p>}
        </div>
      )}
    </div>
  );
}
