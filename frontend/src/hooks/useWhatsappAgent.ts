import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Hooks para el panel admin del agente de WhatsApp.
//
// Las tablas whatsapp_* fueron creadas en la migration
// 20260525210000_whatsapp_agent_base.sql. Como todavía no están en los
// tipos generados de Supabase, casteamos el cliente para evitar tener
// que regenerar tipos en este PR. Cuando se regeneren, sacamos el cast.

const sb = supabase as unknown as { from: (table: string) => any; functions: typeof supabase.functions };

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export interface WhatsappGroup {
  id: string;
  tenant_id: string;
  external_id: string;
  name: string;
  provider: "evolution" | "baileys" | "manual";
  bot_enabled: boolean;
  bot_persona: string | null;
  timezone: string;
  active: boolean;
  last_message_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WhatsappCommitment {
  id: string;
  group_id: string;
  subject: string;
  target_subject: string | null;
  due_at: string | null;
  status: "pending" | "overdue" | "done" | "stale" | "cancelled";
  committed_by_text: string | null;
  committed_by_member_id: string | null;
  followup_count: number;
  confidence: number;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
}

export interface WhatsappMessage {
  id: string;
  group_id: string;
  sender_external_id: string;
  sender_display_name: string | null;
  body: string | null;
  msg_type: string;
  is_from_bot: boolean;
  sent_at: string;
  analyzed_at: string | null;
  analysis: Record<string, unknown>;
}

export interface WhatsappBotEvent {
  id: string;
  group_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface WhatsappMember {
  id: string;
  group_id: string;
  external_id: string;
  display_name: string;
  role: string | null;
  user_id: string | null;
  // Datos del profile linkeado (si user_id NO es null).
  linked_user?: {
    id: string;
    full_name: string | null;
  };
  last_seen_at: string | null;
  active: boolean;
}

export interface MavenUserOption {
  id: string;
  full_name: string | null;
  roles: string[];
}

// ───────────────────────────────────────────────────────────────────────────
// Queries
// ───────────────────────────────────────────────────────────────────────────

export function useWhatsappGroups() {
  return useQuery({
    queryKey: ["whatsapp", "groups"],
    queryFn: async (): Promise<WhatsappGroup[]> => {
      const { data, error } = await sb
        .from("whatsapp_groups")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as WhatsappGroup[]) ?? [];
    },
  });
}

export function useWhatsappGroupSummary(groupId: string | null) {
  return useQuery({
    queryKey: ["whatsapp", "group-summary", groupId],
    queryFn: async () => {
      if (!groupId) return null;
      const [msgsRes, commitsRes, membersRes] = await Promise.all([
        sb
          .from("whatsapp_messages")
          .select("id", { count: "exact", head: true })
          .eq("group_id", groupId),
        sb
          .from("whatsapp_commitments")
          .select("status", { count: "exact" })
          .eq("group_id", groupId)
          .in("status", ["pending", "overdue"]),
        sb
          .from("whatsapp_members")
          .select("id", { count: "exact", head: true })
          .eq("group_id", groupId),
      ]);
      return {
        message_count: msgsRes.count ?? 0,
        open_commitments: commitsRes.count ?? 0,
        member_count: membersRes.count ?? 0,
      };
    },
    enabled: !!groupId,
  });
}

export function useWhatsappRecentMessages(groupId: string | null, limit = 50) {
  return useQuery({
    queryKey: ["whatsapp", "messages", groupId, limit],
    queryFn: async (): Promise<WhatsappMessage[]> => {
      if (!groupId) return [];
      const { data, error } = await sb
        .from("whatsapp_messages")
        .select(
          "id, group_id, sender_external_id, sender_display_name, body, msg_type, is_from_bot, sent_at, analyzed_at, analysis",
        )
        .eq("group_id", groupId)
        .order("sent_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return ((data as WhatsappMessage[]) ?? []).reverse();
    },
    enabled: !!groupId,
    refetchInterval: 30_000,
  });
}

export function useWhatsappCommitments(groupId: string | null, status: WhatsappCommitment["status"] | "all" = "pending") {
  return useQuery({
    queryKey: ["whatsapp", "commitments", groupId, status],
    queryFn: async (): Promise<WhatsappCommitment[]> => {
      if (!groupId) return [];
      let q = sb
        .from("whatsapp_commitments")
        .select(
          "id, group_id, subject, target_subject, due_at, status, committed_by_text, committed_by_member_id, followup_count, confidence, created_at, resolved_at, resolution_note",
        )
        .eq("group_id", groupId)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(100);
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data as WhatsappCommitment[]) ?? [];
    },
    enabled: !!groupId,
  });
}

export function useWhatsappBotEvents(groupId: string | null, limit = 50) {
  return useQuery({
    queryKey: ["whatsapp", "bot-events", groupId, limit],
    queryFn: async (): Promise<WhatsappBotEvent[]> => {
      if (!groupId) return [];
      const { data, error } = await sb
        .from("whatsapp_bot_events")
        .select("id, group_id, kind, payload, created_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as WhatsappBotEvent[]) ?? [];
    },
    enabled: !!groupId,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Mutations
// ───────────────────────────────────────────────────────────────────────────

export function useToggleWhatsappBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, enabled }: { groupId: string; enabled: boolean }) => {
      const { error } = await sb
        .from("whatsapp_groups")
        .update({ bot_enabled: enabled })
        .eq("id", groupId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp", "groups"] });
      toast.success("Configuración del bot actualizada");
    },
    onError: (e: Error) => toast.error(`Error: ${e.message}`),
  });
}

export function useAskWhatsappAgent() {
  return useMutation({
    mutationFn: async ({
      groupId,
      question,
    }: {
      groupId: string;
      question: string;
    }) => {
      const { data, error } = await sb.functions.invoke("whatsapp-agent", {
        body: { group_id: groupId, user_question: question, invoked_by: "admin_panel" },
      });
      if (error) throw error;
      return data as { ok: boolean; final_reply?: string; iterations?: number; error?: string };
    },
    onSuccess: (data) => {
      if (data.ok) {
        toast.success(`Bot respondió en ${data.iterations} iteración(es)`);
      } else {
        toast.error(`Bot error: ${data.error ?? "unknown"}`);
      }
    },
    onError: (e: Error) => toast.error(`Error: ${e.message}`),
  });
}

export function useResolveCommitment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      outcome,
    }: {
      id: string;
      outcome: "done" | "cancelled";
    }) => {
      const { error } = await sb
        .from("whatsapp_commitments")
        .update({
          status: outcome,
          resolved_at: new Date().toISOString(),
          resolution_note: `Cerrado manualmente desde panel admin`,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp", "commitments"] });
      toast.success("Compromiso cerrado");
    },
    onError: (e: Error) => toast.error(`Error: ${e.message}`),
  });
}

// Lista los miembros de un grupo de WhatsApp. La columna user_id de
// whatsapp_members tiene FK a auth.users (no a profiles), así que
// PostgREST no infiere el join — traemos los profiles aparte y los
// pegamos en JS. Para <50 members por grupo es trivial.
// Ordenamos por last_seen_at desc para que los más activos queden arriba.
export function useWhatsappMembers(groupId: string | null) {
  return useQuery({
    queryKey: ["whatsapp", "members", groupId],
    queryFn: async (): Promise<WhatsappMember[]> => {
      if (!groupId) return [];
      const { data: members, error } = await sb
        .from("whatsapp_members")
        .select("id, group_id, external_id, display_name, role, user_id, last_seen_at, active")
        .eq("group_id", groupId)
        .eq("active", true)
        .order("last_seen_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      const rows = (members ?? []) as WhatsappMember[];
      const linkedIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean) as string[]));
      if (linkedIds.length === 0) return rows;
      const { data: profiles } = await sb
        .from("profiles")
        .select("id, full_name")
        .in("id", linkedIds);
      const byId = new Map<string, { id: string; full_name: string | null }>();
      for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null }>) {
        byId.set(p.id, p);
      }
      return rows.map((r) => ({
        ...r,
        linked_user: r.user_id ? byId.get(r.user_id) ?? undefined : undefined,
      }));
    },
    enabled: Boolean(groupId),
  });
}

// Lista de usuarios de Maven con sus roles, para poblar el dropdown
// del linkeo. RLS filtra por tenant — un admin ve solo su tenant.
// No paginamos porque típicamente un tenant tiene <100 users.
export function useMavenUsersForLink() {
  return useQuery({
    queryKey: ["whatsapp", "maven-users"],
    queryFn: async (): Promise<MavenUserOption[]> => {
      // Traemos profiles + roles agregados. Hacemos dos queries y juntamos
      // en JS — más simple que un view custom y suficiente para <100 rows.
      const [profilesRes, rolesRes] = await Promise.all([
        sb.from("profiles").select("id, full_name").order("full_name", { ascending: true }),
        sb.from("user_roles").select("user_id, role"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      const rolesByUser = new Map<string, string[]>();
      for (const r of (rolesRes.data ?? []) as Array<{ user_id: string; role: string }>) {
        const list = rolesByUser.get(r.user_id) ?? [];
        list.push(r.role);
        rolesByUser.set(r.user_id, list);
      }
      return ((profilesRes.data ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        roles: rolesByUser.get(p.id) ?? [],
      }));
    },
  });
}

// Setea (o limpia con userId=null) el link entre un wpp_member y un
// user de Maven. La policy de RLS en whatsapp_members exige rol admin
// o manager — si no, la query falla con error de policy.
export function useLinkWhatsappMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, userId }: { memberId: string; userId: string | null }) => {
      const { error } = await sb
        .from("whatsapp_members")
        .update({ user_id: userId })
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["whatsapp", "members"] });
      toast.success(vars.userId ? "Miembro linkeado a Maven" : "Link removido");
    },
    onError: (e: Error) => toast.error(`Error: ${e.message}`),
  });
}

export function useUpdateBotPersona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, persona }: { groupId: string; persona: string | null }) => {
      const { error } = await sb
        .from("whatsapp_groups")
        .update({ bot_persona: persona })
        .eq("id", groupId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp", "groups"] });
      toast.success("Persona del bot actualizada");
    },
    onError: (e: Error) => toast.error(`Error: ${e.message}`),
  });
}
