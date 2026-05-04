import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useMPTrafficOrganic = () =>
  useQuery({
    queryKey: ["mp-traffic-organic"],
    queryFn: async () => {
      const { data, error } = await supabase.from("mp_traffic_organic").select("*, mp_models(name)").order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useMPTrafficSFS = () =>
  useQuery({
    queryKey: ["mp-traffic-sfs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("mp_traffic_sfs").select("*, mp_models(name)").order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useMPTrafficPaid = () =>
  useQuery({
    queryKey: ["mp-traffic-paid"],
    queryFn: async () => {
      const { data, error } = await supabase.from("mp_traffic_paid").select("*, mp_models(name)").order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useCreateMPTrafficOrganic = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: any) => {
      const { error } = await supabase.from("mp_traffic_organic").insert(entry);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-traffic-organic"] }),
  });
};

export const useCreateMPTrafficSFS = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: any) => {
      const { error } = await supabase.from("mp_traffic_sfs").insert(entry);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-traffic-sfs"] }),
  });
};

export const useCreateMPTrafficPaid = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: any) => {
      const { error } = await supabase.from("mp_traffic_paid").insert(entry);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-traffic-paid"] }),
  });
};
