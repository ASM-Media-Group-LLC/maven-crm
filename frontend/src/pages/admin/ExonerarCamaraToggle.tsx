import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, VideoOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { useEsDueno } from "@/hooks/useEsDueno";
import type { AdminUser } from "./useAdminUsers";

// Exonerar de cámara/pantalla por persona (Alvaro, 05/11): un botón en cada fila
// de /admin/usuarios para que a esa persona NO se le pida cámara ni compartir
// pantalla (ej. Álvaro René). A un exonerado no se le califica en esos factores.
// SOLO el dueño lo ve y lo puede poner (candado en la RPC argos_exonerar_persona).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as {
  from: (t: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (f: string, a: unknown) => Promise<{ data: any; error: { message: string } | null }>;
};

/** Conjunto de user_id exonerados de cámara/pantalla. */
export function useExoneradosCamara() {
  return useQuery({
    queryKey: ["exonerados-camara"],
    queryFn: async (): Promise<Set<string>> => {
      const { data } = await sinTipar.from("profiles").select("id").eq("exonera_camara_pantalla", true);
      return new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
    },
    staleTime: 60_000,
  });
}

export function ExonerarCamaraToggle({ user }: { user: AdminUser }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { esDueno } = useEsDueno();
  const { data: exonerados } = useExoneradosCamara();
  const [guardando, setGuardando] = useState(false);

  // Solo el dueño asigna la exoneración.
  if (esDueno !== true) return null;

  const exento = exonerados?.has(user.id) ?? false;
  const titulo = exento ? t("admin.exonera.quitarHint") : t("admin.exonera.darHint");

  const toggle = async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      const next = !exento;
      const { error } = await sinTipar.rpc("argos_exonerar_persona", { _user: user.id, _on: next });
      if (error) throw new Error(error.message);
      await qc.invalidateQueries({ queryKey: ["exonerados-camara"] });
      toast({ title: next ? t("admin.exonera.dado") : t("admin.exonera.quitado") });
    } catch (e) {
      toast({ title: t("admin.exonera.error"), description: (e as Error).message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={guardando}
      title={titulo}
      aria-label={titulo}
      aria-pressed={exento}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition disabled:opacity-60 ${
        exento ? "border-warning/40 bg-warning/10 text-warning" : "border-border/50 text-muted-foreground hover:bg-foreground/5"
      }`}
    >
      {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <VideoOff className="h-4 w-4" />}
    </button>
  );
}
