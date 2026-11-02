import { useMemo } from "react";
import { useAtencionAhora, TIPOS_GRAVES } from "@/hooks/useAtencionAhora";

// EL SEMÁFORO de Argos, en un solo lugar (Álvaro, 02/11), para que Conectados
// ahora y Pantallazos en vivo lo pinten IGUAL:
//   🟢 verde    — juzgada por la IA y en lo suyo
//   🟡 amarillo — alerta leve (pausa/ojo: baño, break)
//   🔴 rojo     — fuera de lugar o alerta grave (dejó de trabajar)
//   ⚪ gris     — Argos aún no la juzga
// Combina las alertas vivas (useAtencionAhora) con la bandera/veredicto que ya
// trae cada persona del vivo. Devuelve una función semaforoDe(...) estable.

export type Semaforo = "verde" | "amarillo" | "rojo" | "gris";

// Clases de color del punto, compartidas por los paneles.
export const PUNTO_SEM: Record<Semaforo, string> = {
  verde: "bg-success shadow-[0_0_6px_hsl(var(--success))]",
  amarillo: "bg-warning shadow-[0_0_6px_hsl(var(--warning))]",
  rojo: "bg-destructive shadow-[0_0_6px_hsl(var(--destructive))] animate-pulse",
  gris: "bg-muted-foreground/40",
};

export function useSemaforos() {
  const { personas: enAtencion } = useAtencionAhora();

  // Alertas vivas por persona: graves → rojo, leves → amarillo.
  const alertaPor = useMemo(() => {
    const m = new Map<string, "grave" | "leve">();
    for (const p of enAtencion) m.set(p.userId, p.alertas.some((a) => TIPOS_GRAVES.has(a.tipo)) ? "grave" : "leve");
    return m;
  }, [enAtencion]);

  const semaforoDe = useMemo(
    () =>
      (userId: string, fueraDeLugar: boolean | null, veredicto: string | null): Semaforo => {
        const alerta = alertaPor.get(userId);
        if (fueraDeLugar === true || alerta === "grave") return "rojo";
        if (alerta === "leve") return "amarillo";
        return veredicto ? "verde" : "gris";
      },
    [alertaPor],
  );

  return { semaforoDe };
}
