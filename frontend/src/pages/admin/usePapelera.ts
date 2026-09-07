import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminInvoke, SessionExpiredError } from "@/lib/adminInvoke";
import { useToast } from "@/hooks/use-toast";

/** Una cuenta eliminada que todavía se puede recuperar. */
export interface CuentaEnPapelera {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
  email: string;
  deleted_at: string;
  deleted_by: string | null;
  deleted_by_name: string | null;
  /** Puede ser 0: es una que el cron va a purgar en el próximo pase. */
  dias_restantes: number;
}

interface RespuestaPapelera {
  dias_de_papelera: number;
  users: CuentaEnPapelera[];
}

/**
 * La papelera de cuentas: lo eliminado sigue recuperable un tiempo, como en
 * Google Workspace. Eliminar NO destruye — suspende (ver la edge
 * admin-user-actions). Lo que destruye de verdad es `purgar`, que es solo-admin.
 */
export function usePapelera(activa: boolean) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["cuentas-en-papelera"],
    // Solo pega a la edge cuando el tab está abierto: es una pantalla que se
    // visita de vez en cuando, no hace falta cargarla con la página.
    enabled: activa,
    queryFn: async () => {
      const r = await adminInvoke<RespuestaPapelera>("admin-user-actions", {
        action: "list_deleted_users",
      });
      return r;
    },
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["cuentas-en-papelera"] });
    // El listado normal también cambia: al recuperar, la persona vuelve a él.
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const alFallar = (e: Error) => {
    toast({
      title: e instanceof SessionExpiredError ? "Sesión expirada" : "Error",
      description: e.message,
      variant: "destructive",
    });
  };

  const recuperar = useMutation({
    mutationFn: (userId: string) =>
      adminInvoke("admin-user-actions", { action: "restore_user", user_id: userId }),
    onSuccess: invalidar,
    onError: alFallar,
  });

  const purgar = useMutation({
    mutationFn: (userId: string) =>
      adminInvoke("admin-user-actions", { action: "purge_user", user_id: userId }),
    onSuccess: invalidar,
    onError: alFallar,
  });

  return {
    cuentas: data?.users ?? [],
    diasDePapelera: data?.dias_de_papelera ?? 30,
    isLoading,
    refetch,
    recuperar,
    purgar,
  };
}
