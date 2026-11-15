import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";

// NO TIENES ACCESO A ESTE DOCUMENTO (Alvaro, 14/11/2026). Antes un documento
// privado que no te compartieron decía «No se pudo abrir el documento», como si se
// hubiera roto. Ahora dice de quién es y deja pedirle acceso con un botón: le llega
// una notificación (documento_pedir_acceso, una vez por hora y documento). Solo
// se muestra el nombre de la dueña o el dueño, nunca el título ni el contenido.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { rpc: (f: string, a?: unknown) => Promise<{ data: any; error: { message: string } | null }> };

/** PostgREST responde PGRST116 cuando `.single()` no encuentra la fila: no existe
 *  o la RLS no te la deja ver. Cualquier otro error es un fallo (red, servidor). */
export function esSinAcceso(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "PGRST116";
}

export default function SinAccesoDocumento({ id, onVolver }: { id: string; onVolver: () => void }) {
  const { t } = useLanguage();
  const quien = useQuery({
    queryKey: ["documento-de-quien", id],
    retry: 1,
    queryFn: async () => {
      const { data, error } = await sinTipar.rpc("documento_de_quien", { _doc: id });
      if (error) throw new Error(error.message);
      return data as { existe: boolean; dueno?: string };
    },
  });
  const pedir = useMutation({
    mutationFn: async () => {
      const { data, error } = await sinTipar.rpc("documento_pedir_acceso", { _doc: id });
      if (error) throw new Error(error.message);
      return data as { avisado: boolean; ya_pedido?: boolean; dueno?: string };
    },
  });

  const dueno = quien.data?.existe ? quien.data.dueno : null;
  const noExiste = quien.data && !quien.data.existe;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Lock className="h-5 w-5" />
      </div>
      {quien.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : noExiste ? (
        <>
          <p className="text-sm font-medium">{t("oficina.doc.sinAcceso.noExiste")}</p>
          <p className="text-xs text-muted-foreground">{t("oficina.doc.sinAcceso.noExisteHint")}</p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">{t("oficina.doc.sinAcceso.titulo")}</p>
          <p className="text-xs text-muted-foreground">
            {dueno ? t("oficina.doc.sinAcceso.deQuien", { nombre: dueno }) : t("oficina.doc.sinAcceso.deQuienSinNombre")}
          </p>
          {pedir.isSuccess ? (
            <p role="status" className="text-xs font-medium text-success">
              {pedir.data.avisado
                ? t("oficina.doc.sinAcceso.avisado", { nombre: pedir.data.dueno ?? dueno ?? "" })
                : t("oficina.doc.sinAcceso.yaPedido")}
            </p>
          ) : (
            <Button size="sm" className="mt-1 rounded-full" disabled={pedir.isPending} onClick={() => pedir.mutate()}>
              {pedir.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t("oficina.doc.sinAcceso.pedir")}
            </Button>
          )}
          {pedir.isError && <p role="alert" className="text-xs text-destructive">{t("oficina.doc.sinAcceso.falloPedir")}</p>}
        </>
      )}
      <Button variant="outline" size="sm" className="rounded-full" onClick={onVolver}>{t("oficina.backToOffice")}</Button>
    </div>
  );
}
