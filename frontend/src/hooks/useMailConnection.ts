import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Saca el mensaje ÚTIL de un error de edge function.
 *
 * `supabase.functions.invoke` devuelve un error genérico ("non-2xx status
 * code") y deja la Response en `error.context`. Nuestras funciones ponen
 * el motivo en el body como `{ error: "..." }`, así que sin leer el
 * context se pierde exactamente la información que hace falta.
 */
export async function describeFunctionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown }).context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      if (body?.error) return String(body.error);
      const txt = await ctx.clone().text();
      if (txt) return txt.slice(0, 400);
    } catch {
      // body no-JSON o ya consumido: caemos al mensaje genérico
    }
  }
  return (error as Error)?.message ?? "error desconocido";
}

/**
 * Estado de la conexión de correo del usuario contra Zoho.
 *
 * Lee `v_my_mail_connection`, NO la tabla: el `refresh_token` está fuera
 * del GRANT de `authenticated`, así que pedirlo desde el navegador devuelve
 * 403. La vista expone solo qué casilla está conectada y desde cuándo.
 */
export interface MailConnection {
  id: string;
  provider: string;
  email_address: string;
  connected_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  is_active: boolean;
  has_error: boolean;
}

export function useMailConnection() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["mail-connection", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<MailConnection | null> => {
      const { data, error } = await supabase
        .from("v_my_mail_connection")
        .select("*")
        .is("revoked_at", null)
        .maybeSingle();
      if (error) throw error;
      return (data as MailConnection | null) ?? null;
    },
  });

  /** Arranca el flujo: pedimos la URL de Zoho y mandamos al usuario allá. */
  const start = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("mail-connect", {
      body: { action: "start" },
    });
    if (error) throw new Error(await describeFunctionError(error));
    const payload = data as { auth_url?: string; state?: string; error?: string };
    if (payload.error || !payload.auth_url || !payload.state) {
      throw new Error(payload.error ?? "no se pudo iniciar la conexión");
    }
    // Guardamos el state para compararlo cuando Zoho nos devuelva. Es una
    // segunda barrera además de la firma HMAC que valida el backend: si el
    // state que vuelve no es el que mandamos, ni siquiera lo enviamos.
    sessionStorage.setItem("mail_oauth_state", payload.state);
    window.location.href = payload.auth_url;
  }, []);

  /** Cierra el flujo con el `code` que Zoho dejó en la URL. */
  const finish = useMutation({
    mutationFn: async ({ code, state }: { code: string; state: string }) => {
      const expected = sessionStorage.getItem("mail_oauth_state");
      if (!expected || expected !== state) {
        throw new Error(
          "El state no coincide con el que iniciamos. Por seguridad no se completó la conexión — vuelve a intentar desde Maven.",
        );
      }
      const { data, error } = await supabase.functions.invoke("mail-connect", {
        body: { action: "callback", code, state },
      });
      // OJO: ante un non-2xx, supabase-js NO pone el cuerpo en `error` —
      // deja "Edge Function returned a non-2xx status code", que no dice
      // nada. El motivo real viene en el body, accesible por
      // `error.context` (la Response). Sin esto el diagnóstico es a ciegas.
      if (error) throw new Error(await describeFunctionError(error));
      const payload = data as { ok?: boolean; email_address?: string; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "no se pudo completar la conexión");
      sessionStorage.removeItem("mail_oauth_state");
      return payload.email_address as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mail-connection"] }),
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("mail-connect", {
        body: { action: "disconnect" },
      });
      if (error) throw new Error(await describeFunctionError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mail-connection"] }),
  });

  return {
    connection: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    start,
    finish,
    disconnect,
  };
}
