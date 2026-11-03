import { useMemo } from "react";
import { useAtencionAhora, type TipoAlerta } from "@/hooks/useAtencionAhora";

// EL SEMÁFORO EN VIVO de Argos, en un solo lugar (Álvaro, 02/11), para que
// Conectados ahora y Pantallazos en vivo lo pinten IGUAL. Es el estado de ESTE
// instante, no del día. Cinco estados:
//   🟢 verde    — COMPARTE PANTALLA ahora Y está en lo suyo (trabajando bien)
//   🟡 amarillo — en pausa (baño/break): ojo, pero no es grave
//   🟠 naranja  — NO comparte pantalla ahora (o sin señal/cámara): hay que
//                 exigirle que comparta; ≠ estar en ocio
//   🔴 rojo     — de verdad fuera de lugar: ocio (YouTube, redes), celular, no mira
//   ⚪ gris     — comparte pantalla pero Argos aún no la juzga
// REGLA (Alvaro): sin compartir pantalla NO puede ser verde, aunque lo que haga
// sea trabajo. Compartir pantalla es el requisito para el verde.

export type Semaforo = "verde" | "amarillo" | "naranja" | "rojo" | "gris";

// OCIO = de verdad "no está en lo suyo". COBERTURA = Argos no puede ver (no es ocio).
const OCIO = new Set<TipoAlerta>(["fuera_de_lugar", "celular", "no_mira", "distraido"]);
const COBERTURA = new Set<TipoAlerta>(["sin_pantalla", "sin_senal", "camara_apagada", "camara_tapada", "cara_incompleta", "se_fue"]);

// Clases de color del punto, compartidas por los paneles.
export const PUNTO_SEM: Record<Semaforo, string> = {
  verde: "bg-success shadow-[0_0_6px_hsl(var(--success))]",
  amarillo: "bg-warning shadow-[0_0_6px_hsl(var(--warning))]",
  naranja: "bg-orange-500 shadow-[0_0_6px_#f97316]",
  rojo: "bg-destructive shadow-[0_0_6px_hsl(var(--destructive))] animate-pulse",
  gris: "bg-muted-foreground/40",
};

export function useSemaforos() {
  const { personas: enAtencion } = useAtencionAhora();

  // Para cada persona con alerta viva, su clase: ocio (rojo), cobertura (naranja)
  // o leve (amarillo). Ocio manda sobre cobertura, cobertura sobre pausa.
  const clasePor = useMemo(() => {
    const m = new Map<string, "ocio" | "cobertura" | "leve">();
    for (const p of enAtencion) {
      const tipos = p.alertas.map((a) => a.tipo);
      const clase = tipos.some((t) => OCIO.has(t)) ? "ocio" : tipos.some((t) => COBERTURA.has(t)) ? "cobertura" : "leve";
      m.set(p.userId, clase);
    }
    return m;
  }, [enAtencion]);

  // tienePantalla = comparte pantalla AHORA (su pantallazo reciente la trae).
  // Sin pantalla nunca es verde: cae a naranja (hay que exigirla).
  const semaforoDe = useMemo(
    () =>
      (userId: string, fueraDeLugar: boolean | null, veredicto: string | null, tienePantalla: boolean): Semaforo => {
        const clase = clasePor.get(userId);
        if (fueraDeLugar === true || clase === "ocio") return "rojo";
        if (clase === "leve") return "amarillo"; // pausa (baño/break) manda sobre "sin pantalla"
        if (clase === "cobertura" || !tienePantalla) return "naranja";
        return veredicto ? "verde" : "gris";
      },
    [clasePor],
  );

  return { semaforoDe };
}
