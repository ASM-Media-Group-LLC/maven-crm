import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AnnouncementRow {
  id: string;
  title: string;
  message: string | null;
  content_html: string | null;
  announcement_type: string;
  priority: string;
  is_active: boolean;
  status: string;
  visibility: string;
  delivery_channels: string[];
  related_module: string | null;
  recurrence_type: string;
  recurrence_end_at: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  image_url: string | null;
  view_count: number;
  open_count: number;
  starts_at: string;
  expires_at: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  audience?: AudienceTarget[];
}

export interface AudienceTarget {
  id: string;
  announcement_id: string;
  target_type: string;
  target_id: string | null;
  target_label: string;
}

export interface AnnouncementView {
  id: string;
  announcement_id: string;
  user_id: string;
  viewed_at: string;
  opened_at: string | null;
}

const QUERY_KEY = ["admin-announcements"];
const PUBLIC_KEY = ["internal-announcements"];

// Send notifications to target audience when announcement is published via 'notification' channel
async function sendAnnouncementNotifications(
  announcementId: string,
  title: string,
  message: string,
  priority: string,
  audience?: Omit<AudienceTarget, "id" | "announcement_id">[]
) {
  try {
    let userIds: string[] = [];

    // Determine target users
    const isGlobal = !audience || audience.length === 0 || audience.some((a) => a.target_type === "all");

    if (isGlobal) {
      const { data } = await supabase.from("profiles").select("id").limit(500);
      userIds = (data ?? []).map((p) => p.id);
    } else {
      const ids = new Set<string>();
      for (const target of audience!) {
        if (target.target_type === "user" && target.target_id) {
          ids.add(target.target_id);
        } else if (target.target_type === "department" && target.target_id) {
          const { data } = await (supabase.from("employees").select("profile_id") as any)
            .eq("department_id", target.target_id).eq("status", "activo");
          (data ?? []).forEach((e: any) => e.profile_id && ids.add(e.profile_id));
        } else if (target.target_type === "role" && target.target_id) {
          const { data } = await supabase.from("user_roles").select("user_id").eq("role", target.target_id as any);
          (data ?? []).forEach((r: any) => ids.add(r.user_id));
        }
      }
      userIds = [...ids];
    }

    if (userIds.length === 0) return;

    const priorityMap: Record<string, string> = { high: "high", normal: "medium", low: "low" };

    // Insert notifications in batches of 100
    const notifications = userIds.map((uid) => ({
      user_id: uid,
      title: `📢 ${title}`,
      message: message.slice(0, 200) || null,
      type: "announcement",
      module_origin: "Comunicación",
      deep_link_url: "/hr/anuncios",
      reference_id: announcementId,
      reference_type: "announcement",
      priority: priorityMap[priority] || "medium",
      visibility_scope: "personal",
    }));

    for (let i = 0; i < notifications.length; i += 100) {
      await supabase.from("notifications").insert(notifications.slice(i, i + 100));
    }
  } catch (err) {
    console.error("Error sending announcement notifications:", err);
  }
}

export const useAnnouncementsAdmin = () =>
  useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_announcements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch audience for all announcements
      const ids = (data ?? []).map((a: any) => a.id);
      let audienceMap: Record<string, AudienceTarget[]> = {};
      if (ids.length > 0) {
        const { data: audData } = await supabase
          .from("announcement_audience")
          .select("*")
          .in("announcement_id", ids);
        (audData ?? []).forEach((a: any) => {
          if (!audienceMap[a.announcement_id]) audienceMap[a.announcement_id] = [];
          audienceMap[a.announcement_id].push(a as AudienceTarget);
        });
      }

      return (data ?? []).map((a: any) => ({
        ...a,
        delivery_channels: a.delivery_channels ?? ["feed"],
        audience: audienceMap[a.id] ?? [],
      })) as AnnouncementRow[];
    },
  });

export const useAnnouncementViews = (announcementId: string | null) =>
  useQuery({
    queryKey: ["announcement-views", announcementId],
    queryFn: async () => {
      if (!announcementId) return [];
      const { data, error } = await supabase
        .from("announcement_views")
        .select("*")
        .eq("announcement_id", announcementId)
        .order("viewed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AnnouncementView[];
    },
    enabled: !!announcementId,
  });

export const useCreateAnnouncement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      title: string;
      message?: string;
      content_html?: string;
      announcement_type: string;
      priority: string;
      status: string;
      visibility: string;
      delivery_channels: string[];
      related_module?: string | null;
      recurrence_type?: string;
      recurrence_end_at?: string | null;
      starts_at: string;
      expires_at?: string | null;
      image_url?: string | null;
      attachment_url?: string | null;
      attachment_name?: string | null;
      audience?: Omit<AudienceTarget, "id" | "announcement_id">[];
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const { audience, ...announcementData } = values;
      const is_active = values.status === "active";

      const { data, error } = await supabase
        .from("internal_announcements")
        .insert({ ...announcementData, created_by: user.id, is_active })
        .select("id")
        .single();
      if (error) throw error;

      // Insert audience targets
      if (audience && audience.length > 0) {
        const { error: audError } = await supabase
          .from("announcement_audience")
          .insert(audience.map((a) => ({ ...a, announcement_id: data.id })));
        if (audError) throw audError;
      }

      // Send notifications if channel includes 'notification' and status is active
      if (is_active && values.delivery_channels?.includes("notification")) {
        await sendAnnouncementNotifications(data.id, values.title, values.message || "", values.priority, audience);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      qc.invalidateQueries({ queryKey: PUBLIC_KEY });
      toast.success("Anuncio creado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useUpdateAnnouncement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      audience,
      ...values
    }: Omit<Partial<AnnouncementRow>, "audience"> & { id: string; audience?: Omit<AudienceTarget, "id" | "announcement_id">[] }) => {
      const updateData: any = { ...values, updated_at: new Date().toISOString() };
      delete updateData.audience;

      if (values.status !== undefined) {
        updateData.is_active = values.status === "active";
      }

      const { error } = await supabase
        .from("internal_announcements")
        .update(updateData)
        .eq("id", id);
      if (error) throw error;

      // Replace audience if provided
      if (audience !== undefined) {
        await supabase.from("announcement_audience").delete().eq("announcement_id", id);
        if (audience.length > 0) {
          const { error: audError } = await supabase
            .from("announcement_audience")
            .insert(audience.map((a) => ({ ...a, announcement_id: id })));
          if (audError) throw audError;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      qc.invalidateQueries({ queryKey: PUBLIC_KEY });
      toast.success("Anuncio actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDuplicateAnnouncement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (source: AnnouncementRow) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const { error, data } = await supabase
        .from("internal_announcements")
        .insert({
          title: `${source.title} (copia)`,
          message: source.message,
          content_html: source.content_html,
          announcement_type: source.announcement_type,
          priority: source.priority,
          status: "draft",
          visibility: source.visibility,
          delivery_channels: source.delivery_channels,
          related_module: source.related_module,
          recurrence_type: source.recurrence_type,
          starts_at: source.starts_at,
          expires_at: source.expires_at,
          is_active: false,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Copy audience
      if (source.audience && source.audience.length > 0) {
        await supabase.from("announcement_audience").insert(
          source.audience.map((a) => ({
            announcement_id: data.id,
            target_type: a.target_type,
            target_id: a.target_id,
            target_label: a.target_label,
          }))
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Anuncio duplicado como borrador");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useArchiveAnnouncement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // DB trigger auto-archives related notifications when is_active becomes false
      const { error } = await supabase
        .from("internal_announcements")
        .update({ status: "archived", is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      qc.invalidateQueries({ queryKey: PUBLIC_KEY });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Anuncio archivado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeleteAnnouncement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // DB trigger auto-deletes related notifications on cascade
      const { error } = await supabase.from("internal_announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      qc.invalidateQueries({ queryKey: PUBLIC_KEY });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Anuncio eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
