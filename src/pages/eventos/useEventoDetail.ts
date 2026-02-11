import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Event Detail ───
export function useEventDetail(id: string) {
  return useQuery({
    queryKey: ["event-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

// ─── Extended Guests (with new columns) ───
export function useEventGuestsExtended(eventId: string) {
  return useQuery({
    queryKey: ["event-guests-extended", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_guests")
        .select("*, creators(name, artistic_name, profile_photo_url)")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!eventId,
  });
}

export function useUpdateGuestStatusExtended() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      cancellation_reason,
    }: {
      id: string;
      status: string;
      cancellation_reason?: string;
    }) => {
      const updateData: Record<string, any> = {
        status,
        status_changed_by: "internal",
      };
      if (cancellation_reason !== undefined) {
        updateData.cancellation_reason = cancellation_reason;
      }
      const { error } = await supabase
        .from("event_guests")
        .update(updateData)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-guests-extended"] });
      qc.invalidateQueries({ queryKey: ["event-guests"] });
      qc.invalidateQueries({ queryKey: ["event-attendance-log"] });
    },
  });
}

// ─── Attendance Log ───
export function useEventAttendanceLog(eventId: string) {
  return useQuery({
    queryKey: ["event-attendance-log", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_attendance_log")
        .select("*, event_guests(guest_name, creator_id, creators(name, artistic_name))")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!eventId,
  });
}

// ─── Checklist ───
export function useEventChecklist(eventId: string) {
  return useQuery({
    queryKey: ["event-checklist", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_checklist_items")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!eventId,
  });
}

export function useAddChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: { event_id: string; title: string; assigned_to?: string }) => {
      const { error } = await supabase.from("event_checklist_items").insert(item as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event-checklist"] }),
  });
}

export function useUpdateChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const { error } = await supabase
        .from("event_checklist_items")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event-checklist"] }),
  });
}

export function useDeleteChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_checklist_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event-checklist"] }),
  });
}
