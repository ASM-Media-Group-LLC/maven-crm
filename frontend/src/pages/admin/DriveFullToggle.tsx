import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HardDrive, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import type { AdminUser } from "./useAdminUsers";

// Adendum de Drive por persona (Alvaro, 05/11): un botón en cada fila de
// /admin/usuarios para dar/quitar "Drive full del NAS". Quien lo tiene por su
// rol (admin/manager/coordinador) aparece prendido y bloqueado (no se quita
// desde acá: se lo da el rol). El resto se prende/apaga con la RPC
// drive_acceso_extra_set (solo dueño/admin, candado en el servidor).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as {
  from: (t: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (f: string, a: unknown) => Promise<{ data: any; error: { message: string } | null }>;
};

const NIVEL_CON_DRIVE = new Set(["dueno", "admin", "manager"]);
const PUESTO_CON_DRIVE = new Set(["Coordinador", "Coordinador Supervisor"]);

/** Conjunto de user_id que están en la lista de adendum. Lo lee dueño/admin. */
export function useDriveAddendum() {
  return useQuery({
    queryKey: ["drive-addendum"],
    queryFn: async (): Promise<Set<string>> => {
      const { data } = await sinTipar.from("drive_acceso_extra").select("user_id");
      return new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
    },
    staleTime: 60_000,
  });
}

export function DriveFullToggle({ user }: { user: AdminUser }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: addendum } = useDriveAddendum();
  const [guardando, setGuardando] = useState(false);

  const porRol = NIVEL_CON_DRIVE.has(user.nivel ?? "") || PUESTO_CON_DRIVE.has(user.role ?? "");
  const porAdendum = addendum?.has(user.id) ?? false;
  const tiene = porRol || porAdendum;

  const titulo = porRol
    ? t("admin.drive.porRol")
    : porAdendum
      ? t("admin.drive.quitarHint")
      : t("admin.drive.darHint");

  const toggle = async () => {
    if (porRol || guardando) return;
    setGuardando(true);
    try {
      const next = !porAdendum;
      const { error } = await sinTipar.rpc("drive_acceso_extra_set", { p_user: user.id, p_on: next });
      if (error) throw new Error(error.message);
      await qc.invalidateQueries({ queryKey: ["drive-addendum"] });
      toast({ title: next ? t("admin.drive.dado") : t("admin.drive.quitado") });
    } catch (e) {
      toast({ title: t("admin.drive.error"), description: (e as Error).message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={guardando || porRol}
      title={titulo}
      aria-label={titulo}
      aria-pressed={tiene}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
        tiene ? "border-primary/40 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:bg-foreground/5"
      } ${porRol ? "cursor-default opacity-70" : ""} disabled:opacity-60`}
    >
      {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
    </button>
  );
}
