import { useCallback, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, HardDrive } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { pedirTamanos, useUsoAgencia, useUsoDrive } from "@/hooks/useDrive";
import { cambioDeEspacio, entraEnElEspacio, type CambioDeEspacio, type FichaParaEspacio } from "@/lib/drive/espacio";
import { tamano } from "@/lib/drive/formato";

// Drive: el aviso ANTES de mover algo que cambia de qué espacio se descuenta
// (Jhon, 03/10: «como Google»). Cuándo cambia y por qué está en
// lib/drive/espacio.ts: en Maven no hay cupos por unidad, sino dos bolsas (el
// espacio personal de cada propietario y el espacio común de la agencia, el
// de TODAS las unidades compartidas). Entre dos unidades no hay aviso.

/** `types.ts` es generado y todavía no conoce estas tablas. */
const tabla = (n: string) => supabase.from(n as never);

/** Lo que la base dice HOY de cada ficha (la pantalla puede venir de una
 *  vista sin la unidad). De a 150: una URL con más ids se corta. */
async function fichasParaEspacio(ids: readonly string[]): Promise<FichaParaEspacio[]> {
  const todas: FichaParaEspacio[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await tabla("drive_items").select("id, tipo, owner_id, size, unidad_id").in("id", ids.slice(i, i + 150));
    if (error) throw error;
    todas.push(...((data ?? []) as unknown as FichaParaEspacio[]));
  }
  return todas;
}

/** La unidad compartida de la carpeta de destino (null: Mi unidad o una
 *  carpeta fuera de las unidades). */
async function unidadDe(carpeta: string | null): Promise<string | null> {
  if (!carpeta) return null;
  const { data, error } = await tabla("drive_items").select("unidad_id").eq("id", carpeta).maybeSingle();
  if (error) throw error;
  return (data as unknown as { unidad_id: string | null } | null)?.unidad_id ?? null;
}

interface Pedido {
  cambio: CambioDeEspacio;
  destino: string;
  responder: (seguir: boolean) => void;
}

/**
 * `confirmar(fichas, carpeta, nombre)` antes de mover: si nada cambia de
 * espacio, sigue sin preguntar; si cambia, muestra el aviso y espera la
 * respuesta. Si no se puede saber (sin conexión), sigue: el aviso informa,
 * no es un permiso (la base decide qué se puede mover). `dialogo` va en la
 * pantalla que mueve.
 */
export function useAvisoDeEspacio(): {
  confirmar: (fichas: readonly { id: string }[], carpeta: string | null, nombreDestino: string) => Promise<boolean>;
  dialogo: ReactNode;
} {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const confirmar = useCallback(async (fichas: readonly { id: string }[], carpeta: string | null, nombreDestino: string) => {
    let cambio: CambioDeEspacio | null;
    try {
      const [actuales, unidad] = await Promise.all([fichasParaEspacio(fichas.map((f) => f.id)), unidadDe(carpeta)]);
      cambio = cambioDeEspacio(actuales, unidad);
    } catch {
      return true;
    }
    if (!cambio) return true;
    const elCambio = cambio;
    return new Promise<boolean>((resolver) => setPedido({
      cambio: elCambio,
      destino: nombreDestino,
      responder: (seguir) => { setPedido(null); resolver(seguir); },
    }));
  }, []);
  return { confirmar, dialogo: pedido ? <AvisoDeEspacio pedido={pedido} /> : null };
}

function AvisoDeEspacio({ pedido }: { pedido: Pedido }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { cambio, destino, responder } = pedido;
  const aAgencia = cambio.hacia === "agencia";
  const usoAgencia = useUsoAgencia(aAgencia);
  const usoMio = useUsoDrive();
  const todoMio = cambio.cambian.every((f) => f.owner_id === user?.id);
  const sinDueno = cambio.cambian.some((f) => !f.owner_id);

  // Cuánto ocupa lo que cambia de espacio: los archivos y lo de adentro de
  // las carpetas (drive_tamanos, de a 100).
  const ids = cambio.cambian.map((f) => f.id).join(",");
  const ocupa = useQuery({
    queryKey: ["drive-mover-ocupa", ids],
    staleTime: 60_000,
    queryFn: async (): Promise<{ bytes: number; completo: boolean }> => {
      let bytes = 0;
      let completo = true;
      for (const f of cambio.cambian) if (f.tipo === "archivo") bytes += Number(f.size ?? 0);
      const carpetas = cambio.cambian.filter((f) => f.tipo === "carpeta").map((f) => f.id);
      for (let i = 0; i < carpetas.length; i += 100) {
        const tanda = carpetas.slice(i, i + 100);
        const medidas = await pedirTamanos(tanda);
        for (const id of tanda) {
          const m = medidas.get(id);
          if (!m) { completo = false; continue; }
          bytes += m.bytes;
          if (!m.completo) completo = false;
        }
      }
      return { bytes, completo };
    },
  });

  const n = cambio.cambian.length;
  const texto = aAgencia
    ? (n === 1 ? t("drive.espacio.aAgenciaUno") : t("drive.espacio.aAgenciaVarios", { n }))
    : (n === 1 ? t("drive.espacio.aPersonalUno") : t("drive.espacio.aPersonalVarios", { n }));
  const bytes = ocupa.data?.bytes ?? 0;

  let uso: string | null = null;
  let noEntra = false;
  if (aAgencia && usoAgencia.data) {
    const { usado, cupo } = usoAgencia.data;
    uso = cupo == null
      ? t("drive.espacio.agenciaSinTope", { usado: tamano(usado) })
      : t("drive.espacio.agencia", { usado: tamano(usado), cupo: tamano(cupo) });
    noEntra = !!ocupa.data && !entraEnElEspacio(usado, cupo, bytes);
  } else if (!aAgencia && todoMio && usoMio.data) {
    const { usado, cupo } = usoMio.data;
    uso = t("drive.espacio.tuyo", { usado: tamano(usado), cupo: tamano(cupo) });
    noEntra = !!ocupa.data && !entraEnElEspacio(usado, cupo, bytes);
  } else if (!aAgencia) {
    uso = t("drive.espacio.deCadaUno");
  }
  const Icono = aAgencia ? Building2 : HardDrive;

  return (
    <AlertDialog open onOpenChange={(v) => { if (!v) responder(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">{t("drive.espacio.titulo", { destino })}</AlertDialogTitle>
          <AlertDialogDescription>{texto}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-start gap-3 rounded-panel bg-muted/50 px-3 py-2.5 text-sm">
          <Icono className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-1">
            <p>
              {ocupa.isPending ? t("drive.espacio.calculando")
                : ocupa.data ? t(ocupa.data.completo ? "drive.espacio.ocupa" : "drive.espacio.ocupaAlMenos", { tamano: tamano(bytes) })
                  : t("drive.espacio.sinTamano")}
            </p>
            {uso && <p className="text-muted-foreground">{uso}</p>}
            {!aAgencia && sinDueno && <p className="text-muted-foreground">{t("drive.espacio.sinDueno")}</p>}
            {noEntra && (
              <p className="font-medium text-destructive">
                {t(aAgencia ? "drive.espacio.noEntraAgencia" : "drive.espacio.noEntraTuyo")}
              </p>
            )}
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => responder(false)}>{t("drive.cancelar")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => responder(true)}>{t("drive.espacio.mover")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
