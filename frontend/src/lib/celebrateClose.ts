// ─── Celebración del cierre (ola 3 UX — momento de identidad #105) ──────────
//
// El cierre de un trato es el evento de mayor valor del CRM y hasta ahora se
// sentía igual que editar un campo. Esta helper dispara UNA ráfaga breve de
// confetti (mismo patrón que el confetti de cumpleaños de DashboardContent)
// para que el momento se note, sin volverse juguete:
//
//   - Gate en sessionStorage por `gateKey` (p. ej. el id del lead): el mismo
//     cierre no se vuelve a celebrar en la sesión aunque haya re-renders,
//     doble click o refetch.
//   - `disableForReducedMotion` respeta prefers-reduced-motion (canvas-confetti
//     convierte la llamada en no-op); el toast informativo del caller sí se
//     muestra igual — solo se apaga el movimiento.
//
// Devuelve true si este evento aún no se había celebrado en la sesión, para
// que el caller muestre el toast especial una sola vez.
import confetti from "canvas-confetti";

export function celebrateClose(gateKey: string): boolean {
  const key = `cierre-celebrado-${gateKey}`;
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
  } catch {
    // sessionStorage puede no estar disponible (modo privado) — celebrar igual.
  }
  confetti({
    particleCount: 80,
    spread: 70,
    origin: { y: 0.6 },
    disableForReducedMotion: true,
  });
  return true;
}
