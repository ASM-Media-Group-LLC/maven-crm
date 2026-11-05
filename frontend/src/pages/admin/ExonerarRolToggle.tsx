import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, VideoOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { useEsDueno } from "@/hooks/useEsDueno";

// Exonerar de cámara/pantalla por ROL (Alvaro, 05/11): un interruptor dentro del
// modal del rol. A todos los de ese rol no se les pide cámara ni compartir
// pantalla (no se les califica en esos factores). SOLO el dueño lo ve y lo pone;
// se guarda solo al tocarlo (RPC argos_exonerar_rol, candado en el servidor).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as {
  from: (t: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (f: string, a: unknown) => Promise<{ data: any; error: { message: string } | null }>;
};

export function ExonerarRolToggle({ roleName }: { roleName: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { esDueno } = useEsDueno();
  const [guardando, setGuardando] = useState(false);

  const q = useQuery({
    enabled: esDueno === true && !!roleName,
    queryKey: ["exonera-rol", roleName],
    queryFn: async (): Promise<boolean> => {
      const { data } = await sinTipar.from("roles_config").select("exonera_camara_pantalla").eq("name", roleName).maybeSingle();
      return (data?.exonera_camara_pantalla as boolean | undefined) ?? false;
    },
    staleTime: 60_000,
  });

  if (esDueno !== true) return null;
  const exento = q.data ?? false;

  const toggle = async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      const next = !exento;
      const { error } = await sinTipar.rpc("argos_exonerar_rol", { _role: roleName, _on: next });
      if (error) throw new Error(error.message);
      await qc.invalidateQueries({ queryKey: ["exonera-rol", roleName] });
      await qc.invalidateQueries({ queryKey: ["exonerados-camara"] });
      toast({ title: next ? t("admin.exonera.dado") : t("admin.exonera.quitado") });
    } catch (e) {
      toast({ title: t("admin.exonera.error"), description: (e as Error).message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <button type="button" onClick={toggle} disabled={guardando || q.isLoading} aria-pressed={exento}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition disabled:opacity-60 ${
        exento ? "border-warning/40 bg-warning/10" : "border-border/50 hover:bg-foreground/5"
      }`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${exento ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>
        {guardando || q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <VideoOff className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{t("admin.exonera.rolLabel")}</span>
        <span className="block text-xs text-muted-foreground">{t("admin.exonera.rolHint")}</span>
      </span>
      <span className={`shrink-0 text-xs font-semibold ${exento ? "text-warning" : "text-muted-foreground"}`}>
        {exento ? "ON" : "OFF"}
      </span>
    </button>
  );
}
