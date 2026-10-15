import { MessageCircle, Video, Mail, FileText, ListChecks, Megaphone, CalendarClock, Sparkles } from "lucide-react";
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
  /** Primera línea del título: la del degradado, el gancho. */
  remate: string;
  /** Segunda línea del título, en blanco: continúa la frase del remate. */
  remateBajo: string;
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
    remate: "Control total, en tiempo real.",
    remateBajo: "Aquí está todo tu equipo, como en una oficina real.",
    bajada: (
      <ul className="bajada-chips">
        <li><MessageCircle aria-hidden="true" />Chat</li>
        <li><Video aria-hidden="true" />Reuniones</li>
        <li><Mail aria-hidden="true" />Correo propio</li>
        <li><FileText aria-hidden="true" />Documentos</li>
        <li><ListChecks aria-hidden="true" />Tareas</li>
      </ul>
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
    remate: "Control total, en tiempo real.",
    remateBajo: "A toda tu agencia, en una sola oficina virtual.",
    bajada: (
      <ul className="bajada-chips">
        <li><MessageCircle aria-hidden="true" />Chat</li>
        <li><Video aria-hidden="true" />Reuniones</li>
        <li><Mail aria-hidden="true" />Correo propio</li>
        <li><Megaphone aria-hidden="true" />Promoción</li>
        <li><CalendarClock aria-hidden="true" />Turnos</li>
        <li><Sparkles aria-hidden="true" />Simulador</li>
      </ul>
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

/** Las opciones de "qué te interesa" del formulario.
 *
 *  Del lado de agencias está el detalle completo. Del lado de empresas va la
 *  lista corta más "Promolog" y "Otras opciones de agencia": quien entra por
 *  la puerta de empresas puede ser una agencia igual, y si no se nombran no
 *  se entera de que existen. Esa última también es la puerta para lo que la
 *  lista no incluye. */
export const INTERESES: Record<Publico, string[]> = {
  empresas: [
    "Correo propio",
    "Messenger",
    "Cowork y reuniones",
    "Personas y nómina",
    "Ventas y pipeline",
    "Tickets",
    "Marca blanca",
    // Estas dos van también del lado de empresas a propósito: quien entra
    // por acá puede ser una agencia igual, y si no se nombran no se enteran
    // de que existen. La segunda es la puerta para lo que no está listado.
    "Promolog",
    "Otras opciones de agencia",
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
    "Otras opciones de agencia",
    "Todo",
  ],
};
