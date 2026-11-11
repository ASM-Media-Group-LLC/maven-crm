import { usePulsoEquipo } from "@/hooks/usePulsoEquipo";
import { useVigilancia } from "@/hooks/useVigilancia";
import { useMiniaturasVivas, type MiniaturaViva } from "@/hooks/useMiniaturasVivas";
import { enlaceEnVivo, PUNTOS_VIVOS, type EstadoVivo, type MotivoVivo } from "@/lib/motivosVivos";
import type { PersonaPulso } from "@/lib/pulsoEquipo";

// «QUIÉN ESTÁ BAJANDO AHORA» (Alvaro, 11/11/2026): la lista corta de quién baja
// la nota del equipo en este momento —alertas vivas de Argos, quien se salió de
// Cowork y las faltas del rondín—, con su miniatura viva, el motivo en palabras,
// su nota viva y cuánto lleva. Sale del Pulso (mismo roster por jerarquía: el
// dueño a todos, RR. HH. sin admins, el supervisor su equipo) y la ven quienes
// pueden vigilar (useVigilancia).

export interface FilaQuienBaja {
  userId: string;
  nombre: string;
  equipo: string;
  estado: EstadoVivo;
  /** ISO de cuándo empezó lo que lo tiene aquí. */
  desde: string | null;
  /** El peor motivo (lo que se muestra). */
  motivo: MotivoVivo | null;
  /** Cuántos motivos más tiene ahora mismo. */
  otros: number;
  /** Su nota viva (0–100). */
  puntos: number;
  miniatura: MiniaturaViva | null;
  /** A dónde lleva tocar la fila: su vista en vivo con ESTE motivo arriba. */
  enlace: string;
}

export function filasDeQuienBaja(personas: PersonaPulso[], miniaturas: Record<string, MiniaturaViva>): FilaQuienBaja[] {
  return personas.map((p) => {
    const motivo = p.motivos[0] ?? null;
    return {
      userId: p.userId,
      nombre: p.nombre,
      equipo: p.equipo,
      estado: p.estado,
      desde: motivo?.desde ?? p.desde,
      motivo,
      otros: Math.max(0, p.motivos.length - 1),
      puntos: PUNTOS_VIVOS[p.estado] ?? 0,
      miniatura: miniaturas[p.userId] ?? null,
      enlace: enlaceEnVivo(p.userId, motivo),
    };
  });
}

export function useQuienBaja() {
  const vig = useVigilancia();
  const pulso = usePulsoEquipo();
  const habilitado = vig.puede === true && pulso.puedeVer;
  const personas = habilitado ? pulso.pulso?.quienLaBaja ?? [] : [];
  const minis = useMiniaturasVivas(personas.map((p) => p.userId), habilitado);
  return {
    puede: vig.puede === true,
    filas: filasDeQuienBaja(personas, minis.miniaturas),
    cargando: vig.cargando || (habilitado && pulso.cargando && !pulso.pulso),
    // Un fallo no es «nadie está bajando»: se dice y se reintenta.
    error: habilitado ? pulso.error : vig.error,
    // La miniatura que falla no tumba la lista: la fila queda sin foto.
    errorMiniaturas: minis.error,
    reintentar: () => { vig.reintentar(); pulso.reintentar(); },
  };
}
