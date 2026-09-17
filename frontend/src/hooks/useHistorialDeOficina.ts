import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import type { DatosDeVersion, Historial, ListaDeHistorial } from "@/hooks/useOnlyOffice";

/** Lo que devuelve la edge: igual que la lista del editor pero con las fechas
 *  en ISO, sin formatear. */
interface ListaCruda {
  currentVersion: number;
  history: {
    version: number;
    key: string;
    created: string;
    user?: { id: string; name: string };
  }[];
}

async function llamar<T>(body: Record<string, unknown>): Promise<T> {
  const { data: sesion } = await supabase.auth.getSession();
  const token = sesion.session?.access_token;
  if (!token) throw new Error("Sin sesión");
  const { data, error } = await supabase.functions.invoke("oficina-doc", {
    body, headers: { Authorization: `Bearer ${token}` },
  });
  if (error) {
    const payload = (data ?? {}) as { error?: string };
    throw new Error(payload.error || error.message);
  }
  const payload = data as T & { error?: string };
  if (payload?.error) throw new Error(payload.error);
  return payload;
}

/** Le da de comer al panel de versiones nativo de ONLYOFFICE.
 *
 *  Las fechas llegan en ISO y se formatean ACÁ: el editor las escribe tal cual
 *  en la lista, así que tienen que venir ya en el huso y el idioma de quien
 *  mira. Armarlas en la edge las mostraría en UTC —en Bogotá, cinco horas
 *  corridas— y con los meses en inglés. */
export function useHistorialDeOficina(
  documentoId: string | undefined,
  alCerrar: () => void,
): Historial | undefined {
  const qc = useQueryClient();
  const { language } = useLanguage();
  const locale = language === "es" ? es : undefined;

  const pedirLista = useCallback(async (): Promise<ListaDeHistorial> => {
    const cruda = await llamar<ListaCruda>({ action: "historial", id: documentoId });
    return {
      currentVersion: cruda.currentVersion,
      history: cruda.history.map((v) => ({
        ...v,
        created: format(new Date(v.created), "d MMM yyyy, HH:mm", { locale }),
      })),
    };
  }, [documentoId, locale]);

  const pedirVersion = useCallback(
    (version: number) =>
      llamar<DatosDeVersion>({ action: "historial-version", id: documentoId, version }),
    [documentoId],
  );

  const restaurar = useCallback(async (version: number) => {
    await llamar<{ version: number }>({
      action: "historial-restaurar", id: documentoId, version,
    });
    // Restaurar crea una versión nueva: el listado y la ficha del documento
    // muestran el número de versión y quedarían atrasados.
    qc.invalidateQueries({ queryKey: ["documentos"] });
    qc.invalidateQueries({ queryKey: ["documento", documentoId] });
  }, [documentoId, qc]);

  if (!documentoId) return undefined;
  return { pedirLista, pedirVersion, restaurar, alCerrar };
}
