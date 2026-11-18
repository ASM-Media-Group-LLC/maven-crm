import { useAhoraCadaSegundo } from "@/lib/ahoraCompartido";
import { formatoReloj, segundosMostrados, type RelojCowork } from "@/lib/coworkReloj";

// Los segunderos del Supervisor Hub (ver lib/ahoraCompartido.ts): se mueven
// cada segundo sin redibujar la página entera.

/** El reloj de trabajo de una persona («3h 42m 07s»). */
export function RelojDePersona({ reloj }: { reloj: RelojCowork }) {
  const ahora = useAhoraCadaSegundo();
  return <>{formatoReloj(segundosMostrados(reloj, ahora))}</>;
}

/** Tiempo transcurrido desde `desde` (ms). */
export function Cronometro({ desde }: { desde: number }) {
  const ahora = useAhoraCadaSegundo();
  return <>{formatoReloj(Math.max(0, Math.floor((ahora - desde) / 1000)))}</>;
}
