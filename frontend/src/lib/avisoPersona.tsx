import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";

// AVISOS CON CARA.
//
// Cuando el aviso es sobre una PERSONA —alguien finalizó la sesión, alguien te
// mandó karma, a alguien se le apagó la cámara— mostrar su muñequito hace que
// se entienda antes de leer el texto. Es el mismo avatar determinista que usa
// el resto de Maven (mismo seed → mismo dibujo), así que la cara del aviso es
// la que la persona ya reconoce del Messenger y del sidebar.
//
// Para los avisos del sistema (guardado, error de red, permiso denegado) NO se
// usa esto: ahí va el ícono de tipo de sonner, que dice mejor "esto lo hizo la
// plataforma, no una persona".

export type TonoAviso = "neutral" | "bien" | "ojo" | "mal";

const ANILLO: Record<TonoAviso, string> = {
  neutral: "ring-primary/60",
  bien: "ring-emerald-500/70",
  ojo: "ring-amber-500/70",
  mal: "ring-red-500/70",
};

const PUNTO: Record<TonoAviso, string> = {
  neutral: "bg-primary",
  bien: "bg-emerald-500",
  ojo: "bg-amber-500",
  mal: "bg-red-500",
};

/** El avatar del aviso: anillo del color del tono y un punto de estado, que es
 *  lo que lo hace leerse como "esto es de alguien" y no como un ícono más. */
function CaraDelAviso({ nombre, foto, seed, tono }: { nombre: string; foto?: string | null; seed?: string | null; tono: TonoAviso }) {
  return (
    <span className="relative inline-flex shrink-0">
      <UserAvatar
        name={nombre}
        src={foto ?? undefined}
        seed={seed ?? undefined}
        size="md"
        className={cn("ring-2 ring-offset-2 ring-offset-transparent", ANILLO[tono])}
      />
      <span
        className={cn(
          "absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
          PUNTO[tono],
        )}
      />
    </span>
  );
}

export interface AvisoPersona {
  /** Nombre de quien protagoniza el aviso. Se usa para el avatar y las iniciales. */
  nombre: string;
  /** Foto real si la hay; si no, sale el muñequito determinista. */
  foto?: string | null;
  /** Seed del avatar (avatar_seed del perfil): el mismo muñequito que ve el
   *  resto de la app. Sin esto se dibuja a partir del nombre. */
  seed?: string | null;
  titulo: string;
  detalle?: string;
  tono?: TonoAviso;
  /** Milisegundos. Sin esto usa el default de sonner. */
  duracion?: number;
  /** Mismo `id` = el aviso se reemplaza en vez de apilarse. Sirve para
   *  eventos que pueden llegar repetidos (una alerta que se reevalúa). */
  id?: string;
}

/** Un aviso protagonizado por una persona, con su cara. */
export function avisarPersona({ nombre, foto, seed, titulo, detalle, tono = "neutral", duracion, id }: AvisoPersona) {
  return toast(titulo, {
    id,
    description: detalle,
    duration: duracion,
    icon: <CaraDelAviso nombre={nombre} foto={foto} seed={seed} tono={tono} />,
  });
}

export { CaraDelAviso };
