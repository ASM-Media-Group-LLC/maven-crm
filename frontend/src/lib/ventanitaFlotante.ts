// TAMAÑO DE LA VENTANITA (Alvaro, 19/11/2026: «es diminuta, no se puede agrandar
// ni volver a Cowork»). Antes medía 340×240 fijos: entre la cabecera, la barra
// de la sala y los controles quedaba una franja de video. Ahora se estira desde
// la esquina inferior derecha (como la del Hub dentro de Cowork), tiene tres
// tamaños fijos a un clic, y se recuerda. Con el mínimo siempre entran la
// pantalla, las cámaras, los controles y el nombre de la sala con su gente.
export const TAMANOS_FLOTANTE = [
  { id: "sizeSmall", w: 360, h: 300 },
  { id: "sizeMedium", w: 480, h: 390 },
  { id: "sizeLarge", w: 720, h: 540 },
] as const;
export const MINIMO_FLOTANTE = { w: 320, h: 260 };

/** El tamaño dentro de lo permitido: nunca menor que el mínimo ni mayor que la pantalla. */
export function acotarTamano(t: { w: number; h: number }, ancho: number, alto: number): { w: number; h: number } {
  const maxW = Math.max(160, ancho - 16);
  const maxH = Math.max(160, alto - 16);
  return {
    w: Math.round(Math.min(Math.max(MINIMO_FLOTANTE.w, t.w), maxW)),
    h: Math.round(Math.min(Math.max(MINIMO_FLOTANTE.h, t.h), maxH)),
  };
}

/** El siguiente de los tres tamaños fijos, a partir del más parecido al actual. */
export function siguienteTamano(t: { w: number; h: number }): (typeof TAMANOS_FLOTANTE)[number] {
  let cerca = 0;
  TAMANOS_FLOTANTE.forEach((p, i) => {
    const c = TAMANOS_FLOTANTE[cerca];
    if (Math.abs(p.w - t.w) + Math.abs(p.h - t.h) < Math.abs(c.w - t.w) + Math.abs(c.h - t.h)) cerca = i;
  });
  return TAMANOS_FLOTANTE[(cerca + 1) % TAMANOS_FLOTANTE.length];
}
