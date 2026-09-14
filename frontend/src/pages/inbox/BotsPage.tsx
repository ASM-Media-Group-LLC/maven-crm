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
import { Bot, Plus, Loader2, Radio, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

// Fuera de un componente no hay hook: los catálogos guardan la CLAVE y el texto
// lo resuelve la t() de quien los dibuja.
const DEPTS: { value: string; key: TranslationKey }[] = [
  { value: "sales", key: "wa.deptSales" },
  { value: "closer", key: "wa.deptClosers" },
  { value: "manager", key: "wa.deptManagers" },
  { value: "recruitment", key: "wa.deptRecruitment" },
  { value: "chatter", key: "wa.deptChatters" },
  { value: "other", key: "wa.deptOther" },
];
// Radix Select no admite value="" → usamos "default" como sentinela del router.
const MODELS: { value: string; key: TranslationKey }[] = [
  { value: "default", key: "wa.modelDefault" },
  { value: "claude-sonnet-4-6", key: "wa.modelSonnet" },
  { value: "claude-haiku-4-5", key: "wa.modelHaiku" },
];
// Catálogo del Llavero: nombre = la tool en el agent; label legible. Vacío = todas.
const TOOL_CATALOG: string[] = [
  "reply_to_group",
  "search_messages",
  "search_maven_leads",
  "get_lead_details",
  "lookup_lead_history",
  "mark_lead_stage",
  "add_note_to_lead",
  "get_unassigned_leads",
  "get_closer_pipeline_status",
  "analyze_instagram_lead",
  "analyze_profile_deep",
  "get_member_stats",
  "get_member_maven_activity",
  "get_team_ranking",
  "get_team_schedule",
  "register_day_off",
  "get_llg_account_status",
  "list_commitments",
  "resolve_commitment",
  "snooze_commitment",
  "create_reminder",
  "register_daily_report",
  "validate_report_vs_maven",
  "get_monetization_opportunities",
  "log_monetization_opportunity",
  "add_persistent_rule",
  "list_rules",
  "deactivate_rule",
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
  const { t } = useLanguage();
  const deptLabel = (d: string) => {
    const e = DEPTS.find((x) => x.value === d);
    return e ? t(e.key) : d;
  };
  const modelLabel = (m: string | null) => {
    const e = MODELS.find((x) => x.value === (m || "default"));
    return e ? t(e.key) : m;
  };
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
    // El AppShell da `h-dvh` + `overflow-hidden` y cada página pone su propio
    // scroll: sin este contenedor, lo que pasa de una pantalla queda recortado
    // y no hay forma de llegar. `min-h-0` es imprescindible para que el hijo
    // pueda encogerse dentro de la columna flex.
    <main className="flex-1 min-h-0 overflow-y-auto">
      <div className="space-y-4 px-6 py-5">
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 -ml-1" title={t("wa.backToInbox")}>
        <Link to="/inbox"><ArrowLeft className="h-4 w-4" /></Link>
      </Button>
      <PageHeader
        title={t("wa.botsTitle")}
        subtitle={t("wa.botsSubtitle")}
        icon={<Bot />}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/inbox/canales"><Radio className="h-4 w-4" /> {t("wa.lines")}</Link>
            </Button>
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> {t("wa.newBot")}
            </Button>
          </>
        }
      />

      <div className="rounded-md border">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("common.loading")}
          </div>
        ) : bots.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {t("wa.noBots")}
          </div>
        ) : (
          <table className="tabla-movil w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">{t("wa.bot")}</th>
                <th className="px-3 py-2 font-medium">{t("wa.dept")}</th>
                <th className="px-3 py-2 font-medium">{t("wa.model")}</th>
                <th className="px-3 py-2 font-medium">{t("wa.keyring")}</th>
                <th className="px-3 py-2 font-medium">{t("wa.manual")}</th>
                <th className="px-3 py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {bots.map((b) => (
                <tr key={b.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">
                    {b.name}
                    {!b.active && <Badge variant="secondary-soft" className="ml-1 text-[10px]">{t("wa.inactiveLower")}</Badge>}
                  </td>
                  <td className="px-3 py-2"><Badge variant="secondary-soft" className="text-[10px]">{deptLabel(b.department)}</Badge></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{modelLabel(b.model)}</td>
                  <td className="px-3 py-2 text-xs">{b.tool_allowlist == null ? t("common.allF") : t("wa.nTools", { n: b.tool_allowlist.length })}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{b.manual_prompt ? t("wa.nChars", { n: b.manual_prompt.length }) : t("wa.defaultEngine")}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(b)}>{t("common.edit")}</Button>
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
    </main>
  );
};

const BotDialog = ({
  bot, onClose, onSaved,
}: {
  bot: WaBot | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { t } = useLanguage();
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
      const base = f.tool_allowlist == null ? [...TOOL_CATALOG] : [...f.tool_allowlist];
      const i = base.indexOf(name);
      if (i >= 0) base.splice(i, 1); else base.push(name);
      return { ...f, tool_allowlist: base.length === TOOL_CATALOG.length ? null : base };
    });
  };
  const toolChecked = (name: string) => form.tool_allowlist == null || form.tool_allowlist.includes(name);
  const toolCount = form.tool_allowlist == null ? TOOL_CATALOG.length : form.tool_allowlist.length;

  const save = async () => {
    if (!form.name.trim()) { toast({ title: t("wa.missingName"), variant: "destructive" }); return; }
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
    if (error) { toast({ title: t("common.couldNotSave"), description: error.message, variant: "destructive" }); return; }
    toast({ title: isNew ? t("wa.botCreated") : t("wa.botUpdated") });
    onSaved();
  };

  return (
    <Dialog open={bot !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? t("wa.newBot") : t("wa.editBot")}</DialogTitle>
          <DialogDescription>
            {t("wa.botDialogDesc")}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <Label>{t("wa.nameRequired")}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("wa.botNamePlaceholder")} />
              </div>
              <div className="flex-1 space-y-1">
                <Label>{t("wa.department")}</Label>
                <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DEPTS.map((d) => <SelectItem key={d.value} value={d.value}>{t(d.key)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t("wa.model")}</Label>
              <Select
                value={form.model ? form.model : "default"}
                onValueChange={(v) => setForm({ ...form, model: v === "default" ? "" : v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{t(m.key)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("wa.manualPrompt")}</Label>
              <Textarea
                value={form.manual_prompt ?? ""}
                onChange={(e) => setForm({ ...form, manual_prompt: e.target.value })}
                rows={8}
                placeholder={t("wa.manualPlaceholder")}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>{t("wa.keyringTools")}</Label>
                <span className="text-[10px] text-muted-foreground">
                  {form.tool_allowlist == null ? t("wa.allEnabled") : t("wa.nSelected", { n: toolCount, total: TOOL_CATALOG.length })}
                </span>
              </div>
              <div className="rounded-md border">
                <ScrollArea className="max-h-48">
                  <div className="divide-y">
                    {TOOL_CATALOG.map((nombre) => (
                      <label key={nombre} className="flex cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-muted/40">
                        <Checkbox checked={toolChecked(nombre)} onCheckedChange={() => toggleTool(nombre)} />
                        <span className="flex-1 truncate text-xs">
                          {t(`wa.tool.${nombre}` as TranslationKey)} <span className="text-muted-foreground">· {nombre}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              <p className="text-[10px] text-muted-foreground">{t("wa.keyringHint")}</p>
            </div>
            <label className="flex items-center gap-2 pt-1">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <span className="text-sm">{t("common.active")}</span>
            </label>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={saving || !form.name.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BotsPage;
