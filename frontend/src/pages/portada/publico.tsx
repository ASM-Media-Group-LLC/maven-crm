import type { Publico } from "./guiones";

// LO QUE CAMBIA CUANDO CAMBIA EL PÚBLICO.
//
// Al principio el selector solo cambiaba la cinta del hero, y se notaba: la
// página quedaba igual y el botón parecía de adorno. Ahora cambia el título,
// la bajada, las cifras, dos filas de "lo que reemplaza", el mapa de módulos
// y —lo importante— aparecen las dos secciones que son de agencia y no le
// dicen nada a una empresa cualquiera: Promolog y el simulador.
//
// No son dos productos: es la MISMA plataforma contada desde el problema de
// cada uno. Nada de prometerle a una empresa algo que no va a usar, ni de
// esconderle a una agencia lo que se hizo para ella.

export interface Guion {
  /** Segunda línea del título, la que va con el degradado. */
  remate: string;
  bajada: React.ReactNode;
  /** La franja de números. `hasta` es el valor final del contador. */
  cifras: { hasta: number; prefijo: string; pie: string }[];
  /** Los enlaces de la barra superior. */
  links: [string, string][];
  /** Las secciones que solo tienen sentido para este público. */
  promolog: boolean;
  simulador: boolean;
}

const CIFRAS_COMUNES = [
  {
    hasta: 0,
    prefijo: "$",
    pie: "en licencias por asiento de terceros — el correo, el video y la transcripción corren sobre servicios propios",
  },
  {
    hasta: 1,
    prefijo: "",
    pie: "sesión para todo el equipo, con una sola contraseña y una sola factura",
  },
];

// Etiquetas cortas: con nueve enlaces, "Lo que reemplaza" y "La capa de IA"
// partían la barra en dos líneas.
const LINKS_BASE: [string, string][] = [
  ["#reemplaza", "Reemplaza"],
  ["#messenger", "Messenger"],
  ["#cowork", "Cowork"],
];

const LINKS_CIERRE: [string, string][] = [
  ["#dia", "El día"],
  ["#modulos", "Módulos"],
  ["#ia", "IA"],
  ["#marca", "Marca blanca"],
];

export const GUION: Record<Publico, Guion> = {
  empresas: {
    remate: "por una sola sesión.",
    bajada: (
      <>
        Correo con tu dominio, chat interno, oficina virtual, reuniones con grabación, tickets,
        recursos humanos y finanzas. Con una <b>capa de IA que supervisa, califica y avisa</b> sin
        que nadie tenga que estar mirando.
      </>
    ),
    cifras: [
      {
        hasta: 7,
        prefijo: "",
        pie: "suscripciones que dejas de pagar: correo, chat, video, oficina virtual, tickets, personas y ventas",
      },
      ...CIFRAS_COMUNES,
      {
        hasta: 74,
        prefijo: "",
        pie: "pantallas, del correo a la nómina, sin salir de la misma sesión",
      },
    ],
    links: [...LINKS_BASE, ...LINKS_CIERRE],
    promolog: false,
    simulador: false,
  },

  agencias: {
    remate: "por la plataforma que la agencia necesitaba.",
    bajada: (
      <>
        Correo propio, chat interno, oficina virtual y reuniones — y arriba, lo que ninguna suite
        de oficina te va a dar: <b>seguimiento de promoción con evidencia, ingresos por cuenta,
        turnos de chatters y un simulador para probar a los candidatos</b> antes de darles una
        cuenta que factura.
      </>
    ),
    cifras: [
      {
        hasta: 9,
        prefijo: "",
        pie: "herramientas que dejas de pagar y de pegar con planillas: correo, chat, video, oficina virtual, turnos, promoción y ventas",
      },
      ...CIFRAS_COMUNES,
      {
        hasta: 74,
        prefijo: "",
        pie: "pantallas, del correo al seguimiento de cada cuenta, sin salir de la misma sesión",
      },
    ],
    links: [
      ...LINKS_BASE,
      ["#promolog", "Promolog"],
      ["#simulador", "Simulador"],
      ...LINKS_CIERRE,
    ],
    promolog: true,
    simulador: true,
  },
};

/** Las opciones de "qué te interesa" del formulario. Las de agencia solo
 *  aparecen cuando la página se está contando para agencias: preguntar por
 *  Promolog a una empresa de logística es ruido. */
export const INTERESES: Record<Publico, string[]> = {
  empresas: [
    "Correo propio",
    "Messenger",
    "Cowork y reuniones",
    "Personas y nómina",
    "Ventas y pipeline",
    "Tickets",
    "Marca blanca",
    "Todo",
  ],
  agencias: [
    "Correo propio",
    "Messenger",
    "Cowork y reuniones",
    "Promolog · seguimiento de promoción",
    "Ingresos por cuenta",
    "Turnos y rendimiento de chatters",
    "Simulador de contratación",
    "Cartera de creadoras",
    "Pedidos personalizados",
    "Parrilla de contenido",
    "Marca blanca",
    "Todo",
  ],
};
