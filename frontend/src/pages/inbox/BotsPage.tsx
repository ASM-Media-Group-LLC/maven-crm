// Configurar Bots de WhatsApp (Fase 5). Admin: crear/editar los bots (wa_bots) —
// Manual (prompt específico del depto), Llavero (qué tools puede usar) y modelo.
// El MOTOR (no-alucinar, tono, uso de tools) vive en código y es común a todos.
//
// Escribe directo a wa_bots vía supabase (RLS = supervisor_or_above). (supabase
// as any): la tabla wa_bots aún no está en los tipos generados.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Bot, Plus, Loader2, Radio } from "lucide-react";

const DEPTS = [
  { value: "sales", label: "Ventas / Marketing" },
  { value: "closer", label: "Closers" },
  { value: "manager", label: "Managers" },
  { value: "recruitment", label: "Reclutamiento" },
  { value: "chatter", label: "Chatters" },
  { value: "other", label: "Otro" },
];
const deptLabel = (d: string) => DEPTS.find((x) => x.value === d)?.label ?? d;

// Radix Select no admite value="" → usamos "default" como sentinela del router.
const MODELS = [
  { value: "default", label: "Por defecto (router automático)" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6 (más capaz)" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5 (más barato)" },
];
const modelLabel = (m: string | null) => MODELS.find((x) => x.value === (m || "default"))?.label ?? m;

// Catálogo del Llavero: nombre = la tool en el agent; label legible. Vacío = todas.
const TOOL_CATALOG: { name: string; label: string }[] = [
  { name: "reply_to_group", label: "Responder al grupo (hablar)" },
  { name: "search_messages", label: "Buscar mensajes del grupo" },
  { name: "search_maven_leads", label: "Buscar leads en Maven" },
  { name: "get_lead_details", label: "Ver detalle de un lead" },
  { name: "lookup_lead_history", label: "Historial de un lead" },
  { name: "mark_lead_stage", label: "Cambiar etapa de un lead" },
  { name: "add_note_to_lead", label: "Agregar nota a un lead" },
  { name: "get_unassigned_leads", label: "Leads sin asignar" },
  { name: "get_closer_pipeline_status", label: "Estado del pipeline del closer" },
  { name: "analyze_instagram_lead", label: "Analizar lead de Instagram" },
  { name: "analyze_profile_deep", label: "Análisis profundo de perfil" },
  { name: "get_member_stats", label: "Stats de un miembro" },
  { name: "get_member_maven_activity", label: "Actividad del miembro en Maven" },
  { name: "get_team_ranking", label: "Ranking del equipo" },
  { name: "get_team_schedule", label: "Agenda del equipo" },
  { name: "register_day_off", label: "Registrar día libre" },
  { name: "get_llg_account_status", label: "Estado de cuentas LLG" },
  { name: "list_commitments", label: "Listar compromisos/pendientes" },
  { name: "resolve_commitment", label: "Resolver compromiso" },
  { name: "snooze_commitment", label: "Posponer compromiso" },
  { name: "create_reminder", label: "Crear recordatorio" },
  { name: "register_daily_report", label: "Registrar reporte diario" },
  { name: "validate_report_vs_maven", label: "Validar reporte vs Maven" },
  { name: "get_monetization_opportunities", label: "Ver oportunidades de monetización" },
  { name: "log_monetization_opportunity", label: "Registrar oportunidad de monetización" },
  { name: "add_persistent_rule", label: "Agregar regla persistente" },
  { name: "list_rules", label: "Listar reglas" },
  { name: "deactivate_rule", label: "Desactivar regla" },
];

interface WaBot {
  id: string;
  name: string;
  department: string;
  description: string | null;
  manual_prompt: string | null;
  model: string | null;
  tool_allowlist: string[] | null;
  active: boolean;
}

const EMPTY: Omit<WaBot, "id"> = {
  name: "", department: "sales", description: "", manual_prompt: "", model: "", tool_allowlist: null, active: true,
};

const BotsPage = () => {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<WaBot | "new" | null>(null);

  const { data: bots = [], isLoading } = useQuery({
    queryKey: ["wa-bots"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("wa_bots").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WaBot[];
    },
  });

  return (
    <div className="space-y-4 px-6 py-5">
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <h1 className="text-base font-semibold leading-tight">Bots de WhatsApp</h1>
          <p className="text-xs text-muted-foreground">
            Cada bot: su Manual (cómo trabaja), su Llavero (a qué data accede) y el modelo. El motor base es común a todos.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/inbox/canales"><Radio className="h-4 w-4" /> Líneas</Link>
        </Button>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Nuevo bot
        </Button>
      </div>

      <div className="rounded-md border">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : bots.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Todavía no hay bots. El de Ventas ya existe en datos; creá los demás (ej. Managers) o editá los que haya.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Bot</th>
                <th className="px-3 py-2 font-medium">Depto</th>
                <th className="px-3 py-2 font-medium">Modelo</th>
                <th className="px-3 py-2 font-medium">Llavero</th>
                <th className="px-3 py-2 font-medium">Manual</th>
                <th className="px-3 py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {bots.map((b) => (
                <tr key={b.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">
                    {b.name}
                    {!b.active && <Badge variant="secondary-soft" className="ml-1 text-[10px]">inactivo</Badge>}
                  </td>
                  <td className="px-3 py-2"><Badge variant="secondary-soft" className="text-[10px]">{deptLabel(b.department)}</Badge></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{modelLabel(b.model)}</td>
                  <td className="px-3 py-2 text-xs">{b.tool_allowlist == null ? "Todas" : `${b.tool_allowlist.length} tools`}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{b.manual_prompt ? `${b.manual_prompt.length} chars` : "(motor por defecto)"}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(b)}>Editar</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <BotDialog
        bot={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["wa-bots"] }); setEditing(null); }}
      />
    </div>
  );
};

const BotDialog = ({
  bot, onClose, onSaved,
}: {
  bot: WaBot | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { toast } = useToast();
  const [form, setForm] = useState<Omit<WaBot, "id">>(EMPTY);
  const [saving, setSaving] = useState(false);
  const isNew = bot === "new";

  useEffect(() => {
    if (bot === "new") setForm(EMPTY);
    else if (bot) {
      setForm({
        name: bot.name, department: bot.department, description: bot.description ?? "",
        manual_prompt: bot.manual_prompt ?? "", model: bot.model ?? "",
        tool_allowlist: bot.tool_allowlist, active: bot.active,
      });
    }
  }, [bot]);

  // null = todas. Al togglear desde "todas" arrancamos del set completo.
  const toggleTool = (name: string) => {
    setForm((f) => {
      const base = f.tool_allowlist == null ? TOOL_CATALOG.map((t) => t.name) : [...f.tool_allowlist];
      const i = base.indexOf(name);
      if (i >= 0) base.splice(i, 1); else base.push(name);
      return { ...f, tool_allowlist: base.length === TOOL_CATALOG.length ? null : base };
    });
  };
  const toolChecked = (name: string) => form.tool_allowlist == null || form.tool_allowlist.includes(name);
  const toolCount = form.tool_allowlist == null ? TOOL_CATALOG.length : form.tool_allowlist.length;

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Falta el nombre", variant: "destructive" }); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      department: form.department,
      description: form.description?.trim() || null,
      manual_prompt: form.manual_prompt?.trim() || null,
      model: form.model || null,
      tool_allowlist: form.tool_allowlist,
      active: form.active,
    };
    const { error } = isNew
      ? await (supabase as any).from("wa_bots").insert(payload)
      : await (supabase as any).from("wa_bots").update(payload).eq("id", (bot as WaBot).id);
    setSaving(false);
    if (error) { toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" }); return; }
    toast({ title: isNew ? "Bot creado" : "Bot actualizado" });
    onSaved();
  };

  return (
    <Dialog open={bot !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nuevo bot" : "Editar bot"}</DialogTitle>
          <DialogDescription>
            El motor base (no-alucinar, tono, uso de tools) es común. Acá definís lo específico de este bot.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <Label>Nombre *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Managers" />
              </div>
              <div className="flex-1 space-y-1">
                <Label>Departamento</Label>
                <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DEPTS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Modelo</Label>
              <Select
                value={form.model ? form.model : "default"}
                onValueChange={(v) => setForm({ ...form, model: v === "default" ? "" : v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Manual (prompt del depto)</Label>
              <Textarea
                value={form.manual_prompt ?? ""}
                onChange={(e) => setForm({ ...form, manual_prompt: e.target.value })}
                rows={8}
                placeholder="Vocabulario, objetivos y rutinas de este depto. Vacío = usa el manual de Ventas por defecto del código."
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>Llavero — tools permitidas</Label>
                <span className="text-[10px] text-muted-foreground">
                  {form.tool_allowlist == null ? "Todas habilitadas" : `${toolCount}/${TOOL_CATALOG.length} seleccionadas`}
                </span>
              </div>
              <div className="rounded-md border">
                <ScrollArea className="max-h-48">
                  <div className="divide-y">
                    {TOOL_CATALOG.map((t) => (
                      <label key={t.name} className="flex cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-muted/40">
                        <Checkbox checked={toolChecked(t.name)} onCheckedChange={() => toggleTool(t.name)} />
                        <span className="flex-1 truncate text-xs">
                          {t.label} <span className="text-muted-foreground">· {t.name}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              <p className="text-[10px] text-muted-foreground">Lo que destildes, el bot NO puede usar (ni lo "ve"). Sin tocar nada = todas.</p>
            </div>
            <label className="flex items-center gap-2 pt-1">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <span className="text-sm">Activo</span>
            </label>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving || !form.name.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BotsPage;
