import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Contrato con la RPC get_karma_profile / send_karma (SECURITY DEFINER).
// El bloque `admin` (criterios + cifras) solo llega si quien pregunta es admin.

export type KarmaStarKey =
  | "rendimiento" | "actividad" | "constancia" | "productividad" | "companerismo";

export type KarmaStars = Record<KarmaStarKey, boolean>;

export interface KarmaCriterion { met: boolean; label: string; rule: string; }

export interface KarmaAdmin {
  msgs_sent_30d: number;
  msgs_recv_30d: number;
  active_days_30d: number;
  hub_activity_30d: number | null;
  hub_hours_30d: number | null;
  karma_givers: number;
  eligible: number;
  criteria: Record<KarmaStarKey, KarmaCriterion>;
}

export interface KarmaProfile {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
  role: string;
  stars: KarmaStars;
  stars_count: number;
  special: boolean;
  vote_pct: number;
  viewer_has_sent: boolean;
  is_self: boolean;
  viewer_is_admin: boolean;
  admin?: KarmaAdmin;
}

// Orden fijo de las 5 estrellas base en la ficha.
export const KARMA_ORDER: KarmaStarKey[] = [
  "rendimiento", "actividad", "constancia", "productividad", "companerismo",
];

// Leyenda = las 6 estrellas (5 base + la votada), NO solo la votada.
export function isKarmaLegend(p?: KarmaProfile | null): boolean {
  return !!p && p.stars_count === 5 && p.special;
}

export function useKarmaProfile(userId: string | null) {
  return useQuery({
    queryKey: ["karma-profile", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<KarmaProfile> => {
      // RPC nueva (aún no en los tipos generados) → cast.
      const { data, error } = await supabase.rpc("get_karma_profile" as never, { target: userId } as never);
      if (error) throw error;
      return data as unknown as KarmaProfile;
    },
  });
}

export function useSendKarma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string): Promise<KarmaProfile> => {
      const { data, error } = await supabase.rpc("send_karma" as never, { target: userId } as never);
      if (error) throw error;
      return data as unknown as KarmaProfile;
    },
    onSuccess: (data, userId) => {
      // La RPC devuelve la ficha ya actualizada.
      if (data && (data as KarmaProfile).user_id) {
        qc.setQueryData(["karma-profile", userId], data);
      }
    },
  });
}
