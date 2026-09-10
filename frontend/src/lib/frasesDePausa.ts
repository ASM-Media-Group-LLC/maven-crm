// Frases de la miniatura en pausa (mock de Álvaro 10/09): una por pausa, fija
// mientras dure (sale del minuto en que arrancó) para que no cambie en cada
// render. Viven aparte del componente para que el archivo de la miniatura solo
// exporte componentes (fast refresh) y para poder probarlas sin React.
export const FRASES_DE_PAUSA = [
  "Un pequeño descanso también construye grandes resultados.",
  "Recarga tu energía para seguir creando juntos.",
  "Parar un momento también es avanzar.",
  "Volver con la cabeza fresca vale más que no parar.",
];

export const fraseDePausa = (desde: number | null) =>
  FRASES_DE_PAUSA[Math.floor((desde ?? 0) / 60_000) % FRASES_DE_PAUSA.length];
