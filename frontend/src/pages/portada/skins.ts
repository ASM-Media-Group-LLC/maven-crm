// LAS PALETAS DE LA PORTADA.
//
// No son una muestra de colores: al elegir una, la página entera se repinta.
// Es la forma honesta de mostrar marca blanca — decir "se ve como tu marca"
// mientras la web se queda azul no convence a nadie.
//
// Cada paleta reescribe los tres tokens de acento sobre el nodo raíz `.pt`, y
// como TODO el CSS de la portada sale de esos tokens (incluidos los
// resplandores, que van en `rgba(var(--azul-rgb), …)`), el cambio llega hasta
// las maquetas de producto.
//
// NO se guarda en ninguna parte a propósito: al refrescar vuelve al azul de
// Maven. Es una demostración, no una preferencia del visitante — y la
// portada tiene que verse siempre igual la primera vez que alguien entra.

export interface Skin {
  id: string;
  nombre: string;
  /** Los dos puntitos que se ven en la ficha. */
  muestras: [string, string];
  azul: string;
  azulClaro: string;
  violeta: string;
  /** Tripletes de lo mismo, para los rgba(). */
  azulRgb: string;
  azulClaroRgb: string;
  violetaRgb: string;
  /** Texto sobre el botón principal: el Dorado necesita tinta oscura. */
  sobreAzul?: string;
}

export const SKINS: Skin[] = [
  {
    id: "maven", nombre: "Maven", muestras: ["#0a84ff", "#8b5cf6"],
    azul: "#0a84ff", azulClaro: "#4fa8ff", violeta: "#8b5cf6",
    azulRgb: "10, 132, 255", azulClaroRgb: "79, 168, 255", violetaRgb: "139, 92, 246",
  },
  {
    id: "atardecer", nombre: "Atardecer", muestras: ["#f97316", "#f43f7e"],
    azul: "#f97316", azulClaro: "#fdba74", violeta: "#f43f7e",
    azulRgb: "249, 115, 22", azulClaroRgb: "253, 186, 116", violetaRgb: "244, 63, 126",
  },
  {
    id: "esmeralda", nombre: "Esmeralda", muestras: ["#10b981", "#22d3ee"],
    azul: "#0f9d76", azulClaro: "#34d399", violeta: "#22d3ee",
    azulRgb: "15, 157, 118", azulClaroRgb: "52, 211, 153", violetaRgb: "34, 211, 238",
  },
  {
    id: "orquidea", nombre: "Orquídea", muestras: ["#c026d3", "#8b5cf6"],
    azul: "#c026d3", azulClaro: "#e879f9", violeta: "#8b5cf6",
    azulRgb: "192, 38, 211", azulClaroRgb: "232, 121, 249", violetaRgb: "139, 92, 246",
  },
  {
    id: "medianoche", nombre: "Medianoche", muestras: ["#1e3a8a", "#4fa8ff"],
    azul: "#2b4bd8", azulClaro: "#6b8cff", violeta: "#1e3a8a",
    azulRgb: "43, 75, 216", azulClaroRgb: "107, 140, 255", violetaRgb: "30, 58, 138",
  },
  {
    id: "dorado", nombre: "Dorado", muestras: ["#eab308", "#f59e0b"],
    azul: "#eab308", azulClaro: "#fcd34d", violeta: "#f59e0b",
    azulRgb: "234, 179, 8", azulClaroRgb: "252, 211, 77", violetaRgb: "245, 158, 11",
    // Blanco sobre amarillo no se lee: el botón principal va con tinta oscura.
    sobreAzul: "#1a1505",
  },
];

/** Los tokens que hay que poner en el nodo raíz para vestir la página. */
export function tokensDe(skin: Skin): React.CSSProperties {
  return {
    "--azul": skin.azul,
    "--azul-claro": skin.azulClaro,
    "--violeta": skin.violeta,
    "--azul-rgb": skin.azulRgb,
    "--azul-claro-rgb": skin.azulClaroRgb,
    "--violeta-rgb": skin.violetaRgb,
    "--sobre-azul": skin.sobreAzul ?? "#ffffff",
  } as React.CSSProperties;
}
