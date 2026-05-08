import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Sparkles,
  Loader2,
  Building2,
  Save,
  Hash,
  Users,
  MapPin,
  Target,
  X,
  Pencil,
  Instagram,
  ToggleLeft,
  ToggleRight,
  Zap,
  Settings2,
  Play,
  UserCircle2,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useScouterCompaniesAll,
  useCreateCompany,
  useUpdateCompany,
  type ScouterCompany,
  type CompanySearchConfig,
} from "@/hooks/useScouterLeads";
import { supabase } from "@/integrations/supabase/client";
import {
  useSpammerAccounts,
  useInsertSpammerAccount,
  useUpdateSpammerAccount,
  type SpammerAccount,
  type AccountNiche,
} from "@/hooks/useSpammerAccounts";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentTenantId } from "@/hooks/useAgencyQa";
import { toast } from "sonner";

// ─── Asistente conversacional via edge fn `scouter-company-fill` ─────
// Reemplaza el one-shot Groq llama-3.1-8b que daba siempre la misma
// config genérica. Ahora la edge function (Gemini 2.5 flash) puede
// devolver una pregunta hacia el admin si le falta info crítica, o el
// config final cuando tiene suficiente.

interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

interface AssistantResponse {
  ready: boolean;
  question?: string;
  missing_field?: string;
  config?: CompanySearchConfig;
  summary?: string;
}

async function callFillAssistant(args: {
  name: string;
  description: string;
  current_config: CompanySearchConfig;
  messages: AssistantTurn[];
}): Promise<AssistantResponse> {
  const { data, error } = await supabase.functions.invoke<AssistantResponse>(
    "scouter-company-fill",
    {
      body: {
        name: args.name,
        description: args.description,
        current_config: args.current_config,
        messages: args.messages,
      },
    },
  );
  if (error) {
    const detail = (error as any)?.context?.body
      ? await (error as any).context.body
          .text()
          .catch(() => null)
      : null;
    throw new Error(detail || error.message || "Error invocando asistente");
  }
  if (!data) throw new Error("Respuesta vacía del asistente");
  return data;
}

// ─── Tag input helper ────────────────────────────────────────────────
const TagList = ({
  tags,
  onRemove,
  color = "default",
}: {
  tags: string[];
  onRemove?: (idx: number) => void;
  color?: "default" | "amber" | "green" | "blue";
}) => {
  const colorMap = {
    default: "bg-muted text-muted-foreground",
    amber: "bg-amber-400/15 text-amber-400 border-amber-400/30",
    green: "bg-emerald-400/15 text-emerald-400 border-emerald-400/30",
    blue: "bg-blue-400/15 text-blue-400 border-blue-400/30",
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${colorMap[color]}`}
        >
          {tag}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
};

// ─── Company Form (create / edit) ────────────────────────────────────
interface CompanyFormState {
  slug: string;
  name: string;
  description: string;
  active: boolean;
  search_config: CompanySearchConfig;
}

const emptyForm: CompanyFormState = {
  slug: "",
  name: "",
  description: "",
  active: true,
  search_config: {},
};

const CompanyFormModal = ({
  open,
  onClose,
  initial,
  companyId,
}: {
  open: boolean;
  onClose: () => void;
  initial?: CompanyFormState;
  companyId?: string; // if editing
}) => {
  const [form, setForm] = useState<CompanyFormState>(initial ?? emptyForm);
  const [aiLoading, setAiLoading] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [newSeed, setNewSeed] = useState("");

  // Conversacional fill state
  const [chatMessages, setChatMessages] = useState<AssistantTurn[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const isEditing = !!companyId;
  const saving = createCompany.isPending || updateCompany.isPending;

  const cfg = form.search_config;

  const updateConfig = (patch: Partial<CompanySearchConfig>) => {
    setForm((f) => ({ ...f, search_config: { ...f.search_config, ...patch } }));
  };

  // Procesa la respuesta del asistente: si vino una pregunta, la
  // acumula en el chat; si vino el config final, popula el form.
  const processAssistantResponse = useCallback(
    (resp: AssistantResponse) => {
      if (resp.ready && resp.config) {
        setForm((f) => ({
          ...f,
          search_config: {
            ...resp.config,
            ai_generated_at: new Date().toISOString(),
          } as CompanySearchConfig,
        }));
        setAiSummary(resp.summary || "Configuración generada.");
        setChatMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: resp.summary
              ? `✓ Listo. ${resp.summary}`
              : "✓ Configuración generada.",
          },
        ]);
        toast.success("Configuración generada por IA");
      } else if (resp.question) {
        setChatMessages((m) => [
          ...m,
          { role: "assistant", content: resp.question! },
        ]);
      }
    },
    [],
  );

  const startAiChat = useCallback(async () => {
    if (!form.description.trim() && !form.name.trim()) {
      toast.error("Escribí al menos el nombre o descripción de la compañía");
      return;
    }
    setChatOpen(true);
    setChatMessages([]);
    setAiSummary(null);
    setAiLoading(true);
    try {
      const resp = await callFillAssistant({
        name: form.name,
        description: form.description,
        current_config: form.search_config,
        messages: [],
      });
      processAssistantResponse(resp);
    } catch (e) {
      const msg = (e as Error).message || "Error invocando asistente";
      console.error("AI assistant failed:", e);
      toast.error(msg);
      setChatMessages([{ role: "assistant", content: `Error: ${msg}` }]);
    } finally {
      setAiLoading(false);
    }
  }, [form.name, form.description, form.search_config, processAssistantResponse]);

  const sendChatReply = useCallback(async () => {
    const reply = chatInput.trim();
    if (!reply || aiLoading) return;
    const next: AssistantTurn[] = [
      ...chatMessages,
      { role: "user", content: reply },
    ];
    setChatMessages(next);
    setChatInput("");
    setAiLoading(true);
    try {
      const resp = await callFillAssistant({
        name: form.name,
        description: form.description,
        current_config: form.search_config,
        messages: next,
      });
      processAssistantResponse(resp);
    } catch (e) {
      const msg = (e as Error).message || "Error invocando asistente";
      console.error("AI assistant failed:", e);
      toast.error(msg);
      setChatMessages((m) => [...m, { role: "assistant", content: `Error: ${msg}` }]);
    } finally {
      setAiLoading(false);
    }
  }, [chatInput, chatMessages, aiLoading, form.name, form.description, form.search_config, processAssistantResponse]);

  const finalizeWithBestEffort = useCallback(async () => {
    if (aiLoading) return;
    const next: AssistantTurn[] = [
      ...chatMessages,
      {
        role: "user",
        content: "Llená la config con la mejor inferencia que tengas con la info actual; no preguntes más. Si dudás, dejá las dudas en scoring_notes.",
      },
    ];
    setChatMessages(next);
    setAiLoading(true);
    try {
      const resp = await callFillAssistant({
        name: form.name,
        description: form.description,
        current_config: form.search_config,
        messages: next,
      });
      processAssistantResponse(resp);
    } catch (e) {
      const msg = (e as Error).message || "Error invocando asistente";
      toast.error(msg);
      setChatMessages((m) => [...m, { role: "assistant", content: `Error: ${msg}` }]);
    } finally {
      setAiLoading(false);
    }
  }, [aiLoading, chatMessages, form.name, form.description, form.search_config, processAssistantResponse]);

  const handleAiEnhance = startAiChat; // backward-compat para el botón existente

  const handleSave = async () => {
    const slug = form.slug.trim() || form.name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (!form.name.trim()) return;

    if (isEditing) {
      await updateCompany.mutateAsync({
        id: companyId,
        slug,
        name: form.name.trim(),
        description: form.description.trim() || null,
        active: form.active,
        search_config: form.search_config,
      });
    } else {
      await createCompany.mutateAsync({
        slug,
        name: form.name.trim(),
        description: form.description.trim() || null,
        active: form.active,
        search_config: form.search_config,
      });
    }
    onClose();
  };

  const addTag = (list: string[], val: string, key: keyof CompanySearchConfig) => {
    const clean = val.trim().replace(/^[#@]/, "");
    if (clean && !list.includes(clean)) {
      updateConfig({ [key]: [...list, clean] });
    }
  };

  const removeFromList = (list: string[], idx: number, key: keyof CompanySearchConfig) => {
    updateConfig({ [key]: list.filter((_, i) => i !== idx) });
  };

  const CONTENT_TYPES = [
    { value: "adult", label: "Adulto" },
    { value: "fitness", label: "Fitness" },
    { value: "lifestyle", label: "Lifestyle" },
    { value: "mixed", label: "Mixto" },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar compañía" : "Nueva compañía"}</DialogTitle>
          <DialogDescription>
            Describí tu compañía y usá "Mejorar con IA" para generar la configuración de búsqueda automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Basic info */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ej: ASM Tech"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Slug</label>
              <Input
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="asm_tech (auto si vacío)"
              />
            </div>
          </div>

          {/* Description + AI button */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground">
                Descripción (qué busca esta compañía)
              </label>
              <Button
                size="sm"
                variant="outline"
                onClick={handleAiEnhance}
                disabled={aiLoading || !form.description.trim()}
                className="gap-1.5 text-xs border-amber-400/40 text-amber-400 hover:bg-amber-400/10"
              >
                {aiLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Mejorar con IA
              </Button>
            </div>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Ej: Agencia de management de modelos de contenido para adultos. Buscamos creadoras emergentes de perfil bajo (10k-100k seguidores) en LATAM que ya tengan OnlyFans o similar..."
              className="min-h-[80px]"
            />
          </div>

          {/* Chat conversacional con el asistente IA */}
          {chatOpen && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                    Asistente IA · Gemini 2.5 Flash
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px]"
                  onClick={() => setChatOpen(false)}
                  disabled={aiLoading}
                >
                  Cerrar
                </Button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {chatMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`text-xs px-3 py-2 rounded-md ${
                      m.role === "assistant"
                        ? "bg-card border border-border"
                        : "bg-amber-400/10 border border-amber-400/20 ml-6"
                    }`}
                  >
                    <span className="font-medium opacity-70 text-[10px] uppercase tracking-wider mr-2">
                      {m.role === "assistant" ? "IA" : "Vos"}
                    </span>
                    {m.content}
                  </div>
                ))}
                {aiLoading && (
                  <div className="text-xs px-3 py-2 rounded-md bg-card border border-border opacity-60">
                    <Loader2 className="h-3 w-3 animate-spin inline mr-2" />
                    Pensando…
                  </div>
                )}
              </div>

              {!aiSummary && (
                <div className="flex items-end gap-2">
                  <Textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendChatReply();
                      }
                    }}
                    placeholder="Respondé la pregunta…"
                    className="min-h-[40px] max-h-[120px] text-xs"
                    disabled={aiLoading}
                  />
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button
                      size="sm"
                      onClick={sendChatReply}
                      disabled={aiLoading || !chatInput.trim()}
                      className="h-7 text-xs"
                    >
                      Enviar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={finalizeWithBestEffort}
                      disabled={aiLoading || chatMessages.length === 0}
                      className="h-7 text-[11px]"
                      title="Llenar con la mejor inferencia disponible"
                    >
                      Llená igual
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI-generated search config (visible after enhancement) */}
          {cfg.ai_generated_at && (
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-0.5">
              <div className="flex items-center gap-1.5 px-3 py-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[11px] font-semibold text-amber-400">
                  Configuración generada por IA
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {new Date(cfg.ai_generated_at).toLocaleString("es-CO")}
                </span>
              </div>
            </div>
          )}

          {/* Content type + Profile tier */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                <Target className="inline h-3 w-3 mr-1" />
                Tipo de contenido
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CONTENT_TYPES.map((ct) => (
                  <button
                    key={ct.value}
                    type="button"
                    onClick={() => updateConfig({ content_type: ct.value })}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      cfg.content_type === ct.value
                        ? "border-amber-400 bg-amber-400/15 text-amber-400"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                <Users className="inline h-3 w-3 mr-1" />
                Tier / perfil objetivo (libre)
              </label>
              <Input
                value={cfg.profile_tier ?? ""}
                onChange={(e) => updateConfig({ profile_tier: e.target.value || null })}
                placeholder="Ej: creators que reciben pagos en EUR, modelos emergentes LATAM, fitness premium, etc."
                className="text-sm"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Describí en tus palabras qué perfil de creator buscás. Dejá vacío si la compañía no segmenta por tipo.
              </p>
            </div>
          </div>

          {/* Followers range */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Followers mín.</label>
              <Input
                type="number"
                value={cfg.followers_min ?? ""}
                onChange={(e) => updateConfig({ followers_min: Number(e.target.value) || undefined })}
                placeholder="10000"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Followers máx.</label>
              <Input
                type="number"
                value={cfg.followers_max ?? ""}
                onChange={(e) => updateConfig({ followers_max: Number(e.target.value) || undefined })}
                placeholder="500000"
              />
            </div>
          </div>

          {/* Hashtags */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              <Hash className="inline h-3 w-3 mr-1" />
              Hashtags de búsqueda
            </label>
            <TagList
              tags={cfg.hashtags ?? []}
              onRemove={(i) => removeFromList(cfg.hashtags ?? [], i, "hashtags")}
              color="amber"
            />
            <div className="flex gap-2 mt-1.5">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(cfg.hashtags ?? [], newTag, "hashtags");
                    setNewTag("");
                  }
                }}
                placeholder="Agregar hashtag…"
                className="text-xs"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  addTag(cfg.hashtags ?? [], newTag, "hashtags");
                  setNewTag("");
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Seed accounts */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              <Users className="inline h-3 w-3 mr-1" />
              Cuentas semilla
            </label>
            <TagList
              tags={cfg.seed_accounts ?? []}
              onRemove={(i) => removeFromList(cfg.seed_accounts ?? [], i, "seed_accounts")}
              color="blue"
            />
            <div className="flex gap-2 mt-1.5">
              <Input
                value={newSeed}
                onChange={(e) => setNewSeed(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(cfg.seed_accounts ?? [], newSeed, "seed_accounts");
                    setNewSeed("");
                  }
                }}
                placeholder="@handle de referencia…"
                className="text-xs"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  addTag(cfg.seed_accounts ?? [], newSeed, "seed_accounts");
                  setNewSeed("");
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Geo targets */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              <MapPin className="inline h-3 w-3 mr-1" />
              Regiones objetivo
            </label>
            <div className="flex flex-wrap gap-1.5">
              {["LATAM", "US", "Europe", "Asia", "Global"].map((geo) => (
                <button
                  key={geo}
                  type="button"
                  onClick={() => {
                    const current = cfg.geo_targets ?? [];
                    updateConfig({
                      geo_targets: current.includes(geo)
                        ? current.filter((g) => g !== geo)
                        : [...current, geo],
                    });
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    (cfg.geo_targets ?? []).includes(geo)
                      ? "border-blue-400 bg-blue-400/15 text-blue-400"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {geo}
                </button>
              ))}
            </div>
          </div>

          {/* Scoring notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Notas para el scorer IA
            </label>
            <Textarea
              value={cfg.scoring_notes ?? ""}
              onChange={(e) => updateConfig({ scoring_notes: e.target.value })}
              placeholder="Instrucciones adicionales para la IA al evaluar leads para esta compañía…"
              className="min-h-[60px] text-xs"
            />
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              className="rounded"
            />
            <span className="text-sm">Compañía activa</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            {isEditing ? "Guardar" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Company card ────────────────────────────────────────────────────
const CompanyCard = ({
  company,
  onEdit,
}: {
  company: ScouterCompany;
  /** Si es undefined, la card es read-only (sin botón Editar). Lo
   *  controla el permiso "Editar Compañías" del rol del usuario. */
  onEdit?: () => void;
}) => {
  const cfg = company.search_config ?? {};
  const hashtags = cfg.hashtags ?? [];
  const seeds = cfg.seed_accounts ?? [];
  const geos = cfg.geo_targets ?? [];

  return (
    <Card className="relative group">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{company.name}</CardTitle>
            {!company.active && (
              <Badge variant="secondary" className="text-[10px]">
                Inactiva
              </Badge>
            )}
          </div>
          {onEdit && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onEdit}
              className="opacity-60 group-hover:opacity-100 gap-1 text-xs"
            >
              <Pencil className="h-3 w-3" />
              Editar
            </Button>
          )}
        </div>
        <span className="text-[11px] font-mono text-muted-foreground">{company.slug}</span>
      </CardHeader>
      <CardContent className="space-y-2">
        {company.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{company.description}</p>
        )}

        {/* Search config summary */}
        {cfg.ai_generated_at ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {cfg.content_type && (
                <Badge variant="outline" className="text-[10px] border-amber-400/40 text-amber-400">
                  {cfg.content_type}
                </Badge>
              )}
              {cfg.profile_tier && (
                <Badge variant="outline" className="text-[10px] border-emerald-400/40 text-emerald-400">
                  {cfg.profile_tier}
                </Badge>
              )}
              {cfg.followers_min != null && (
                <Badge variant="outline" className="text-[10px]">
                  {(cfg.followers_min / 1000).toFixed(0)}k–{((cfg.followers_max ?? 500000) / 1000).toFixed(0)}k
                </Badge>
              )}
              {geos.map((g) => (
                <Badge key={g} variant="outline" className="text-[10px] border-blue-400/40 text-blue-400">
                  {g}
                </Badge>
              ))}
            </div>
            {hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {hashtags.slice(0, 6).map((h) => (
                  <span key={h} className="text-[10px] text-amber-400/70">#{h}</span>
                ))}
                {hashtags.length > 6 && (
                  <span className="text-[10px] text-muted-foreground">+{hashtags.length - 6}</span>
                )}
              </div>
            )}
            {seeds.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {seeds.slice(0, 4).map((s) => (
                  <span key={s} className="text-[10px] text-blue-400/70">@{s.replace(/^@/, "")}</span>
                ))}
                {seeds.length > 4 && (
                  <span className="text-[10px] text-muted-foreground">+{seeds.length - 4}</span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-md border border-dashed border-amber-400/30 bg-amber-400/5 px-3 py-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[11px] text-amber-400">
              Sin configuración IA — editá y usá "Mejorar con IA"
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Niche badge colors ──────────────────────────────────────────────
const NICHE_COLORS: Record<string, string> = {
  lifestyle: "border-violet-400/40 text-violet-400",
  fitness: "border-emerald-400/40 text-emerald-400",
  adult: "border-pink-400/40 text-pink-400",
  business: "border-blue-400/40 text-blue-400",
  mixed: "border-amber-400/40 text-amber-400",
};

// ─── Spammer Account row ─────────────────────────────────────────────
const SpammerAccountRow = ({ account }: { account: SpammerAccount }) => {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(account.display_name);
  const [niche, setNiche] = useState<AccountNiche>(account.account_niche as AccountNiche);
  const updateAccount = useUpdateSpammerAccount();

  const handleSave = async () => {
    await updateAccount.mutateAsync({ id: account.id, display_name: displayName, account_niche: niche });
    setEditing(false);
  };

  const handleToggleActive = () => {
    updateAccount.mutate({ id: account.id, active: !account.active });
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
      {/* Avatar */}
      {account.profile_pic_url ? (
        <img
          src={account.profile_pic_url}
          alt={account.instagram_handle}
          className="h-9 w-9 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted flex-shrink-0">
          <UserCircle2 className="h-5 w-5 text-muted-foreground" />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="h-7 text-xs max-w-[140px]"
            />
            <Select value={niche} onValueChange={(v) => setNiche(v as AccountNiche)}>
              <SelectTrigger className="h-7 text-xs w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["lifestyle", "fitness", "adult", "business", "mixed"] as AccountNiche[]).map((n) => (
                  <SelectItem key={n} value={n} className="text-xs capitalize">
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={handleSave}
              disabled={updateAccount.isPending}
            >
              {updateAccount.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium truncate">{account.display_name}</span>
            <span className="text-[11px] text-muted-foreground">@{account.instagram_handle}</span>
            <Badge
              variant="outline"
              className={`text-[10px] capitalize ${NICHE_COLORS[account.account_niche] ?? ""}`}
            >
              {account.account_niche}
            </Badge>
            {!account.active && (
              <Badge variant="secondary" className="text-[10px]">
                Inactiva
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {!editing && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs opacity-60 hover:opacity-100"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={updateAccount.isPending}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title={account.active ? "Desactivar" : "Activar"}
          >
            {account.active ? (
              <ToggleRight className="h-5 w-5 text-emerald-400" />
            ) : (
              <ToggleLeft className="h-5 w-5" />
            )}
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Cuentas Spammer section ─────────────────────────────────────────

const MAX_SPAMMER_ACCOUNTS = 4;
const IG_HANDLE_REGEX = /^[a-zA-Z0-9_.]{1,30}$/;

const SpammerAccountsSection = () => {
  const accountsQ = useSpammerAccounts();
  const accounts = accountsQ.data ?? [];
  const { isAdmin, isManager } = useUserRole();
  const insertAccount = useInsertSpammerAccount();

  const [showAdd, setShowAdd] = useState(false);
  const [newHandle, setNewHandle] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newNiche, setNewNiche] = useState<AccountNiche | "">("");

  const cleanedHandle = newHandle.trim().replace(/^@+/, "");
  const handleError =
    cleanedHandle.length > 0 && !IG_HANDLE_REGEX.test(cleanedHandle)
      ? "Solo letras, números, puntos y guiones bajos (máx 30)."
      : null;
  const canSave =
    cleanedHandle.length > 0 &&
    !handleError &&
    newDisplayName.trim().length > 0 &&
    newNiche !== "";

  const handleAddAccount = async () => {
    if (!canSave) return;
    try {
      await insertAccount.mutateAsync({
        instagram_handle: cleanedHandle,
        display_name: newDisplayName.trim(),
        account_niche: newNiche as AccountNiche,
      });
      setNewHandle("");
      setNewDisplayName("");
      setNewNiche("");
      setShowAdd(false);
      toast.success("Cuenta agregada correctamente");
    } catch {
      // toast shown by mutation onError
    }
  };

  const canAddMore = accounts.length < MAX_SPAMMER_ACCOUNTS;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Instagram className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Cuentas Spammer</CardTitle>
            </div>
            <CardDescription className="text-xs mt-1">
              {isAdmin || isManager
                ? "Todas las cuentas registradas en el tenant."
                : "Tus cuentas spammer registradas."}
            </CardDescription>
          </div>
          {canAddMore && !showAdd && !accountsQ.isLoading && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => setShowAdd(true)}
            >
              <Plus className="h-3 w-3" />
              Agregar cuenta
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {accountsQ.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            {accounts.length === 0 && !showAdd ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
                <Instagram className="mx-auto h-7 w-7 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">No hay cuentas registradas</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Completá el asistente de bienvenida en "Mis Tareas" o usá el botón "Agregar cuenta".
                </p>
              </div>
            ) : (
              accounts.map((acc) => (
                <SpammerAccountRow key={acc.id} account={acc} />
              ))
            )}

            {/* Inline add-account form */}
            {showAdd && (
              <div className="rounded-lg border border-dashed border-amber-400/40 bg-amber-400/5 p-3 space-y-2.5">
                <p className="text-xs font-medium text-amber-400">Nueva cuenta</p>

                {/* Handle */}
                <div>
                  <div className="flex items-center gap-0">
                    <div className="flex h-8 items-center rounded-l-md border border-r-0 border-input bg-muted px-2.5 text-xs text-muted-foreground select-none">
                      @
                    </div>
                    <Input
                      value={newHandle}
                      onChange={(e) => setNewHandle(e.target.value)}
                      placeholder="handle_de_instagram"
                      className={`h-8 text-xs rounded-l-none ${handleError ? "border-destructive" : ""}`}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                  {handleError && (
                    <p className="mt-0.5 text-[10px] text-destructive">{handleError}</p>
                  )}
                </div>

                {/* Display name + niche */}
                <div className="flex items-center gap-2">
                  <Input
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder="Nombre descriptivo"
                    className="h-8 text-xs flex-1"
                  />
                  <Select value={newNiche} onValueChange={(v) => setNewNiche(v as AccountNiche)}>
                    <SelectTrigger className="h-8 text-xs w-[120px]">
                      <SelectValue placeholder="Nicho…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(["lifestyle", "fitness", "adult", "business", "mixed"] as AccountNiche[]).map((n) => (
                        <SelectItem key={n} value={n} className="text-xs capitalize">
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-1.5 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => {
                      setShowAdd(false);
                      setNewHandle("");
                      setNewDisplayName("");
                      setNewNiche("");
                    }}
                    disabled={insertAccount.isPending}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={handleAddAccount}
                    disabled={!canSave || insertAccount.isPending}
                  >
                    {insertAccount.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    Guardar
                  </Button>
                </div>
              </div>
            )}

            {/* Capacity indicator */}
            {accounts.length > 0 && (
              <p className="text-[10px] text-muted-foreground pt-1">
                {accounts.length}/{MAX_SPAMMER_ACCOUNTS} cuentas registradas
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Generación Diaria section ────────────────────────────────────────
const DailyGenerationSection = () => {
  const { isAdmin, isManager } = useUserRole();
  const tenantQ = useCurrentTenantId();
  const tenantId = tenantQ.data ?? null;

  const [cooldownDays, setCooldownDays] = useState(3);
  const [batchSize, setBatchSize] = useState(50);
  const [generating, setGenerating] = useState(false);

  if (!isAdmin && !isManager) return null;

  const handleGenerate = async () => {
    if (!tenantId) {
      toast.error("No se pudo obtener el tenant ID.");
      return;
    }
    setGenerating(true);
    try {
      const { error } = await supabase.functions.invoke("scouter-generate-tasks", {
        body: { tenant_id: tenantId, cooldown_days: cooldownDays, batch_size: batchSize },
      });
      if (error) throw error;
      toast.success("Generación iniciada correctamente", {
        description: `Se procesarán hasta ${batchSize} leads con cooldown de ${cooldownDays} días.`,
      });
    } catch (e) {
      toast.error("Error al generar tareas", { description: (e as Error).message });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Generación Diaria</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Generá tareas de interacción manualmente o ajustá los parámetros del cron diario.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Cooldown (días)
            </label>
            <Input
              type="number"
              min={1}
              max={30}
              value={cooldownDays}
              onChange={(e) => setCooldownDays(Math.max(1, Number(e.target.value) || 1))}
              className="text-sm"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Días sin reasignar el mismo lead. Default: 3.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Batch size
            </label>
            <Input
              type="number"
              min={1}
              max={200}
              value={batchSize}
              onChange={(e) => setBatchSize(Math.max(1, Number(e.target.value) || 1))}
              className="text-sm"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Leads procesados por ejecución. Default: 50.
            </p>
          </div>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={generating || !tenantId}
          className="gap-2"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {generating ? "Generando…" : "Generar tareas ahora"}
        </Button>

        {!tenantId && !tenantQ.isLoading && (
          <p className="text-[11px] text-destructive">
            No se pudo resolver el tenant ID. Verificá tu sesión.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Main ────────────────────────────────────────────────────────────
const ScouterSettings = () => {
  const companiesQ = useScouterCompaniesAll();
  const companies = companiesQ.data ?? [];
  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<ScouterCompany | null>(null);
  // Gate del create/edit. Default false hasta que el rol tenga el
  // submódulo "Editar Compañías" activado en Settings → Roles. Sin
  // este permiso, la UI muestra las cards en read-only — el usuario
  // todavía ve la configuración pero no la puede modificar.
  const { canAccess } = usePermissions();
  const canEditCompanies = canAccess("Scouter Assist", "Editar Compañías");

  const handleNew = () => {
    if (!canEditCompanies) return;
    setEditingCompany(null);
    setShowForm(true);
  };

  const handleEdit = (c: ScouterCompany) => {
    if (!canEditCompanies) return;
    setEditingCompany(c);
    setShowForm(true);
  };

  const handleClose = () => {
    setShowForm(false);
    setEditingCompany(null);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Compañías</h2>
          <p className="text-xs text-muted-foreground">
            Configurá qué busca cada compañía. Usá "Mejorar con IA" para generar filtros automáticamente.
          </p>
        </div>
        {canEditCompanies && (
          <Button onClick={handleNew} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nueva compañía
          </Button>
        )}
      </div>

      {/* Company grid */}
      {companiesQ.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : companies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center">
          <Building2 className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Sin compañías todavía</p>
          {canEditCompanies ? (
            <>
              <p className="text-xs text-muted-foreground mb-4">
                Creá tu primera compañía para empezar a configurar las búsquedas.
              </p>
              <Button onClick={handleNew} variant="outline" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Crear compañía
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Pedile a un admin que cree las compañías o que active tu permiso "Editar Compañías".
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <CompanyCard
              key={c.id}
              company={c}
              onEdit={canEditCompanies ? () => handleEdit(c) : undefined}
            />
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <CompanyFormModal
          open={showForm}
          onClose={handleClose}
          companyId={editingCompany?.id}
          initial={
            editingCompany
              ? {
                  slug: editingCompany.slug,
                  name: editingCompany.name,
                  description: editingCompany.description ?? "",
                  active: editingCompany.active,
                  search_config: editingCompany.search_config ?? {},
                }
              : undefined
          }
        />
      )}

      {/* Cuentas Spammer section */}
      <SpammerAccountsSection />

      {/* Generación Diaria section (admin/manager only) */}
      <DailyGenerationSection />
    </div>
  );
};

export default ScouterSettings;
