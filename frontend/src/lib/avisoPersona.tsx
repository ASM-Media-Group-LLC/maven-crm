import { AlertTriangle, ArrowUpRight, Check, Info, X } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";
import { dicebearSistemaUri } from "@/lib/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useUserProfile";
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

/** El glifo de la insignia del sistema: es lo que dice qué pasó cuando el
 *  color no alcanza (y para quien no lo distingue, nunca alcanza). */
const GLIFO: Record<TonoAviso, typeof Check> = {
  neutral: Info,
  bien: Check,
  ojo: AlertTriangle,
  mal: X,
};

const PUNTO: Record<TonoAviso, string> = {
  neutral: "bg-primary",
  bien: "bg-emerald-500",
  ojo: "bg-amber-500",
  mal: "bg-red-500",
};

/** El avatar del aviso, con un punto del color del tono: eso es lo que lo
 *  hace leerse como "esto es de alguien" y no como un ícono más.
 *
 *  ⚠️ DOS COSAS QUE YA SALIERON MAL ACÁ, NO DESHACER:
 *
 *  1. El anillo NO se pasa por `className`. `UserAvatar` lo dibuja por dentro
 *     con su prop `ring` (y solo, cuando hay muñequito); un `ring-2` por
 *     className aterriza en el envoltorio, que no es redondo, y sale un
 *     CUADRADO de color alrededor de la cara. Se vio en producción.
 *  2. El tamaño es `sm` (32px), el mismo que usa el hueco del ícono del
 *     aviso. Con `md` (40px) la cara se sale del hueco y se monta encima del
 *     texto — y con muñequito el avatar ya trae su propio anillo, así que
 *     abulta todavía más.
 *
 *  El color del tono ya lo dice la barra izquierda del aviso; acá alcanza con
 *  el punto. */
function CaraDelAviso({ nombre, foto, seed, tono }: { nombre: string; foto?: string | null; seed?: string | null; tono: TonoAviso }) {
  return (
    <span className="relative inline-flex h-8 w-8 shrink-0">
      <UserAvatar name={nombre} src={foto ?? undefined} seed={seed ?? undefined} size="sm" ring />
      <span
        className={cn(
          "pointer-events-none absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
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
  /** Botón al lado del aviso que lleva a lo que se está avisando. La etiqueta
   *  la trae quien llama, ya traducida (acá no hay contexto de React). */
  abrir?: { etiqueta: string; alTocar: () => void };
  /** Mismo `id` = el aviso se reemplaza en vez de apilarse. Sirve para
   *  eventos que pueden llegar repetidos (una alerta que se reevalúa). */
  id?: string;
}

/** Un aviso protagonizado por una persona, con su cara. */
export function avisarPersona({ nombre, foto, seed, titulo, detalle, tono = "neutral", duracion, id, abrir }: AvisoPersona) {
  return toast(titulo, {
    id,
    description: detalle,
    duration: duracion,
    icon: <CaraDelAviso nombre={nombre} foto={foto} seed={seed} tono={tono} />,
    action: abrir
      ? {
          // La flecha dice "esto te lleva a otro lado" sin leerlo. El estilo
          // del botón vive en index.css ("AVISOS (sonner)").
          label: (
            <>
              {abrir.etiqueta}
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
            </>
          ),
          onClick: abrir.alTocar,
        }
      : undefined,
  });
}

/** El ícono de los avisos del SISTEMA: el robot de Maven con una insignia
 *  chiquita que dice si salió bien, mal o si es un aviso.
 *
 *  Por qué la insignia y no solo el color: el muñequito da el "esto lo dice
 *  Maven", pero el tilde o la cruz es lo que dice QUÉ pasó, y eso no puede
 *  depender de distinguir un verde de un rojo. Va sobre el muñequito, chica,
 *  como el punto de presencia de las personas.
 *
 *  Se monta una vez en el `Toaster` (prop `icons`), así que TODOS los avisos
 *  de tipo de la app lo usan sin tocar los ~100 archivos que los disparan. */
export function IconoSistema({ tono }: { tono: TonoAviso }) {
  const Glifo = GLIFO[tono];
  return (
    <span className="relative inline-flex h-8 w-8 shrink-0">
      <span className="h-full w-full rounded-full bg-gradient-to-br from-primary to-accent p-[2px]">
        <span className="ua-ring-gap grid h-full w-full place-items-center rounded-full bg-background p-[2px]">
          <img src={dicebearSistemaUri()} alt="" className="h-full w-full rounded-full" draggable={false} />
        </span>
      </span>
      <span
        className={cn(
          "pointer-events-none absolute -bottom-0.5 -right-0.5 grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-card text-[7px] text-white",
          PUNTO[tono],
        )}
      >
        <Glifo strokeWidth={4} className="h-2 w-2" aria-hidden="true" />
      </span>
    </span>
  );
}

export { CaraDelAviso };

/** Avisos sobre MI PROPIA cuenta: "skin aplicado", "foto actualizada",
 *  "número guardado". Van con mi muñequito porque hablan de algo mío, no de
 *  algo que hizo la plataforma sola — y ver tu propia cara confirma, sin
 *  leer, que el cambio quedó en TU cuenta y no en otra.
 *
 *  Se usa como hook porque necesita el perfil:
 *
 *      const avisarme = useAvisarme();
 *      avisarme("Skin aplicado", s.label);
 *
 *  Los ERRORES no pasan por acá: un fallo lo produjo la plataforma, y ahí el
 *  ícono rojo dice más que una cara. */
export function useAvisarme() {
  const { user } = useAuth();
  const perfil = useMyProfile();

  return (titulo: string, detalle?: string, tono: TonoAviso = "bien") =>
    avisarPersona({
      nombre:
        (user?.user_metadata?.full_name as string | undefined) ||
        perfil.data?.full_name ||
        "Tu cuenta",
      foto: perfil.data?.avatar_url ?? null,
      // Sin foto, el muñequito sale del seed que la persona eligió; si no
      // eligió ninguno, del id, que es lo que usa el resto de la app.
      seed: perfil.data?.avatar_seed ?? user?.id ?? null,
      titulo,
      detalle,
      tono,
    });
}
