import { useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertCircle,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  MessageCircle,
  Send,
  Settings,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useAskWhatsappAgent,
  useLinkWhatsappMember,
  useMavenUsersForLink,
  useResolveCommitment,
  useToggleWhatsappBot,
  useUpdateBotPersona,
  useWaBots,
  useAssignBotToGroup,
  useWhatsappBotEvents,
  useWhatsappCommitments,
  useWhatsappDailyReports,
  useWhatsappGroupCosts,
  useWhatsappGroups,
  useWhatsappGroupSummary,
  useWhatsappMembers,
  useWhatsappRecentMessages,
  type WhatsappCommitment,
  type WhatsappCostRow,
  type WhatsappDailyReport,
  type WhatsappGroup,
  type WhatsappMember,
  type WhatsappMessage,
} from "@/hooks/useWhatsappAgent";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, Link2, Link2Off } from "lucide-react";

// Tab del panel admin para gestionar el agente de WhatsApp.
//
// Layout:
//   [Lista de grupos] ─────── [Drill-in del grupo seleccionado]
//                              ├ resumen + toggle bot_enabled
//                              ├ Tabs: Compromisos | Mensajes | Eventos | Persona
//                              └ Caja "preguntale al bot" abajo
//
// Permisos: este tab está bajo PanelDeControl que ya filtra a admins/owners.
// Los hooks usan RLS — un user normal vería 0 grupos. Si esto se expone a
// más roles, agregar un guard explícito acá.

export default function WhatsappAgentTab() {
  const { data: groups, isLoading } = useWhatsappGroups();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const selectedGroup = useMemo(
    () => groups?.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  // Auto-select primero si no hay nada seleccionado.
  if (!selectedGroupId && groups && groups.length > 0) {
    setSelectedGroupId(groups[0].id);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Bot className="h-5 w-5 animate-pulse text-muted-foreground" />
      </div>
    );
  }

  if (!groups || groups.length === 0) {
    return (
      <Card className="p-8 text-center space-y-3">
        <Bot className="h-10 w-10 text-muted-foreground mx-auto" />
        <h3 className="text-lg font-semibold">No hay grupos de WhatsApp configurados</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Para empezar, conectá un provider (Evolution API o similar) y agregá el bot a un
          grupo del equipo. El primer mensaje que reciba va a aparecer en los eventos como{" "}
          <code className="text-xs bg-muted px-1 rounded">group_not_registered</code> y desde
          ahí podés activar el grupo.
        </p>
        <p className="text-xs text-muted-foreground">
          La doc del setup está en el repo, en{" "}
          <code className="text-xs bg-muted px-1 rounded">supabase/functions/whatsapp-ingest</code>.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <GroupsList
        groups={groups}
        selectedId={selectedGroupId}
        onSelect={setSelectedGroupId}
      />
      {selectedGroup && <GroupDetail group={selectedGroup} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Groups list (sidebar)
// ─────────────────────────────────────────────────────────────────────────
function GroupsList({
  groups,
  selectedId,
  onSelect,
}: {
  groups: WhatsappGroup[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <button
          key={g.id}
          onClick={() => onSelect(g.id)}
          className={cn(
            "w-full text-left p-3 rounded-lg border transition-colors",
            selectedId === g.id
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-muted/50",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{g.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {g.provider}
                {g.last_message_at && (
                  <> · {format(new Date(g.last_message_at), "d MMM HH:mm", { locale: es })}</>
                )}
              </div>
            </div>
            <div className="shrink-0">
              {g.bot_enabled ? (
                <Badge variant="default" className="text-[10px] gap-1 py-0">
                  <Sparkles className="h-2.5 w-2.5" /> on
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] py-0">
                  off
                </Badge>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Group detail
// ─────────────────────────────────────────────────────────────────────────
function GroupDetail({ group }: { group: WhatsappGroup }) {
  const { data: summary } = useWhatsappGroupSummary(group.id);
  const toggleMut = useToggleWhatsappBot();
  const bots = useWaBots();
  const assignMut = useAssignBotToGroup();
  const [askOpen, setAskOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-semibold truncate">{group.name}</h2>
              <Badge variant="outline" className="text-[10px]">{group.provider}</Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              <code>{group.external_id}</code>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Bot</span>
              <Switch
                checked={group.bot_enabled}
                onCheckedChange={(v) =>
                  toggleMut.mutate({ groupId: group.id, enabled: v })
                }
                disabled={toggleMut.isPending}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              title="Configurar persona"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Bot asignado (Fase 6): qué bot (wa_bots) atiende este grupo. */}
        <div className="mt-3 flex items-center gap-2 border-t pt-3">
          <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground shrink-0">Bot asignado:</span>
          <Select
            value={group.wa_bot_id ?? "none"}
            onValueChange={(v) => assignMut.mutate({ groupId: group.id, botId: v === "none" ? null : v })}
            disabled={assignMut.isPending}
          >
            <SelectTrigger className="h-8 w-72 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin bot (motor + manual de Ventas por defecto)</SelectItem>
              {(bots.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t">
          <Stat label="Mensajes" value={summary?.message_count ?? 0} icon={MessageCircle} />
          <Stat label="Pendientes" value={summary?.open_commitments ?? 0} icon={Clock} accent="overdue" />
          <Stat label="Miembros" value={summary?.member_count ?? 0} icon={Users} />
        </div>
      </Card>

      {/* Costos del bot */}
      <CostsCard groupId={group.id} />

      {/* Tabs */}
      <Tabs defaultValue="commitments">
        <TabsList>
          <TabsTrigger value="commitments">Compromisos</TabsTrigger>
          <TabsTrigger value="reports">Reportes diarios</TabsTrigger>
          <TabsTrigger value="messages">Mensajes</TabsTrigger>
          <TabsTrigger value="members">Miembros</TabsTrigger>
          <TabsTrigger value="events">Eventos</TabsTrigger>
        </TabsList>

        <TabsContent value="commitments" className="mt-3">
          <CommitmentsList groupId={group.id} />
        </TabsContent>

        <TabsContent value="reports" className="mt-3">
          <DailyReportsList groupId={group.id} />
        </TabsContent>

        <TabsContent value="messages" className="mt-3">
          <MessagesList groupId={group.id} />
        </TabsContent>

        <TabsContent value="members" className="mt-3">
          <MembersList groupId={group.id} />
        </TabsContent>

        <TabsContent value="events" className="mt-3">
          <EventsList groupId={group.id} />
        </TabsContent>
      </Tabs>

      {/* Pregunta al bot */}
      <Card className="p-4 border-dashed">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Preguntale al bot</p>
            <p className="text-xs text-muted-foreground">
              Probá una pregunta sin escribir en el grupo. La respuesta se manda igual al
              grupo (si bot_enabled está on).
            </p>
          </div>
          <Button onClick={() => setAskOpen(true)} className="shrink-0">
            <Send className="h-4 w-4 mr-1.5" /> Preguntar
          </Button>
        </div>
      </Card>

      <AskAgentDialog open={askOpen} onOpenChange={setAskOpen} group={group} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} group={group} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────
function Stat({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "overdue";
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn(
        "p-2 rounded-md",
        accent === "overdue" && value > 0
          ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
          : "bg-muted text-muted-foreground",
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-xl font-semibold leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  );
}

function CommitmentsList({ groupId }: { groupId: string }) {
  const [status, setStatus] = useState<WhatsappCommitment["status"] | "all">("pending");
  const { data: rows, isLoading } = useWhatsappCommitments(groupId, status);
  const resolveMut = useResolveCommitment();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {(["pending", "overdue", "done", "stale", "cancelled", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              "px-2.5 py-1 text-xs rounded-md transition-colors",
              status === s ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading && <div className="text-xs text-muted-foreground">cargando…</div>}
      {rows && rows.length === 0 && (
        <Card className="p-4 text-center text-xs text-muted-foreground">
          No hay compromisos con status <code>{status}</code>.
        </Card>
      )}

      {rows?.map((c) => (
        <Card key={c.id} className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm">{c.subject}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {c.committed_by_text && <span>por <strong>{c.committed_by_text}</strong></span>}
                {c.due_at && (
                  <>
                    {" · "}
                    <Calendar className="inline h-3 w-3 mr-0.5" />
                    {format(new Date(c.due_at), "d MMM HH:mm", { locale: es })}
                  </>
                )}
                {c.followup_count > 0 && (
                  <> · {c.followup_count} recordatorio(s) enviado(s)</>
                )}
              </div>
              {c.resolution_note && (
                <div className="text-xs mt-1.5 italic text-muted-foreground">
                  {c.resolution_note}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={c.status} />
              {(c.status === "pending" || c.status === "overdue") && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => resolveMut.mutate({ id: c.id, outcome: "done" })}
                    className="h-7 text-xs gap-1"
                  >
                    <CheckCircle2 className="h-3 w-3" /> hecho
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => resolveMut.mutate({ id: c.id, outcome: "cancelled" })}
                    className="h-7 text-xs gap-1"
                  >
                    <XCircle className="h-3 w-3" /> cancelar
                  </Button>
                </>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: WhatsappCommitment["status"] }) {
  const meta: Record<WhatsappCommitment["status"], { label: string; cls: string }> = {
    pending: { label: "pending", cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    overdue: { label: "overdue", cls: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
    done: { label: "done", cls: "bg-green-500/10 text-green-600 dark:text-green-400" },
    stale: { label: "stale", cls: "bg-muted text-muted-foreground" },
    cancelled: { label: "cancelled", cls: "bg-muted text-muted-foreground line-through" },
  };
  const m = meta[status];
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", m.cls)}>
      {m.label}
    </span>
  );
}

function MessagesList({ groupId }: { groupId: string }) {
  const { data: msgs, isLoading } = useWhatsappRecentMessages(groupId);
  if (isLoading) return <div className="text-xs text-muted-foreground">cargando…</div>;
  if (!msgs || msgs.length === 0) {
    return (
      <Card className="p-4 text-center text-xs text-muted-foreground">
        Sin mensajes todavía.
      </Card>
    );
  }
  return (
    <Card className="p-3 space-y-2 max-h-[500px] overflow-y-auto">
      {msgs.map((m) => (
        <MessageRow key={m.id} msg={m} />
      ))}
    </Card>
  );
}

function MessageRow({ msg }: { msg: WhatsappMessage }) {
  return (
    <div className={cn(
      "p-2 rounded-md text-sm",
      msg.is_from_bot ? "bg-primary/5 ml-8" : "bg-muted/30",
    )}>
      <div className="flex items-baseline justify-between gap-2 mb-0.5">
        <span className={cn(
          "text-xs font-medium",
          msg.is_from_bot && "text-primary",
        )}>
          {msg.is_from_bot ? "🤖 Maven Asistente" : (msg.sender_display_name ?? "anon")}
        </span>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {format(new Date(msg.sent_at), "d MMM HH:mm", { locale: es })}
        </span>
      </div>
      <div className="text-sm whitespace-pre-wrap break-words">{msg.body ?? <em className="text-muted-foreground">[{msg.msg_type}]</em>}</div>
      {msg.analysis && (msg.analysis as { commitments_extracted?: number }).commitments_extracted ? (
        <div className="text-[10px] text-muted-foreground mt-1">
          → {(msg.analysis as { commitments_extracted?: number }).commitments_extracted} compromiso(s) extraído(s)
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Members tab — linkeo wpp ↔ Maven user
// ─────────────────────────────────────────────────────────────────────────
// Cada wpp_member del grupo aparece con su display_name (como WhatsApp
// reporta el push name) y un dropdown para mapearlo a un user de Maven
// (profiles). Una vez mapeado, el bot puede correr get_member_maven_activity
// y responder "¿Miguel ya cargó los contactos que prometió?" cruzando
// leadgen_entries / closers_contacts / closer_creators / etc.
//
// El update va a la columna user_id de whatsapp_members. La policy RLS
// permite UPDATE solo a admins/managers — si un usuario sin esos roles
// abre este tab y trata de linkear, la mutation falla con mensaje claro.
function MembersList({ groupId }: { groupId: string }) {
  const { data: members, isLoading } = useWhatsappMembers(groupId);
  const { data: users } = useMavenUsersForLink();
  const linkMut = useLinkWhatsappMember();

  if (isLoading) return <div className="text-xs text-muted-foreground">cargando…</div>;
  if (!members || members.length === 0) {
    return (
      <Card className="p-4 text-center text-xs text-muted-foreground">
        Todavía no hay miembros detectados. Aparecen cuando alguien
        escribe en el grupo por primera vez.
      </Card>
    );
  }

  const linkedCount = members.filter((m) => m.user_id).length;
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <Link2 className="h-3 w-3" />
        <span>
          {linkedCount} de {members.length} miembros linkeados a un user de Maven. El bot solo
          puede cruzar actividad real con los que estén mapeados.
        </span>
      </div>
      <Card className="divide-y">
        {members.map((m) => (
          <MemberRow
            key={m.id}
            member={m}
            users={users ?? []}
            onLink={(userId) => linkMut.mutate({ memberId: m.id, userId })}
            isUpdating={linkMut.isPending && linkMut.variables?.memberId === m.id}
          />
        ))}
      </Card>
    </div>
  );
}

function MemberRow({
  member,
  users,
  onLink,
  isUpdating,
}: {
  member: WhatsappMember;
  users: Array<{ id: string; full_name: string | null; roles: string[] }>;
  onLink: (userId: string | null) => void;
  isUpdating: boolean;
}) {
  const [open, setOpen] = useState(false);
  const linkedName = member.linked_user?.full_name ?? (member.user_id ? "(usuario sin nombre)" : null);

  return (
    <div className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{member.display_name}</span>
          {member.role && (
            <Badge variant="outline" className="text-[10px]">{member.role}</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate mt-0.5">
          {member.last_seen_at
            ? <>Activo {format(new Date(member.last_seen_at), "d MMM HH:mm", { locale: es })}</>
            : "Sin actividad reciente"}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {linkedName ? (
          <Badge variant="default" className="text-[10px] gap-1">
            <Link2 className="h-2.5 w-2.5" /> {linkedName}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] gap-1">
            <Link2Off className="h-2.5 w-2.5" /> sin link
          </Badge>
        )}
        <Popover open={open} onOpenChange={setOpen} modal>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              role="combobox"
              aria-expanded={open}
              className="h-7 text-xs gap-1 justify-between min-w-[180px]"
              disabled={isUpdating}
            >
              {linkedName ? "cambiar" : "linkear a Maven"}
              <ChevronsUpDown className="h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="end">
            <Command>
              <CommandInput placeholder="Buscar usuario..." className="h-8 text-xs" />
              <CommandList>
                <CommandEmpty>No encontré ese usuario.</CommandEmpty>
                <CommandGroup>
                  {member.user_id && (
                    <CommandItem
                      value="__unlink__"
                      onSelect={() => { onLink(null); setOpen(false); }}
                      className="text-xs text-destructive"
                    >
                      <Link2Off className="h-3 w-3 mr-2" />
                      Quitar link
                    </CommandItem>
                  )}
                  {users.map((u) => (
                    <CommandItem
                      key={u.id}
                      value={`${u.full_name ?? u.id} ${u.roles.join(" ")}`}
                      onSelect={() => { onLink(u.id); setOpen(false); }}
                      className="text-xs"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-3 w-3",
                          member.user_id === u.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{u.full_name ?? "(sin nombre)"}</div>
                        {u.roles.length > 0 && (
                          <div className="text-[10px] text-muted-foreground truncate">
                            {u.roles.join(", ")}
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function CostsCard({ groupId }: { groupId: string }) {
  const { data: rows } = useWhatsappGroupCosts(groupId, 3);

  // Mes actual = primera row porque la query viene ordenada desc
  const current = rows?.[0];
  const previous = rows?.[1];

  const fmt = (n: number | null | undefined) =>
    n == null ? "—" : n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;

  const monthLabel = current
    ? format(new Date(`${current.month}T12:00:00Z`), "MMMM yyyy", { locale: es })
    : "—";

  // Delta vs mes anterior
  const delta = current && previous && previous.cost_usd > 0
    ? ((current.cost_usd - previous.cost_usd) / previous.cost_usd) * 100
    : null;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <p className="text-sm font-medium">Costos del bot — {monthLabel}</p>
        </div>
        {delta !== null && (
          <Badge variant="outline" className={cn(
            "text-[10px]",
            delta > 20 ? "border-orange-500 text-orange-600" : delta < -20 ? "border-emerald-500 text-emerald-600" : "",
          )}>
            {delta > 0 ? "+" : ""}{delta.toFixed(0)}% vs mes anterior
          </Badge>
        )}
      </div>

      {!current ? (
        <p className="text-xs text-muted-foreground">
          Sin actividad pagada todavía este mes. Los costos aparecen acá apenas el bot procese mensajes.
        </p>
      ) : (
        <div className="space-y-3">
          {/* Total grande */}
          <div className="flex items-baseline justify-between">
            <p className="text-3xl font-bold tabular-nums">{fmt(current.cost_usd)}</p>
            <span className="text-xs text-muted-foreground">{current.calls} calls</span>
          </div>

          {/* Breakdown por componente */}
          <div className="grid grid-cols-4 gap-2 text-xs">
            <CostMetric label="Agent" value={current.agent_cost} />
            <CostMetric label="Extract" value={current.extract_cost} />
            <CostMetric label="Audio" value={current.audio_cost} />
            <CostMetric label="Imagen" value={current.image_cost} />
          </div>

          {/* Breakdown del agent: auto (Haiku) vs mention (Sonnet) */}
          {(current.agent_auto_cost || current.agent_mention_cost) && (
            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Auto (Haiku)</span>
                <span className="tabular-nums font-medium">{fmt(current.agent_auto_cost)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Mention (Sonnet)</span>
                <span className="tabular-nums font-medium">{fmt(current.agent_mention_cost)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function CostMetric({ label, value }: { label: string; value: number | null | undefined }) {
  const fmt = (n: number | null | undefined) =>
    n == null ? "—" : n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;
  return (
    <div className="rounded-md bg-muted/30 p-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{fmt(value)}</p>
    </div>
  );
}

function DailyReportsList({ groupId }: { groupId: string }) {
  const { data: reports, isLoading } = useWhatsappDailyReports(groupId, 14);
  const [selected, setSelected] = useState<WhatsappDailyReport | null>(null);

  if (isLoading) {
    return <Card className="p-4 text-center text-xs text-muted-foreground">Cargando reportes…</Card>;
  }
  if (!reports || reports.length === 0) {
    return (
      <Card className="p-4 text-center text-xs text-muted-foreground">
        Sin reportes todavía. Cuando alguien mande un reporte de jornada en el grupo (contactados, respuestas, etc), el bot lo guarda acá.
      </Card>
    );
  }

  // Agrupamos por fecha para mostrar las jornadas de a una.
  const grouped = reports.reduce<Record<string, WhatsappDailyReport[]>>((acc, r) => {
    (acc[r.report_date] ??= []).push(r);
    return acc;
  }, {});
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <>
      <div className="space-y-3">
        {dates.map((date) => {
          const dayReports = grouped[date];
          return (
            <Card key={date} className="p-3">
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-sm font-medium">
                  {format(new Date(`${date}T12:00:00Z`), "EEEE d 'de' MMMM", { locale: es })}
                </p>
                <span className="text-[11px] text-muted-foreground">{dayReports.length} reporte{dayReports.length === 1 ? "" : "s"}</span>
              </div>
              <div className="space-y-2">
                {dayReports.map((r) => (
                  <ReportRow key={r.id} report={r} onClick={() => setSelected(r)} />
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Reporte de {selected?.profile?.full_name ?? "—"}
            </DialogTitle>
            <DialogDescription>
              {selected && format(new Date(`${selected.report_date}T12:00:00Z`), "EEEE d 'de' MMMM yyyy", { locale: es })}
              {" · "}
              <Badge variant="outline" className="text-[10px]">{selected?.role_kind === "llg" ? "LLG" : "Closer Sup."}</Badge>
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-xs">
                {selected.role_kind === "llg" ? (
                  <>
                    <Metric label="Contactados" value={selected.contactados} />
                    <Metric label="Respuestas" value={selected.respuestas} />
                    <Metric label="Números" value={selected.numeros_obtenidos} accent="positive" />
                  </>
                ) : (
                  <>
                    <Metric label="Contactados" value={selected.contactados} />
                    <Metric label="Respuestas" value={selected.respuestas} />
                    <Metric label="Confirmadas" value={selected.confirmadas} accent="positive" />
                    <Metric label="Rechazadas" value={selected.rechazadas} />
                    <Metric label="Cerradas" value={selected.cerradas} accent="positive" />
                    <Metric label="Seguimientos" value={selected.seguimientos} />
                  </>
                )}
              </div>
              {selected.links && selected.links.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1">Links</p>
                  <div className="space-y-1">
                    {selected.links.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {url}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {selected.raw_text && (
                <div>
                  <p className="text-xs font-medium mb-1">Texto original</p>
                  <Card className="p-2 bg-muted/30">
                    <p className="text-xs whitespace-pre-wrap text-muted-foreground">{selected.raw_text}</p>
                  </Card>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Capturado {format(new Date(selected.created_at), "d MMM HH:mm", { locale: es })}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReportRow({ report, onClick }: { report: WhatsappDailyReport; onClick: () => void }) {
  const name = report.profile?.full_name ?? "—";
  const isLLG = report.role_kind === "llg";

  // Resumen 1-línea de las métricas clave según el rol.
  const summary = isLLG
    ? `${report.contactados ?? "—"} contactados · ${report.respuestas ?? "—"} respuestas · ${report.numeros_obtenidos ?? "—"} números`
    : `${report.contactados ?? "—"} contactados · ${report.confirmadas ?? 0} conf. · ${report.cerradas ?? 0} cerradas · ${report.rechazadas ?? 0} rech.`;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Badge variant={isLLG ? "secondary" : "outline"} className="text-[10px] shrink-0">
          {isLLG ? "LLG" : "Closer"}
        </Badge>
        <span className="text-sm font-medium truncate">{name}</span>
      </div>
      <span className="text-xs text-muted-foreground shrink-0">{summary}</span>
    </button>
  );
}

function Metric({ label, value, accent }: { label: string; value: number | null; accent?: "positive" }) {
  return (
    <div className={cn(
      "rounded-md p-2 text-center",
      accent === "positive" ? "bg-emerald-500/10" : "bg-muted/30",
    )}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={cn(
        "text-lg font-semibold tabular-nums",
        accent === "positive" ? "text-emerald-700 dark:text-emerald-400" : undefined,
      )}>
        {value ?? "—"}
      </p>
    </div>
  );
}

function EventsList({ groupId }: { groupId: string }) {
  const { data: events } = useWhatsappBotEvents(groupId);
  if (!events || events.length === 0) {
    return (
      <Card className="p-4 text-center text-xs text-muted-foreground">
        Sin eventos.
      </Card>
    );
  }
  return (
    <Card className="p-3 space-y-1 max-h-[500px] overflow-y-auto">
      {events.map((e) => (
        <div key={e.id} className="text-xs flex items-baseline gap-2 py-1 border-b last:border-b-0">
          <span className="text-muted-foreground shrink-0 w-32">
            {format(new Date(e.created_at), "d MMM HH:mm:ss", { locale: es })}
          </span>
          <Badge variant="outline" className="text-[10px] shrink-0">{e.kind}</Badge>
          <span className="text-muted-foreground truncate">
            {JSON.stringify(e.payload).slice(0, 200)}
          </span>
        </div>
      ))}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Dialogs
// ─────────────────────────────────────────────────────────────────────────
function AskAgentDialog({
  open,
  onOpenChange,
  group,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  group: WhatsappGroup;
}) {
  const [question, setQuestion] = useState("");
  const askMut = useAskWhatsappAgent();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Preguntale al bot</DialogTitle>
          <DialogDescription>
            La respuesta se mandará al grupo <strong>{group.name}</strong>.
            {!group.bot_enabled && (
              <span className="block mt-1 text-orange-600">
                ⚠ El bot está OFF para este grupo — la respuesta se va a generar pero NO se va a enviar.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder='Ej: "¿Qué pendientes tiene Miguel esta semana?" o "Pasame el estado del lead de Camila Pérez"'
          rows={4}
        />
        {askMut.data?.final_reply && (
          <Card className="p-3 bg-primary/5">
            <p className="text-xs font-medium mb-1">Respuesta del bot:</p>
            <p className="text-sm whitespace-pre-wrap">{askMut.data.final_reply}</p>
          </Card>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button
            onClick={() => askMut.mutate({ groupId: group.id, question })}
            disabled={!question.trim() || askMut.isPending}
          >
            {askMut.isPending ? "Procesando..." : "Preguntar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({
  open,
  onOpenChange,
  group,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  group: WhatsappGroup;
}) {
  const [persona, setPersona] = useState(group.bot_persona ?? "");
  const updateMut = useUpdateBotPersona();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar persona del bot</DialogTitle>
          <DialogDescription>
            Instrucciones extra que se le pasan al bot para personalizar el tono o las
            reglas específicas de este grupo. Vacío = usar el default.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          placeholder='Ej: "En este grupo, no respondas en menos de 30s — esperá a que el equipo discuta. Llamale Sofí, no Sofía."'
          rows={6}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() =>
              updateMut.mutate(
                { groupId: group.id, persona: persona.trim() || null },
                { onSuccess: () => onOpenChange(false) },
              )
            }
            disabled={updateMut.isPending}
          >
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
