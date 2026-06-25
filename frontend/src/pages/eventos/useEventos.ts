import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EventRow {
  id: string;
  name: string;
  event_type: string;
  project_type: string | null;
  description: string | null;
  date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  max_capacity: number | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  guest_count: number;
  external_token: string | null;
  video_call_room_id: string | null;
}

export interface EventoFilters {
  search: string;
  type: string;
  status: string;
  timeOfDay: string;
  dateFrom: string;
  dateTo: string;
  projectType: string;
}

export const emptyFilters: EventoFilters = {
  search: "",
  type: "",
  status: "",
  timeOfDay: "",
  dateFrom: "",
  dateTo: "",
  projectType: "",
};

const EVENT_STATUSES = ["upcoming", "in_progress", "completed", "cancelled", "rescheduled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const statusLabel: Record<string, string> = {
  upcoming: "Próximo",
  in_progress: "En curso",
  completed: "Completado",
  cancelled: "Cancelado",
  rescheduled: "Reagendado",
};

export const statusVariant: Record<string, "primary-soft" | "warning-soft" | "success-soft" | "destructive-soft" | "secondary-soft"> = {
  upcoming: "primary-soft",
  in_progress: "warning-soft",
  completed: "success-soft",
  cancelled: "destructive-soft",
  rescheduled: "secondary-soft",
};

export const PROJECT_TYPES = ["Ora", "Kash", "Trafix", "Unlok"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const projectTypeColor: Record<string, { bg: string; text: string }> = {
  Ora: { bg: "bg-blue-500/15", text: "text-blue-600" },
  Kash: { bg: "bg-purple-500/15", text: "text-purple-600" },
  Trafix: { bg: "bg-amber-500/15", text: "text-amber-600" },
  Unlok: { bg: "bg-emerald-500/15", text: "text-emerald-600" },
};

export const eventTypeIcon: Record<string, string> = {
  Shooting: "Camera",
  Podcast: "Mic",
  Casting: "Users",
  Reunion: "Video",
  Otro: "CalendarDays",
};

async function fetchEventos(): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*, event_guests(id)")
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((e: any) => ({
    ...e,
    guest_count: e.event_guests?.length ?? 0,
    event_guests: undefined,
  }));
}

function getHour(time: string | null): number | null {
  if (!time) return null;
  return parseInt(time.split(":")[0], 10);
}

function applyFilters(events: EventRow[], filters: EventoFilters): EventRow[] {
  let result = events;

  if (filters.projectType) {
    result = result.filter((e) => e.project_type === filters.projectType);
  }
  if (filters.status) {
    result = result.filter((e) => e.status === filters.status);
  }
  if (filters.type) {
    result = result.filter((e) => e.event_type === filters.type);
  }
  if (filters.timeOfDay) {
    result = result.filter((e) => {
      const h = getHour(e.start_time);
      if (h === null) return false;
      if (filters.timeOfDay === "morning") return h >= 6 && h < 12;
      if (filters.timeOfDay === "afternoon") return h >= 12 && h < 18;
      if (filters.timeOfDay === "night") return h >= 18 || h < 6;
      return true;
    });
  }
  if (filters.dateFrom) {
    result = result.filter((e) => e.date >= filters.dateFrom);
  }
  if (filters.dateTo) {
    result = result.filter((e) => e.date <= filters.dateTo);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.location && e.location.toLowerCase().includes(q))
    );
  }

  return result;
}

export function useEventos(filters: EventoFilters) {
  const query = useQuery({
    queryKey: ["events"],
    queryFn: fetchEventos,
  });

  const allEvents = query.data ?? [];
  const filtered = applyFilters(allEvents, filters);

  return {
    events: filtered,
    allEvents,
    isLoading: query.isLoading,
  };
}

export function useEventLocations() {
  return useQuery({
    queryKey: ["event-locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("location")
        .not("location", "is", null);
      if (error) throw error;
      const unique = [...new Set((data ?? []).map((e) => e.location).filter(Boolean))] as string[];
      return unique.sort();
    },
  });
}

export function useAddEvento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      event_type: string;
      description?: string;
      date: string;
      end_date?: string;
      start_time?: string;
      end_time?: string;
      location?: string;
      max_capacity?: number;
      notes?: string;
    }) => {
      const { data: inserted, error } = await supabase
        .from("events")
        .insert(data as any)
        .select("id")
        .single();
      if (error) throw error;
      return inserted;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useAddEventGuests() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (guests: { event_id: string; guest_type: string; creator_id?: string; guest_name?: string }[]) => {
      if (guests.length === 0) return;
      const { error } = await supabase.from("event_guests").insert(guests as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useDeleteEvento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useUpdateEvento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const { error } = await supabase.from("events").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useEventGuests(eventId: string) {
  return useQuery({
    queryKey: ["event-guests", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_guests")
        .select("id, event_id, creator_id, guest_name, guest_type, status, created_at, cancellation_reason, status_updated_at, status_changed_by, creators(name, artistic_name, profile_photo_url)")
        .eq("event_id", eventId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!eventId,
  });
}

export function useUpdateGuestStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("event_guests").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event-guests"] }),
  });
}
