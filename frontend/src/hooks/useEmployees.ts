import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type ProfileOption = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

export type EmployeeWithRelations = {
  id: string;
  employee_code: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  birth_date: string | null;
  gender: string | null;
  national_id: string | null;
  national_id_type: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  profile_photo_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  department_id: string | null;
  position_id: string | null;
  hire_date: string | null;
  termination_date: string | null;
  contract_type: string | null;
  work_modality: string | null;
  status: string;
  reports_to: string | null;
  base_salary: number | null;
  salary_frequency: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_type: string | null;
  eps: string | null;
  arl: string | null;
  afp: string | null;
  caja_compensacion: string | null;
  notes: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
  departments: { id: string; name: string; code: string } | null;
  positions: { id: string; name: string; code: string } | null;
  profile_id: string | null;
};

export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select(`
          *,
          departments(id, name, code),
          positions(id, name, code)
        `)
        .order("first_name", { ascending: true });
      if (error) throw error;
      return data as EmployeeWithRelations[];
    },
  });
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({ title: "Empleado eliminado correctamente" });
    },
    onError: () => {
      toast({ title: "Error al eliminar el empleado", variant: "destructive" });
    },
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function usePositions(departmentId?: string) {
  return useQuery({
    queryKey: ["positions", departmentId],
    queryFn: async () => {
      let q = supabase.from("positions").select("*").eq("is_active", true).order("name");
      if (departmentId) q = q.eq("department_id", departmentId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

// --- Profile linking hooks ---

export function useAllProfiles() {
  return useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as ProfileOption[];
    },
  });
}

export function useLinkedProfile(profileId: string | null) {
  return useQuery({
    queryKey: ["linked-profile", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("id", profileId!)
        .single();
      if (profileError) throw profileError;

      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", profileId!)
        .single();

      return { ...profile, role: roleRow?.role ?? null } as ProfileOption & { role: string | null };
    },
  });
}

export function useLinkEmployeeProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ employeeId, profileId }: { employeeId: string; profileId: string }) => {
      const { error } = await supabase
        .from("employees")
        .update({ profile_id: profileId })
        .eq("id", employeeId);
      if (error) throw error;
    },
    onSuccess: (_data, { employeeId }) => {
      queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({ title: "Usuario vinculado correctamente" });
    },
    onError: () => {
      toast({ title: "Error al vincular el usuario", variant: "destructive" });
    },
  });
}

export function useUnlinkEmployeeProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase
        .from("employees")
        .update({ profile_id: null })
        .eq("id", employeeId);
      if (error) throw error;
    },
    onSuccess: (_data, employeeId) => {
      queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({ title: "Vínculo de usuario eliminado" });
    },
    onError: () => {
      toast({ title: "Error al desvincular el usuario", variant: "destructive" });
    },
  });
}
