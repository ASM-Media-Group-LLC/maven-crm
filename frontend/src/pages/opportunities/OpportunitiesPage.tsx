// Oportunidades de monetización — pantalla en Maven para ver/manejar el interés
// de las creadoras en productos (Piclink, CP, Blu, ...) y su avance en el embudo.
// Es, para venta de PLATAFORMAS, el equivalente del pipeline de Closers.
//
// El bot la llena/persigue por detrás (vía service_role); acá los humanos la ven,
// la editan y la dan de alta a mano. El resumen de arriba responde directo a lo
// que pide Alvaro: "qué ventas hay cerca de cerrar".
//
// Visibilidad: supervisor_or_above (admin + manager + supervisores) ve todo; el
// resto ve las suyas (lo aplica la RLS de monetization_opportunities).
// (supabase as any): la tabla aún no está en los tipos generados.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { TrendingUp, Plus, Loader2, Clock, AlertCircle } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

// ── catálogo de productos y etapas ───────────────────────────────────────────
const PRODUCTS: { value: string; label: string }[] = [
  { value: "piclink", label: "Piclink" },
  { value: "content_protector", label: "Content Protector" },
  { value: "blu", label: "Blu" },
  { value: "exchange", label: "Exchange" },
  { value: "kash", label: "Kash" },
  { value: "agency", label: "Agencia (OF)" },
  { value: "other", label: "Otro" },
];
const productLabel = (v: string) => PRODUCTS.find((p) => p.value === v)?.label ?? v;

type Stage = "interested" | "offered" | "negotiating" | "won" | "lost";
const STAGES: { value: Stage; label: string; cls: string }[] = [
  { value: "interested", label: "Interesada", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  { value: "offered", label: "Ofrecida", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  { value: "negotiating", label: "Negociando", cls: "bg-warning/15 text-warning" },
  { value: "won", label: "Ganada", cls: "bg-success/15 text-success" },
  { value: "lost", label: "Perdida", cls: "bg-muted text-muted-foreground" },
];
const stageMeta = (v: string) => STAGES.find((s) => s.value === v) ?? STAGES[0];
const OPEN_STAGES: Stage[] = ["interested", "offered", "negotiating"];

interface Opportunity {
  id: string;
  creator_handle: string;
  product: string;
  stage: Stage;
  assigned_to: string | null;
  last_touch_at: string;
  next_followup_at: string | null;
  notes: string | null;
  lost_reason: string | null;
  source: string;
  created_at: string;
  monthly_value_usd: number | null;
}
interface Profile { id: string; full_name: string | null; }
// Confirmada de reclutamiento (closer_creators) que está por firmar — la mostramos
// también acá para que un ingreso grande (ej. una creadora de $24k) sea visible en
// Oportunidades, no solo en el pipeline de Closers.
interface BigConfirmada {
  id: string;
  instagram_handle: string | null;
  monthly_monetization: number | null;
  estimated_monetization: number | null;
  assigned_to: string | null;
  confirmed_date: string | null;
}

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
};
const isOverdue = (iso: string | null) => !!iso && new Date(iso) < new Date();
// Monto compacto en USD: $24k, $1.2k, $120, o "—" si no hay valor.
const fmtUsd = (n: number | null | undefined) => {
  const v = Number(n);
  if (n == null || !Number.isFinite(v) || v <= 0) return "—";
  return v >= 1000 ? `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `$${Math.round(v)}`;
};
const confValue = (c: BigConfirmada) => Number(c.monthly_monetization ?? 0) || Number(c.estimated_monetization ?? 0) || 0;

const OpportunitiesPage = () => {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"open" | "all" | Stage>("open");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Opportunity | null>(null);

  const { data: opps = [], isLoading } = useQuery({
    queryKey: ["monetization-opportunities"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("monetization_opportunities")
        .select("*")
        .order("next_followup_at", { ascending: true, nullsFirst: false })
        .order("last_touch_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Opportunity[];
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ["opp-users"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles").select("id, full_name")
        .order("full_name", { ascending: true });
      return (data ?? []) as Profile[];
    },
  });
  const userName = (id: string | null) =>
    !id ? "—" : users.find((u) => u.id === id)?.full_name || id.slice(0, 8);

  // #4 — Confirmadas de reclutamiento (pipeline de Closers) ordenadas por
  // facturación. Para que un ingreso grande (ej. creadora de $24k que está por
  // firmar) sea visible en Oportunidades, no solo en la pantalla de Closers.
  const { data: confirmadas = [] } = useQuery({
    queryKey: ["opp-recruitment-confirmadas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("closer_creators")
        .select("id, instagram_handle, monthly_monetization, estimated_monetization, assigned_to, confirmed_date")
        .eq("stage", "Confirmada")
        .limit(50);
      if (error) throw error;
      return ((data ?? []) as BigConfirmada[]).sort((a, b) => confValue(b) - confValue(a));
    },
  });

  // resumen por etapa (para el header "qué hay cerca de cerrar")
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of opps) c[o.stage] = (c[o.stage] ?? 0) + 1;
    return c;
  }, [opps]);
  const nearClose = (counts.negotiating ?? 0);
  const openTotal = OPEN_STAGES.reduce((s, st) => s + (counts[st] ?? 0), 0);

  const filtered = useMemo(() => {
    if (filter === "all") return opps;
    if (filter === "open") return opps.filter((o) => OPEN_STAGES.includes(o.stage));
    return opps.filter((o) => o.stage === filter);
  }, [opps, filter]);

  return (
    // El AppShell da `h-dvh` + `overflow-hidden` y cada página pone su propio
    // scroll: sin este contenedor, lo que pasa de una pantalla queda recortado
    // y no hay forma de llegar. `min-h-0` es imprescindible para que el hijo
    // pueda encogerse dentro de la columna flex.
    <main className="flex-1 min-h-0 overflow-y-auto">
      <div className="space-y-4 px-6 py-5">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <h1 className="text-base font-semibold leading-tight">Oportunidades de monetización</h1>
          <p className="text-xs text-muted-foreground">
            Interés de las creadoras en productos (Piclink, CP, Blu…). El bot las registra y persigue; aquí las ves y manejas.
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> Nueva oportunidad
        </Button>
      </div>

      {/* Resumen — qué hay cerca de cerrar */}
      <div className="flex flex-wrap gap-2">
        <SummaryChip label="Cerca de cerrar" value={nearClose} accent="bg-warning/15 text-warning" hint="en negociación" />
        <SummaryChip label="Abiertas" value={openTotal} accent="bg-primary/10 text-primary" hint="interesada + ofrecida + negociando" />
        <SummaryChip label="Ganadas" value={counts.won ?? 0} accent="bg-success/15 text-success" />
      </div>

      {/* #4 — Reclutamiento: confirmadas por firmar (del pipeline de Closers),
          ordenadas por facturación. Acá aparecen los cierres grandes (ej. $24k)
          que antes solo se veían en Closers. */}
      {confirmadas.length > 0 && (
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <span className="text-sm">🎯</span>
            <h2 className="text-sm font-semibold">Reclutamiento — confirmadas por firmar</h2>
            <span className="text-[11px] text-muted-foreground">(del pipeline de Closers · por facturación)</span>
          </div>
          <div className="flex flex-col gap-1">
            {confirmadas.slice(0, 8).map((c) => {
              const v = confValue(c);
              const big = v >= 10000;
              return (
                <div key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/40">
                  <span className="font-mono text-xs">{c.instagram_handle ?? "(sin handle)"}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${big ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                    {fmtUsd(v)}/mes
                  </span>
                  {big && <span className="text-xs" title="Cierre grande">🔥</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{userName(c.assigned_to)}</span>
                  <span className="text-[11px] text-muted-foreground">{fmtDate(c.confirmed_date)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtro por etapa */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Ver:</span>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Abiertas</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
            {STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            className="py-10"
            seed="oportunidades"
            title="No hay oportunidades en esta vista."
            description="Crea una con “Nueva oportunidad”."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Creadora</th>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 font-medium">Valor/mes</th>
                <th className="px-3 py-2 font-medium">Etapa</th>
                <th className="px-3 py-2 font-medium">Trabaja</th>
                <th className="px-3 py-2 font-medium">Próx. seguimiento</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const sm = stageMeta(o.stage);
                const overdue = isOverdue(o.next_followup_at) && OPEN_STAGES.includes(o.stage);
                return (
                  <tr
                    key={o.id}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                    onClick={() => { setEditing(o); setFormOpen(true); }}
                  >
                    <td className="px-3 py-2 font-medium">
                      {o.creator_handle}
                      {o.notes && <div className="truncate text-xs font-normal text-muted-foreground max-w-[22rem]">{o.notes}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs">{productLabel(o.product)}</td>
                    <td className="px-3 py-2 text-xs font-medium tabular-nums">{fmtUsd(o.monthly_value_usd)}</td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary-soft" className={`text-[10px] ${sm.cls}`}>{sm.label}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{userName(o.assigned_to)}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`inline-flex items-center gap-1 ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                        {overdue ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {fmtDate(o.next_followup_at)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <OpportunityFormDialog
        open={formOpen}
        existing={editing}
        users={users}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        onSaved={() => qc.invalidateQueries({ queryKey: ["monetization-opportunities"] })}
      />
      </div>
    </main>
  );
};

const SummaryChip = ({ label, value, accent, hint }: { label: string; value: number; accent: string; hint?: string }) => (
  <div className="rounded-md border px-3 py-2">
    <div className="flex items-baseline gap-2">
      <span className={`rounded px-1.5 py-0.5 text-sm font-semibold tabular-nums ${accent}`}>{value}</span>
      <span className="text-xs font-medium">{label}</span>
    </div>
    {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
  </div>
);

// Alta + edición en un solo diálogo (existing=null → alta).
const EMPTY = {
  creator_handle: "", product: "piclink", stage: "interested" as Stage,
  assigned_to: "", next_followup_at: "", notes: "", lost_reason: "", monthly_value_usd: "",
};

const OpportunityFormDialog = ({
  open, existing, users, onOpenChange, onSaved,
}: {
  open: boolean;
  existing: Opportunity | null;
  users: Profile[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) => {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);

  // Sincroniza el form cuando se abre (alta vacía / edición con datos).
  useEffect(() => {
    if (!open) return;
    setForm(existing ? {
      creator_handle: existing.creator_handle,
      product: existing.product,
      stage: existing.stage,
      assigned_to: existing.assigned_to ?? "",
      next_followup_at: existing.next_followup_at ? existing.next_followup_at.slice(0, 10) : "",
      notes: existing.notes ?? "",
      lost_reason: existing.lost_reason ?? "",
      monthly_value_usd: existing.monthly_value_usd != null ? String(existing.monthly_value_usd) : "",
    } : EMPTY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, open]);

  const save = useMutation({
    mutationFn: async () => {
      const handle = form.creator_handle.trim();
      if (!handle) throw new Error("Falta el @handle de la creadora.");
      const payload: Record<string, unknown> = {
        creator_handle: handle,
        product: form.product,
        stage: form.stage,
        assigned_to: form.assigned_to || null,
        next_followup_at: form.next_followup_at ? new Date(form.next_followup_at).toISOString() : null,
        notes: form.notes.trim() || null,
        lost_reason: form.stage === "lost" ? (form.lost_reason.trim() || null) : null,
        monthly_value_usd: form.monthly_value_usd ? Number(form.monthly_value_usd) : null,
        last_touch_at: new Date().toISOString(),
      };
      if (existing) {
        const { error } = await (supabase as any)
          .from("monetization_opportunities").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("monetization_opportunities").insert({ ...payload, source: "manual" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: existing ? "Oportunidad actualizada" : "Oportunidad creada" });
      onOpenChange(false);
      onSaved();
    },
    onError: (e: Error) => toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Editar oportunidad" : "Nueva oportunidad"}</DialogTitle>
          <DialogDescription>
            Una creadora interesada en un producto. El @handle es la clave; el resto se va actualizando con el seguimiento.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>@handle de la creadora *</Label>
            <Input
              value={form.creator_handle}
              onChange={(e) => setForm({ ...form, creator_handle: e.target.value })}
              placeholder="@karen.katc"
              disabled={!!existing}
              className="font-mono"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <Label>Producto</Label>
              <Select value={form.product} onValueChange={(v) => setForm({ ...form, product: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRODUCTS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <Label>Etapa</Label>
              <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v as Stage })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Facturación / valor mensual (USD)</Label>
            <Input
              type="number"
              min="0"
              value={form.monthly_value_usd}
              onChange={(e) => setForm({ ...form, monthly_value_usd: e.target.value })}
              placeholder="Ej. 24000 — para priorizar por monto"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <Label>Quién la trabaja</Label>
              <Select value={form.assigned_to || "none"} onValueChange={(v) => setForm({ ...form, assigned_to: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.id.slice(0, 8)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <Label>Próximo seguimiento</Label>
              <Input type="date" value={form.next_followup_at} onChange={(e) => setForm({ ...form, next_followup_at: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Ej. ofrecido Piclink gratis + CP con descuento de agencia; pidió pensarlo."
              rows={3}
            />
          </div>
          {form.stage === "lost" && (
            <div className="space-y-1">
              <Label>Motivo de la pérdida</Label>
              <Input value={form.lost_reason} onChange={(e) => setForm({ ...form, lost_reason: e.target.value })} placeholder="Ej. no quiso crear OF, solo shootings" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.creator_handle.trim()}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (existing ? "Guardar" : "Crear")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OpportunitiesPage;
