import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAddCreador } from "./useCreadores";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { normalizeHandle } from "@/lib/handle-utils";

const schema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  artistic_name: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  category: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  status: z.string().default("onboarding"),
  instagram_handle: z.string().optional(),
  onlyfans_url: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AddCreadorModal = ({ open, onOpenChange }: Props) => {
  const { mutateAsync, isPending } = useAddCreador();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { status: "onboarding" },
  });

  const onSubmit = async (data: FormData) => {
    try {
      // Duplicate check by instagram_handle
      if (data.instagram_handle) {
        const normalized = normalizeHandle(data.instagram_handle);
        if (normalized) {
          const { data: existing } = await supabase
            .from("creators")
            .select("id, name, instagram_handle")
            .ilike("instagram_handle", normalized)
            .maybeSingle();
          if (existing) {
            toast({
              title: "Duplicado detectado",
              description: `Ya existe un creador con este handle: ${existing.name}`,
              variant: "destructive",
            });
            return;
          }
        }
      }

      await mutateAsync({
        name: data.name,
        artistic_name: data.artistic_name || null,
        email: data.email || null,
        phone: data.phone || null,
        category: data.category || null,
        country: data.country || null,
        city: data.city || null,
        status: data.status,
        instagram_handle: data.instagram_handle || null,
        onlyfans_url: data.onlyfans_url || null,
      });
      toast({ title: "Creador agregado exitosamente" });
      reset();
      onOpenChange(false);
    } catch {
      toast({ title: "Error al agregar creador", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar Creador</DialogTitle>
          <DialogDescription>Completa los datos del nuevo creador.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre *</Label>
              <Input id="name" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="artistic_name">Nombre artístico</Label>
              <Input id="artistic_name" {...register("artistic_name")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" {...register("phone")} />
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select defaultValue="onboarding" onValueChange={(v) => setValue("status", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="leaving">Leaving</SelectItem>
                  <SelectItem value="terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Categoría</Label>
              <Input id="category" {...register("category")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country">País</Label>
              <Input id="country" {...register("country")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Ciudad</Label>
              <Input id="city" {...register("city")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="instagram_handle">Instagram</Label>
              <Input id="instagram_handle" {...register("instagram_handle")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="onlyfans_url">OnlyFans URL</Label>
              <Input id="onlyfans_url" {...register("onlyfans_url")} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando…" : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddCreadorModal;
