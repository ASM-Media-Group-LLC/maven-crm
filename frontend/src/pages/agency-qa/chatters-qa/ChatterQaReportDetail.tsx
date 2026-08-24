import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Trash2, Sparkles, Save, Loader2, AlertTriangle, Pencil, X,
  ThumbsUp, Wrench, MessageSquareText, Lightbulb, Flag, FileText, Users, Quote, ChevronDown, Mail,
  MailCheck, CheckCircle2, XCircle, Megaphone,
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
  warn: "border-warning/40 bg-warning/10 text-warning",
  bad: "border-destructive/40 bg-destructive/10 text-destructive",
};

// @handle → nombre real del fan (si lo tenemos en el índice de BLU).
function FanLink({ handle, fanIndex }: { handle: string; fanIndex: FanIndex }) {
  const hit = fanIndex[handle];
  if (!hit) return <span className="font-mono text-[0.95em] text-muted-foreground">{handle}</span>;
  return (
    <span className="inline-flex items-center gap-1 text-[0.95em] font-medium text-primary">
      {hit.n ? <>{hit.n} <span className="font-mono opacity-80">{handle}</span></> : <span className="font-mono">{handle}</span>}
    </span>
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

// Avatar de iniciales con gradiente por hash del nombre (mismo patrón que CallDetailPage).
function HeroAvatar({ name, size = 60 }: { name: string; size?: number }) {
  const initial = (name?.trim().charAt(0) || "?").toUpperCase();
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  const bg = `linear-gradient(135deg, hsl(${h},62%,56%) 0%, hsl(${(h + 60) % 360},70%,38%) 100%)`;
  return <span className="inline-flex shrink-0 items-center justify-center rounded-full text-xl font-bold text-white shadow-md ring-2 ring-white/15" style={{ width: size, height: size, background: bg }}>{initial}</span>;
}

// "Gauge" del veredicto: anillo coloreado por tono (sin score numérico) con un ícono al centro.
const VERED_LEVEL: Record<string, number> = { excelente: 100, bueno: 75, requiere_mejora: 45, critico: 22 };
const TONE_HSL: Record<string, string> = { good: "hsl(152 60% 45%)", warn: "hsl(38 92% 50%)", bad: "hsl(0 72% 56%)" };
function VeredictoGauge({ veredicto, size = 104 }: { veredicto: string; size?: number }) {
  const tone = veredictoTone(veredicto);
  const level = VERED_LEVEL[veredicto] ?? 50;
  const sw = 9, r = (size - sw) / 2, c = 2 * Math.PI * r, offset = c * (1 - level / 100);
  const color = TONE_HSL[tone];
  const Icon = tone === "good" ? CheckCircle2 : tone === "bad" ? XCircle : AlertTriangle;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 700ms ease" }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center"><Icon className="h-8 w-8" style={{ color }} /></div>
    </div>
  );
}

// ── Card de sección. Glass + gradiente sutil. En lectura colapsable (chevron); en edición siempre abierta. ──
function Section({ icon: Icon, title, accent, collapsible, defaultOpen = true, count, children }:
  { icon: any; title: string; accent?: string; collapsible?: boolean; defaultOpen?: boolean; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const head = (
    <>
      <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${accent ?? "bg-muted text-muted-foreground"}`}><Icon className="h-4 w-4" /></span>
      <h4 className="text-sm font-semibold tracking-tight">{title}</h4>
      {typeof count === "number" && <span className="rounded-full bg-white/10 px-1.5 text-[11px] text-muted-foreground">{count}</span>}
      {collapsible && <ChevronDown className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />}
    </>
  );
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.04] to-transparent p-4 backdrop-blur-md transition-colors hover:border-white/10">
      {collapsible
        ? <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 text-left">{head}</button>
        : <div className="mb-2.5 flex items-center gap-2.5">{head}</div>}
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

  // Mientras el borrador IA corre (status en DB = 'processing', o la mutación recién disparada),
  // reemplazamos el formulario por una pantalla linda. El análisis sigue server-side: el usuario
  // puede Volver / navegar y le avisamos con un toast al terminar (useQaProcessingWatcher).
  if (row.status === "processing" || draft.isPending) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Volver</button>
        <div className="relative overflow-hidden rounded-2xl border border-white/10 p-10 text-center"
          style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.20), hsl(var(--accent) / 0.08) 45%, hsl(var(--card)) 100%)", boxShadow: "0 0 90px -28px hsl(var(--accent) / 0.45)" }}>
          <div className="relative mx-auto mb-5 inline-flex h-20 w-20 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
            <span className="absolute inset-0 rounded-full bg-primary/15" />
            <Sparkles className="relative h-9 w-9 animate-pulse text-primary" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Analizando con IA…</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Leyendo las conversaciones de <strong className="text-foreground">{row.chatter_name}</strong> en Mensajes Pro y evaluando la ejecución comercial. Suele tardar ~20-40s.
          </p>
          {!!row.evaluated_models?.length && (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {row.evaluated_models.map((m) => <Badge key={m.model_id} variant="secondary" className="text-[11px]">{m.model_name}</Badge>)}
            </div>
          )}
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Puedes seguir navegando — te avisamos cuando termine.
          </div>
        </div>
      </div>
    );
  }

  const patch = (p: Partial<QaReportBody>) => { setReport((r) => ({ ...r, ...p })); setDirty(true); };
  const patchVm = (p: Record<string, unknown>) => patch({ venta_masiva: { ...(report.venta_masiva ?? {}), ...p } });
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
      {/* ── Hero (gradiente + avatar + gauge de veredicto) ── */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 p-5"
        style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.18), hsl(var(--accent) / 0.07) 45%, hsl(var(--card)) 100%)", boxShadow: "0 0 90px -28px hsl(var(--accent) / 0.4)" }}>
        <div className="flex items-start justify-between gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Volver</button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 border-white/15 bg-background/40 backdrop-blur" disabled={draft.isPending || evModels.length === 0}
              onClick={() => draft.mutate({ id })}>{/* status→'processing' → pantalla "Analizando…"; el resultado (verde/rojo + warnings) lo avisa useQaProcessingWatcher */}
              <Sparkles className="h-4 w-4" /> {row.source === "manual" && !hasContent(row) ? "Generar con IA" : "Regenerar IA"}
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 border-white/15 bg-background/40 backdrop-blur" disabled={sendEmail.isPending || row.status !== "ready" || !hasContent(row)}
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
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <HeroAvatar name={row.chatter_name} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold tracking-tight">{row.chatter_name}</h2>
                {veredicto && <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-sm font-semibold sm:hidden ${toneBadge[tone]}`}>{veredictoLabel(veredicto)}</span>}
                {row.status === "processing" && <Badge variant="outline" className="gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> generando…</Badge>}
                {row.status === "failed" && <Badge variant="outline" className="gap-1.5 border-destructive/40 text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> falló</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {companyLabel(row.company)} ({row.company}) · {periodLabel(row.period)} · Evaluó: {row.evaluator_name}
                {sampling?.threads_sampled ? <> · <Sparkles className="inline h-3 w-3" /> {sampling.models} modelo(s) · {sampling.threads_sampled} hilos · {sampling.messages_read} mensajes</> : null}
                {row.email_sent_at ? <> · <MailCheck className="inline h-3 w-3 text-success" /> enviado</> : null}
              </p>
            </div>
          </div>
          {veredicto && (
            <div className="hidden shrink-0 flex-col items-center gap-2 sm:flex">
              <VeredictoGauge veredicto={veredicto} />
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneBadge[tone]}`}>{veredictoLabel(veredicto)}</span>
            </div>
          )}
        </div>
        {row.status === "failed" && row.error_message && <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{row.error_message}</p>}
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
          <Section icon={Wrench} title="Aspectos de mejora" accent="bg-warning/15 text-warning">
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
          <Section icon={Megaphone} title="Venta masiva" accent="bg-fuchsia-500/15 text-fuchsia-500">
            <p className="mb-2 text-xs text-muted-foreground">Diagnóstico manual de los masivos del chatter (dejalo vacío si no aplica). El detalle —mejores/peores · patrones · recomendaciones— lo completa el borrador IA cuando detecta masivos suyos.</p>
            <Textarea rows={3} value={report.venta_masiva?.resumen ?? ""} placeholder="Diagnóstico de los masivos…"
              onChange={(e) => patchVm({ resumen: e.target.value })} />
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
            <Section icon={Wrench} title="Aspectos de mejora" accent="bg-warning/15 text-warning" collapsible defaultOpen={false} count={report.aspectos_mejora?.length}>
              <div className="space-y-2.5">{report.aspectos_mejora.map((m, i) => (
                <div key={i} className="rounded-lg border border-warning/20 bg-warning/5 p-2.5">
                  <p className="text-sm font-semibold text-warning">{m.categoria}</p>
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
          {(() => {
            const vm = report.venta_masiva;
            // Solo mostramos si hay contenido (IA con masivos atribuidos, o cargada a mano en el editor).
            // Sin masivos del chatter → la IA deja venta_masiva en null → no aparece nada.
            const has = vm && (vm.resumen || vm.mejores?.length || vm.peores?.length || vm.patrones?.length || vm.recomendaciones?.length || (vm.stats?.count ?? 0) > 0);
            if (!has) return null;
            const s = vm!.stats;
            const conv = s && s.viewed ? `${((s.purchased / s.viewed) * 100).toFixed(1)}%` : "—";
            const ItemCard = ({ it, tone }: { it: { copy?: string; metricas?: string; por_que?: string }; tone: "good" | "bad" }) => (
              <div className={`rounded-md border p-2.5 text-xs ${tone === "good" ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"}`}>
                {it.copy && <p className="flex gap-1.5 italic text-foreground/85"><Quote className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />"{it.copy}"</p>}
                {it.metricas && <p className="mt-1 font-medium text-muted-foreground">{it.metricas}</p>}
                {it.por_que && <p className="mt-0.5 text-muted-foreground">→ {it.por_que}</p>}
              </div>
            );
            return (
              <Section icon={Megaphone} title="Venta masiva" accent="bg-fuchsia-500/15 text-fuchsia-500" collapsible defaultOpen={false}
                count={(vm!.mejores?.length ?? 0) + (vm!.peores?.length ?? 0)}>
                {vm!.resumen && <p className="mb-3 text-sm leading-relaxed text-foreground/90">{vm!.resumen}</p>}
                {s && s.count > 0 && (
                  <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs tabular-nums">
                    <span><b>{s.count}</b> masivos</span><span><b>{s.sent.toLocaleString()}</b> enviados</span>
                    <span><b>{s.viewed.toLocaleString()}</b> vistos</span><span><b>{s.purchased.toLocaleString()}</b> ventas ({conv})</span>
                    <span className="text-success"><b>${s.earnings.toLocaleString()}</b></span>
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  {!!vm!.mejores?.length && <div className="space-y-1.5"><p className="text-xs font-semibold text-success">Más efectivos</p>{vm!.mejores.map((it, i) => <ItemCard key={i} it={it} tone="good" />)}</div>}
                  {!!vm!.peores?.length && <div className="space-y-1.5"><p className="text-xs font-semibold text-destructive">Menos efectivos</p>{vm!.peores.map((it, i) => <ItemCard key={i} it={it} tone="bad" />)}</div>}
                </div>
                {!!vm!.patrones?.length && (
                  <div className="mt-3"><p className="mb-1 text-xs font-semibold text-foreground/80">Patrones</p>
                    <ul className="space-y-1">{vm!.patrones.map((p, i) => <li key={i} className="flex gap-2 text-sm text-foreground/85"><span className="text-fuchsia-500">·</span><span>{p}</span></li>)}</ul></div>
                )}
                {!!vm!.recomendaciones?.length && (
                  <div className="mt-3"><p className="mb-1 text-xs font-semibold text-foreground/80">Recomendaciones</p>
                    <ul className="space-y-1.5">{vm!.recomendaciones.map((r, i) => <li key={i} className="flex gap-2 text-sm"><Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /><span>{r}</span></li>)}</ul></div>
                )}
              </Section>
            );
          })()}
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
          {!hasContent(row) && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Reporte vacío. Toca <b>Editar</b> para redactarlo, o <b>Generar con IA</b> (agrega modelos primero).</p>}
        </div>
      )}
    </div>
  );
}
