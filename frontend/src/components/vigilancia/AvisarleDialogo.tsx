import AvisarDialog from "@/pages/cowork/AvisarDialog";
import type { Tr } from "./piezas";

// «Avisarle» desde la vista en vivo: la MISMA ventana del Avisar de Cowork (las
// situaciones por categoría con «Oír» y «Enviar», aprobada por Alvaro el 26/10),
// sin cambiarle nada. Lo único distinto es a dónde va el aviso: lo manda la
// página por la RPC monitoreo_avisar (no hace falta ser anfitrión de la sesión).
export default function AvisarleDialogo({ nombre, abierto, onAbierto, onEnviar, t }: {
  nombre: string | null;
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  onEnviar: (slug: string) => void;
  t: Tr;
}) {
  return <AvisarDialog nombreChatter={nombre} onAvisar={onEnviar} t={t} open={abierto} onOpenChange={onAbierto} />;
}
