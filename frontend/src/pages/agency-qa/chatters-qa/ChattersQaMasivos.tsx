import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Megaphone, Eye, ShoppingCart, DollarSign, Send, Sparkles, Loader2, ThumbsUp, ThumbsDown, Lightbulb, Quote } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useBluModels, useBluMasivos, bluModelLabel, type BluMasivo } from "../../sales-performance/useBluMp";

const htmlToText = (h: string) => String(h || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const money = (n: number) => `$${(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");

interface MasivosAnalysis {
  resumen: string; que_funciona: string[]; que_no_funciona: string[]; recomendaciones: string[]; mejores_copies: string[]; peores_copies: string[];
}

function Kpi({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.04] to-transparent p-4 backdrop-blur-md">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
function List({ icon: Icon, title, items, tone }: { icon: any; title: string; items: string[]; tone: string }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.04] to-transparent p-4 backdrop-blur-md">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon className={`h-4 w-4 ${tone}`} />{title}</div>
      <ul className="space-y-1.5">{items.map((x, i) => <li key={i} className="flex gap-2 text-sm text-foreground/90"><span className={tone}>·</span><span>{x}</span></li>)}</ul>
    </div>
  );
}

export default function ChattersQaMasivos() {
  const { data: models = [], isLoading: modelsLoading } = useBluModels();
  const [modelId, setModelId] = useState<number | null>(null);
  const { data: masivos = [], isLoading } = useBluMasivos(modelId);
  const [analysis, setAnalysis] = useState<MasivosAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const modelName = models.find((m) => m.id === modelId);
  const rows = useMemo(() => masivos.slice().sort((a, b) => b.earnings - a.earnings || b.sent - a.sent), [masivos]);
  const kpis = useMemo(() => masivos.reduce((a, m) => ({ sent: a.sent + m.sent, viewed: a.viewed + m.viewed, purchased: a.purchased + m.purchased, earnings: a.earnings + m.earnings }), { sent: 0, viewed: 0, purchased: 0, earnings: 0 }), [masivos]);

  const analyze = async () => {
    if (!masivos.length) return;
    setAnalyzing(true); setAnalysis(null);
    try {
      const { data, error } = await supabase.functions.invoke("chatter-masivos-analyze", { body: { masivos, modelName: modelName ? bluModelLabel(modelName) : "" } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      setAnalysis(data.analysis as MasivosAnalysis);
    } catch (e) { toast.error("No se pudo analizar: " + (e as Error).message); }
    finally { setAnalyzing(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Calidad de los <b>masivos</b> (PPV/blasts) por modelo, cruzada con veces visto · ventas · dinero recaudado.</p>
        <Select value={modelId ? String(modelId) : ""} onValueChange={(v) => { setModelId(Number(v)); setAnalysis(null); }}>
          <SelectTrigger className="w-64"><SelectValue placeholder={modelsLoading ? "Cargando modelos…" : "Elige un modelo"} /></SelectTrigger>
          <SelectContent className="max-h-80">{models.map((m) => <SelectItem key={m.id} value={String(m.id)}>{bluModelLabel(m)}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {!modelId && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Elige un modelo para ver sus masivos.</p>}
      {modelId && isLoading && <p className="text-sm text-muted-foreground">Cargando masivos…</p>}
      {modelId && !isLoading && masivos.length === 0 && <p className="text-sm text-muted-foreground">Este modelo no tiene masivos.</p>}

      {masivos.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Kpi icon={Megaphone} label="Masivos" value={String(masivos.length)} />
            <Kpi icon={Send} label="Enviados" value={kpis.sent.toLocaleString()} />
            <Kpi icon={Eye} label="Vistos" value={kpis.viewed.toLocaleString()} sub={`${pct(kpis.viewed, kpis.sent)} apertura`} />
            <Kpi icon={ShoppingCart} label="Ventas" value={kpis.purchased.toLocaleString()} sub={`${pct(kpis.purchased, kpis.viewed)} conv.`} />
            <Kpi icon={DollarSign} label="Recaudado" value={money(kpis.earnings)} />
          </div>

          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={analyze} disabled={analyzing}>
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Analizar calidad con IA
            </Button>
          </div>

          {analysis && (
            <div className="space-y-3">
              {analysis.resumen && <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-primary/10 to-transparent p-4 text-sm leading-relaxed backdrop-blur-md">{analysis.resumen}</div>}
              <div className="grid gap-3 md:grid-cols-2">
                <List icon={ThumbsUp} title="Qué funciona" items={analysis.que_funciona} tone="text-success" />
                <List icon={ThumbsDown} title="Qué no funciona" items={analysis.que_no_funciona} tone="text-destructive" />
              </div>
              <List icon={Lightbulb} title="Recomendaciones" items={analysis.recomendaciones} tone="text-primary" />
              <div className="grid gap-3 md:grid-cols-2">
                <List icon={Quote} title="Mejores copys" items={analysis.mejores_copies} tone="text-success" />
                <List icon={Quote} title="Peores copys" items={analysis.peores_copies} tone="text-destructive" />
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-md">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-white/[0.03] text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Copy</th>
                  <th className="px-2 py-2 text-left font-medium">Tipo</th>
                  <th className="px-2 py-2 text-left font-medium">Quién</th>
                  <th className="px-2 py-2 text-right font-medium">Env.</th>
                  <th className="px-2 py-2 text-right font-medium">Visto</th>
                  <th className="px-2 py-2 text-right font-medium">Ventas</th>
                  <th className="px-2 py-2 text-right font-medium">$</th>
                  <th className="px-2 py-2 text-right font-medium">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="border-b border-border/40 last:border-0 hover:bg-white/[0.03]">
                    <td className="max-w-[340px] px-3 py-2"><p className="line-clamp-2 text-foreground/90">{htmlToText(m.copy) || <span className="text-muted-foreground">(sin texto)</span>}</p></td>
                    <td className="px-2 py-2"><Badge variant="outline" className="text-[10px]">{m.type === "priority" ? "Priority" : m.isExternal ? "Externo" : "OF mass"}</Badge></td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{m.senderName ?? <span className="italic">otro CRM</span>}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{m.sent.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{m.viewed.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium">{m.purchased.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-semibold text-success">{money(m.earnings)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{pct(m.purchased, m.viewed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
