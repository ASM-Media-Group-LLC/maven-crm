import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface RoadmapCategory {
  id: string;
  name: string;
  position: number;
  created_at: string;
}

export interface RoadmapItem {
  id: string;
  category_id: string;
  submodule: string | null;
  task: string;
  description: string | null;
  status: string;
  delivery_date: string | null;
  completed_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export const useRoadmap = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const categoriesQuery = useQuery({
    queryKey: ["roadmap-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roadmap_categories" as any)
        .select("*")
        .order("position");
      if (error) throw error;
      return data as unknown as RoadmapCategory[];
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["roadmap-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roadmap_items" as any)
        .select("*")
        .order("position");
      if (error) throw error;
      return data as unknown as RoadmapItem[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["roadmap-categories"] });
    queryClient.invalidateQueries({ queryKey: ["roadmap-items"] });
  };

  const updateItemStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updateData: any = { status };
      if (status === "done") {
        updateData.completed_at = new Date().toISOString();
      } else {
        updateData.completed_at = null;
      }
      const { error } = await supabase
        .from("roadmap_items" as any)
        .update(updateData)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateDeliveryDate = useMutation({
    mutationFn: async ({ id, delivery_date }: { id: string; delivery_date: string | null }) => {
      const { error } = await supabase
        .from("roadmap_items" as any)
        .update({ delivery_date } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addItem = useMutation({
    mutationFn: async (item: { category_id: string; task: string; submodule?: string }) => {
      const items = itemsQuery.data?.filter((i) => i.category_id === item.category_id) || [];
      const maxPos = items.length > 0 ? Math.max(...items.map((i) => i.position)) : 0;
      const { error } = await supabase
        .from("roadmap_items" as any)
        .insert({ ...item, status: "todo", position: maxPos + 1 } as any);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("roadmap_items" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addCategory = useMutation({
    mutationFn: async (name: string) => {
      const cats = categoriesQuery.data || [];
      const maxPos = cats.length > 0 ? Math.max(...cats.map((c) => c.position)) : 0;
      const { error } = await supabase
        .from("roadmap_categories" as any)
        .insert({ name, position: maxPos + 1 } as any);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("roadmap_categories" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Pick<RoadmapItem, "task" | "submodule" | "description">> }) => {
      const { error } = await supabase
        .from("roadmap_items" as any)
        .update(data as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from("roadmap_categories" as any)
        .update({ name } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return {
    categories: categoriesQuery.data || [],
    items: itemsQuery.data || [],
    isLoading: categoriesQuery.isLoading || itemsQuery.isLoading,
    updateItemStatus,
    updateDeliveryDate,
    updateItem,
    updateCategory,
    addItem,
    deleteItem,
    addCategory,
    deleteCategory,
  };
};
