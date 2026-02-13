import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const PRIORITY_LABELS: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

export const STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export const STATUS_LABELS: Record<string, string> = {
  open: "Abierto",
  in_progress: "En Progreso",
  resolved: "Resuelto",
  closed: "Cerrado",
};

export const TICKET_TYPES = ["complaint", "technical", "billing", "content", "general"] as const;
export const TYPE_LABELS: Record<string, string> = {
  complaint: "Queja",
  technical: "Técnico",
  billing: "Facturación",
  content: "Contenido",
  general: "General",
};

export const COMPANIES = [
  { value: "ora_miami", label: "Ora Miami" },
  { value: "kash_agency", label: "KASH Agency" },
  { value: "alvaroletshoot", label: "Alvaroletshoot" },
  { value: "blue_app", label: "Blue App" },
  { value: "piclink", label: "piclink.me" },
  { value: "pagomundo", label: "Pagomundo" },
];

export const TEAM_MEMBERS = [
  { value: "alvaro", label: "alvaro (@alvaro)" },
  { value: "amartinez", label: "Ana Martinez (@amartinez)" },
  { value: "Andres.Gaviria", label: "Andres Gaviria (@Andres.Gaviria)" },
  { value: "Brayan123", label: "Brayan Esneider Castaño Hoyos (@Brayan123)" },
  { value: "carolina.jaramillo@unlok.me", label: "Carolina Jaramillo (@carolina.jaramillo)" },
  { value: "cheryl.gonzalez@unlok.me", label: "Cheryl Gonzalez (@cheryl.gonzalez)" },
  { value: "clopez", label: "Carlos Lopez (@clopez)" },
  { value: "cruiz", label: "Carmen Ruiz (@cruiz)" },
  { value: "Fabiana_Duran", label: "Fabiana Duran (@Fabiana_Duran)" },
  { value: "gislaineescudero", label: "Gislaine Escudero (@gislaineescudero)" },
  { value: "gracegelves260", label: "Grace Gelves (@gracegelves260)" },
  { value: "Isatuiran", label: "Isabel Tuiran (@Isatuiran)" },
  { value: "jmoreno", label: "Javier Moreno (@jmoreno)" },
  { value: "Johanna", label: "Johanna Riano (@Johanna)" },
  { value: "jorge", label: "Jorge Restrepo (@jorge)" },
  { value: "jorge.restrepo", label: "Jorge Restrepo 3 (@jorge.restrepo)" },
  { value: "jorge.restrepo.1", label: "jorge.restrepo.1 (@jorge.restrepo.1)" },
  { value: "lizeth.jerez@unlok.me", label: "Lizeth Jerez (@lizeth.jerez)" },
  { value: "lorena_lozano", label: "Lorena Lozano (@lorena_lozano)" },
  { value: "lrodriguez", label: "Luis Rodriguez (@lrodriguez)" },
  { value: "Luisroman07", label: "Luis Carlos Ortega Roman (@Luisroman07)" },
  { value: "marielby", label: "Marielby Quijada (@marielby)" },
  { value: "maritest", label: "Marielby Testing (@maritest)" },
  { value: "mgarcia", label: "Maria Garcia (@mgarcia)" },
  { value: "michel_zarate", label: "Michel Zarate (@michel_zarate)" },
  { value: "mitchtest", label: "Mitch Test (@mitchtest)" },
  { value: "monica.duque@unlok.me", label: "Monica Duque (@monica.duque)" },
  { value: "Paularomero", label: "Paula Romero (@Paularomero)" },
  { value: "Pepe Glaves", label: "Grace Galvez Galvez (@Pepe Glaves)" },
  { value: "pepeel", label: "peo peo (@pepeel)" },
  { value: "perez", label: "Fernando Perez (@perez)" },
  { value: "ptorres", label: "Pablo Torres (@ptorres)" },
  { value: "ruben.guzman", label: "Ruben Guzman (@ruben.guzman)" },
  { value: "rusin24", label: "rusin24 (@rusin24)" },
  { value: "sfernandez", label: "Sofia Fernandez (@sfernandez)" },
  { value: "william.cujar", label: "william cujar (@william.cujar)" },
  { value: "yeison.bello", label: "yeison bello (@yeison.bello)" },
];

export interface TicketWithCreator {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  ticket_type: string;
  company: string | null;
  assigned_to: string | null;
  creator_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  creator_id: string;
  creators?: { name: string; artistic_name: string | null; instagram_handle: string | null } | null;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  author_name: string;
  author_email: string | null;
  content: string;
  created_at: string | null;
}

export function useTickets() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const ticketsQuery = useQuery({
    queryKey: ["tickets-module"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("*, creators(name, artistic_name, instagram_handle)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as TicketWithCreator[];
    },
  });

  const createTicket = useMutation({
    mutationFn: async (ticket: {
      creator_id: string;
      title: string;
      description?: string | null;
      priority: string;
      ticket_type: string;
      company?: string | null;
      assigned_to?: string | null;
      creator_notes?: string | null;
    }) => {
      const { error } = await supabase.from("tickets").insert(ticket as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Ticket creado exitosamente" });
      queryClient.invalidateQueries({ queryKey: ["tickets-module"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error al crear ticket", description: error.message, variant: "destructive" });
    },
  });

  const updateTicket = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from("tickets").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Ticket actualizado exitosamente" });
      queryClient.invalidateQueries({ queryKey: ["tickets-module"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error al actualizar ticket", description: error.message, variant: "destructive" });
    },
  });

  const deleteTicket = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tickets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Ticket eliminado exitosamente" });
      queryClient.invalidateQueries({ queryKey: ["tickets-module"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error al eliminar ticket", description: error.message, variant: "destructive" });
    },
  });

  const creatorsQuery = useQuery({
    queryKey: ["creators-for-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creators")
        .select("id, name, artistic_name, instagram_handle")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const useTicketComments = (ticketId: string) => {
    return useQuery({
      queryKey: ["ticket-comments", ticketId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("ticket_comments" as any)
          .select("*")
          .eq("ticket_id", ticketId)
          .order("created_at", { ascending: true });
        if (error) throw error;
        return data as unknown as TicketComment[];
      },
      enabled: !!ticketId,
    });
  };

  const addComment = useMutation({
    mutationFn: async (comment: { ticket_id: string; author_name: string; author_email?: string; content: string }) => {
      const { error } = await supabase.from("ticket_comments" as any).insert(comment as any);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast({ title: "Comentario agregado" });
      queryClient.invalidateQueries({ queryKey: ["ticket-comments", variables.ticket_id] });
    },
    onError: (error: Error) => {
      toast({ title: "Error al agregar comentario", description: error.message, variant: "destructive" });
    },
  });

  return { ticketsQuery, createTicket, updateTicket, deleteTicket, creatorsQuery, useTicketComments, addComment };
}
