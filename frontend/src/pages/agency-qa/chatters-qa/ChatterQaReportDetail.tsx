import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Sparkles, Save, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBluModels, bluModelLabel } from "../../sales-performance/useBluMp";
import { companyLabel, periodLabel } from "./useChatterScorecards";
import {
  VEREDICTOS, veredictoLabel, veredictoTone,
  useQaReport, useUpdateQaReport, useGenerateQaDraft,
  type ChatterQaReport, type QaReportBody, type EvaluatedModel, type MejoraItem, type ModelObs,
} from "./useChatterQaReports";

const toneBadge: Record<string, string> = {
  good: "border-success/40 text-success", warn: "border-amber-500/40 text-amber-600", bad: "border-destructive/40 text-destructive",
};

// Editor de lista de strings (bullets): positivos / recomendaciones / observaciones.
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

const SECTION = "rounded-lg border border-border bg-card/40 p-4 space-y-3";

export default function ChatterQaReportDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: row, isLoading } = useQaReport(id);
  const update = useUpdateQaReport();
  const draft = useGenerateQaDraft();
  const { data: models = [] } = useBluModels();

  const [report, setReport] = useState<QaReportBody>({});
  const [veredicto, setVeredicto] = useState<string>("");
  const [evModels, setEvModels] = useState<EvaluatedModel[]>([]);
  const [dirty, setDirty] = useState(false);

  // Sincroniza el estado local cuando carga/cambia la fila (y no hay edición sin guardar).
  useEffect(() => {
    if (!row || dirty) return;
    setReport(row.report ?? {});
    setVeredicto(row.veredicto ?? "");
    setEvModels(row.evaluated_models ?? []);
  }, [row, dirty]);

  if (isLoading || !row) return <div className="p-6 text-sm text-muted-foreground">Cargando reporte…</div>;

  const patch = (p: Partial<QaReportBody>) => { setReport((r) => ({ ...r, ...p })); setDirty(true); };
  const mejoras = report.aspectos_mejora ?? [];
  const obs = report.observaciones_por_modelo ?? [];

  const save = () => {
    update.mutate(
      { id, patch: { report, veredicto: (veredicto || null) as ChatterQaReport["veredicto"], evaluated_models: evModels,
        source: row.source === "ai_draft" ? "ai_edited" : row.source } },
      { onSuccess: () => { setDirty(false); toast.success("Reporte guardado"); }, onError: (e) => toast.error((e as Error).message) },
    );
  };

  const addModel = (mid: string) => {
    const m = models.find((x) => String(x.id) === mid);
    if (!m || evModels.some((e) => e.model_id === m.id)) return;
    setEvModels([...evModels, { model_id: m.id, model_name: bluModelLabel(m) }]); setDirty(true);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Volver</Button>
        <div className="flex-1">
          <h3 className="text-lg font-bold">{row.chatter_name}</h3>
          <p className="text-xs text-muted-foreground">{companyLabel(row.company)} ({row.company}) · {periodLabel(row.period)} · {row.evaluator_name}</p>
        </div>
        {row.status === "processing" && <Badge variant="outline" className="gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> generando…</Badge>}
        {row.status === "failed" && <Badge variant="outline" className="gap-1.5 border-destructive/40 text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> falló</Badge>}
        <Button variant="outline" size="sm" className="gap-1.5" disabled={draft.isPending || evModels.length === 0}
          onClick={() => draft.mutate({ id }, { onError: (e) => toast.error((e as Error).message), onSuccess: () => toast.success("Borrador IA en curso…") })}>
          <Sparkles className="h-4 w-4" /> {row.source === "manual" ? "Generar con IA" : "Regenerar IA"}
        </Button>
        <Button size="sm" className="gap-1.5" disabled={!dirty || update.isPending} onClick={save}>
          <Save className="h-4 w-4" /> Guardar
        </Button>
      </div>

      {row.status === "failed" && row.error_message && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{row.error_message}</p>
      )}

      {/* Veredicto + modelos evaluadas */}
      <div className={SECTION}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Resultado</span>
            <Select value={veredicto} onValueChange={(v) => { setVeredicto(v); setDirty(true); }}>
              <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Veredicto" /></SelectTrigger>
              <SelectContent>{VEREDICTOS.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent>
            </Select>
            {veredicto && <Badge variant="outline" className={toneBadge[veredictoTone(veredicto)]}>{veredictoLabel(veredicto)}</Badge>}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold">Modelos evaluadas</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {evModels.map((m) => (
              <Badge key={m.model_id} variant="secondary" className="gap-1">
                {m.model_name}
                <button type="button" onClick={() => { setEvModels(evModels.filter((e) => e.model_id !== m.model_id)); setDirty(true); }}><Trash2 className="h-3 w-3" /></button>
              </Badge>
            ))}
            <Select value="" onValueChange={addModel}>
              <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="+ Agregar modelo" /></SelectTrigger>
              <SelectContent className="max-h-72">{models.map((m) => <SelectItem key={m.id} value={String(m.id)}>{bluModelLabel(m)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Intro + resumen */}
      <div className={SECTION}>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Introducción / objetivo</p>
          <Textarea rows={3} value={report.intro ?? ""} onChange={(e) => patch({ intro: e.target.value })} placeholder="Objetivo de la evaluación…" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Resumen / diagnóstico</p>
          <Textarea rows={3} value={report.resumen ?? ""} onChange={(e) => patch({ resumen: e.target.value })} />
        </div>
      </div>

      {/* Aspectos positivos */}
      <div className={SECTION}>
        <StringList label="Aspectos positivos" items={report.aspectos_positivos ?? []} onChange={(v) => patch({ aspectos_positivos: v })} />
      </div>

      {/* Aspectos de mejora (categoría + detalle) */}
      <div className={SECTION}>
        <p className="text-sm font-semibold">Aspectos de mejora</p>
        {mejoras.map((m, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex-1 space-y-1.5">
              <Input value={m.categoria} placeholder="Categoría (ej. Falta de calentamiento)"
                onChange={(e) => { const n = [...mejoras]; n[i] = { ...m, categoria: e.target.value }; patch({ aspectos_mejora: n }); }} />
              <Textarea rows={2} value={m.detalle} placeholder="Detalle"
                onChange={(e) => { const n = [...mejoras]; n[i] = { ...m, detalle: e.target.value }; patch({ aspectos_mejora: n }); }} />
            </div>
            <button type="button" onClick={() => patch({ aspectos_mejora: mejoras.filter((_, j) => j !== i) })}
              className="mt-2 text-muted-foreground/50 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => patch({ aspectos_mejora: [...mejoras, { categoria: "", detalle: "" }] })}>
          <Plus className="h-3.5 w-3.5" /> Agregar categoría
        </Button>
      </div>

      {/* Observaciones por modelo */}
      <div className={SECTION}>
        <p className="text-sm font-semibold">Observaciones por modelo</p>
        {obs.length === 0 && <p className="text-xs text-muted-foreground">Sin observaciones por modelo. (La IA las completa, o agregá manual abajo.)</p>}
        {obs.map((o, i) => (
          <div key={i} className="rounded-md border border-border/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Input value={o.model_name ?? ""} placeholder="Modelo" className="h-8 w-56 font-medium"
                onChange={(e) => { const n = [...obs]; n[i] = { ...o, model_name: e.target.value }; patch({ observaciones_por_modelo: n }); }} />
              <button type="button" onClick={() => patch({ observaciones_por_modelo: obs.filter((_, j) => j !== i) })}
                className="text-muted-foreground/50 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
            <StringList label="Observaciones" items={o.observaciones ?? []}
              onChange={(v) => { const n = [...obs]; n[i] = { ...o, observaciones: v }; patch({ observaciones_por_modelo: n }); }} />
            {(o.ejemplos ?? []).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">Ejemplos (de la conversación)</p>
                {(o.ejemplos ?? []).map((ej, k) => (
                  <div key={k} className="rounded border border-border/50 bg-muted/30 p-2 text-xs">
                    {ej.fan && <p className="mb-0.5 font-mono text-[11px] font-semibold text-primary">{ej.fan}</p>}
                    <p className="italic">"{ej.quote}"</p>
                    <p className="mt-0.5 text-muted-foreground">→ {ej.por_que}</p>
                    <button type="button" className="mt-1 text-[10px] text-destructive/70 hover:text-destructive"
                      onClick={() => { const n = [...obs]; n[i] = { ...o, ejemplos: (o.ejemplos ?? []).filter((_, x) => x !== k) }; patch({ observaciones_por_modelo: n }); }}>
                      quitar ejemplo
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs"
          onClick={() => patch({ observaciones_por_modelo: [...obs, { model_name: "", observaciones: [""] }] })}>
          <Plus className="h-3.5 w-3.5" /> Agregar modelo
        </Button>
      </div>

      {/* Recomendaciones */}
      <div className={SECTION}>
        <StringList label="Recomendaciones" items={report.recomendaciones ?? []} onChange={(v) => patch({ recomendaciones: v })} />
      </div>

      {/* Conclusión + hallazgo */}
      <div className={SECTION}>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Conclusión</p>
          <Textarea rows={3} value={report.conclusion ?? ""} onChange={(e) => patch({ conclusion: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Hallazgo principal</p>
          <Textarea rows={2} value={report.hallazgo_principal ?? ""} onChange={(e) => patch({ hallazgo_principal: e.target.value })} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" disabled={!dirty || update.isPending} onClick={save}><Save className="h-4 w-4" /> Guardar cambios</Button>
      </div>
    </div>
  );
}
