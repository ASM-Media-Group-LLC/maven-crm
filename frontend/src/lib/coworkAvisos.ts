// Las situaciones que un supervisor le avisa a un chatter desde el tablero de
// Cowork (el botón "Avisar"). Cada una tiene:
//   - `etiqueta`: el texto ESCRITO (la opción del menú y el cartel que ve el
//     chatter). Es una clave del diccionario (ES/EN), nunca español a mano.
//   - `vozEs`: lo que DICE Mario en voz alta. Va en español fijo, igual que las
//     frases de fin de pausa (el motor de voz está fijo en español, ver lib/voz).
//     Vive en una propiedad `vozEs:` a propósito: así el freno de inglés
//     (test/i18n/sinEspanolNuevo) no la confunde con texto de pantalla.
//
// En Fase 2 cada `vozEs` tendrá su clip Mario pregrabado en lib/clipsVoz (como
// los avisos de pausa); mientras no lo tenga, anunciar() cae al TTS del servidor
// o a la voz del navegador, pero el aviso nunca queda mudo.

import type { TranslationKey } from "@/lib/i18n";

// ── Quién puede avisar ──────────────────────────────────────────────────────
//
// Lista FIJA de los designados (Álvaro, 20/10). NO se usa el rol `admin`: hoy
// hay varios admin que él no nombró (Jhon entre ellos) y pidió EXACTAMENTE
// estos cuatro. Se agregan o quitan editando acá Y la policy de inserción de la
// tabla cowork_avisos (migración 20261022090000) a la vez.
export const AVISADORES: ReadonlySet<string> = new Set([
  "41b35cef-82a8-4991-9234-3514b0064767", // Luis Carlos Ortega Roman
  "4d502376-eb16-42f6-bda2-4b92582a26e6", // Daniel Ospina
  "8b90f141-8546-4cfd-a358-56ff227623df", // Grace Gelves M.
  "528453bd-f1e1-43d3-85c1-01c5fa5bbcfb", // Álvaro Stephan Mejía (dueño)
]);

export type GrupoAviso = "foco" | "respuesta" | "ventas" | "trato" | "camara" | "pausas" | "general";

/** El orden en que se agrupan las situaciones en el menú. */
export const GRUPOS_AVISO: { grupo: GrupoAviso; titulo: TranslationKey }[] = [
  { grupo: "foco", titulo: "cowork.avisar.grupo.foco" },
  { grupo: "respuesta", titulo: "cowork.avisar.grupo.respuesta" },
  { grupo: "ventas", titulo: "cowork.avisar.grupo.ventas" },
  { grupo: "trato", titulo: "cowork.avisar.grupo.trato" },
  { grupo: "camara", titulo: "cowork.avisar.grupo.camara" },
  { grupo: "pausas", titulo: "cowork.avisar.grupo.pausas" },
  { grupo: "general", titulo: "cowork.avisar.grupo.general" },
];

export interface SituacionAviso {
  /** Id estable: viaja a la base (cowork_avisos.situacion) y se busca al recibir. */
  slug: string;
  grupo: GrupoAviso;
  /** Texto escrito (opción del menú y cartel), en el idioma de quien mira. */
  etiqueta: TranslationKey;
  /** Lo que dice Mario. Español fijo. */
  vozEs: string;
}

export const SITUACIONES_AVISO: SituacionAviso[] = [
  // ── Foco ──
  { slug: "foco-distraccion", grupo: "foco", etiqueta: "cowork.avisar.sit.focoDistraccion", vozEs: "Te estás distrayendo, vuelve al chat." },
  { slug: "foco-celular", grupo: "foco", etiqueta: "cowork.avisar.sit.focoCelular", vozEs: "Guarda el celular y concéntrate en la conversación." },
  { slug: "foco-pestanas", grupo: "foco", etiqueta: "cowork.avisar.sit.focoPestanas", vozEs: "Vuelve a la conversación y cierra lo demás." },
  { slug: "foco-inactivo", grupo: "foco", etiqueta: "cowork.avisar.sit.focoInactivo", vozEs: "Llevas rato inactivo, ponte al día." },
  { slug: "foco-charla", grupo: "foco", etiqueta: "cowork.avisar.sit.focoCharla", vozEs: "Llevas mucho en una charla fuera del trabajo." },

  // ── Tiempo de respuesta ──
  { slug: "resp-lento", grupo: "respuesta", etiqueta: "cowork.avisar.sit.respLento", vozEs: "Estás respondiendo muy lento, agiliza." },
  { slug: "resp-espera", grupo: "respuesta", etiqueta: "cowork.avisar.sit.respEspera", vozEs: "Tienes chats esperando, atiéndelos." },
  { slug: "resp-sin-contestar", grupo: "respuesta", etiqueta: "cowork.avisar.sit.respSinContestar", vozEs: "Hay un mensaje sin contestar, respóndelo." },
  { slug: "resp-saludo", grupo: "respuesta", etiqueta: "cowork.avisar.sit.respSaludo", vozEs: "Saluda y arranca más rápido." },

  // ── Ventas ──
  { slug: "ventas-cerrar", grupo: "ventas", etiqueta: "cowork.avisar.sit.ventasCerrar", vozEs: "Es momento de cerrar la venta, ve al cierre." },
  { slug: "ventas-ofrecer", grupo: "ventas", etiqueta: "cowork.avisar.sit.ventasOfrecer", vozEs: "Ofrece el contenido, no te quedes solo en charla." },
  { slug: "ventas-insistir", grupo: "ventas", etiqueta: "cowork.avisar.sit.ventasInsistir", vozEs: "Insiste con amabilidad, no sueltes la venta." },
  { slug: "ventas-precio", grupo: "ventas", etiqueta: "cowork.avisar.sit.ventasPrecio", vozEs: "Presenta el precio con seguridad." },
  { slug: "ventas-oportunidad", grupo: "ventas", etiqueta: "cowork.avisar.sit.ventasOportunidad", vozEs: "Estás dejando pasar una oportunidad, aprovéchala." },

  // ── Trato al cliente ──
  { slug: "trato-calidez", grupo: "trato", etiqueta: "cowork.avisar.sit.tratoCalidez", vozEs: "Trata al cliente con más calidez." },
  { slug: "trato-seco", grupo: "trato", etiqueta: "cowork.avisar.sit.tratoSeco", vozEs: "Estás muy seco, conversa un poco más." },
  { slug: "trato-ortografia", grupo: "trato", etiqueta: "cowork.avisar.sit.tratoOrtografia", vozEs: "Cuida la ortografía y la redacción." },
  { slug: "trato-personaje", grupo: "trato", etiqueta: "cowork.avisar.sit.tratoPersonaje", vozEs: "Mantén el personaje y el tono acordado." },

  // ── Cámara y pantalla ──
  { slug: "camara-encender", grupo: "camara", etiqueta: "cowork.avisar.sit.camaraEncender", vozEs: "Enciende la cámara, por favor." },
  { slug: "camara-encuadre", grupo: "camara", etiqueta: "cowork.avisar.sit.camaraEncuadre", vozEs: "Acomódate en el encuadre de la cámara." },
  { slug: "pantalla-compartir", grupo: "camara", etiqueta: "cowork.avisar.sit.pantallaCompartir", vozEs: "Comparte tu pantalla, por favor." },
  { slug: "pantalla-ajena", grupo: "camara", etiqueta: "cowork.avisar.sit.pantallaAjena", vozEs: "Tienes algo abierto que no es trabajo, ciérralo." },

  // ── Pausas ──
  { slug: "pausa-volver", grupo: "pausas", etiqueta: "cowork.avisar.sit.pausaVolver", vozEs: "Se acabó tu pausa, vuelve a tu puesto." },
  { slug: "pausa-avisar", grupo: "pausas", etiqueta: "cowork.avisar.sit.pausaAvisar", vozEs: "Avisa antes de ausentarte, por favor." },

  // ── General ──
  { slug: "general-llamame", grupo: "general", etiqueta: "cowork.avisar.sit.generalLlamame", vozEs: "Escríbeme o llámame cuando puedas." },
  { slug: "general-buen-trabajo", grupo: "general", etiqueta: "cowork.avisar.sit.generalBuenTrabajo", vozEs: "Buen trabajo, sigue así." },
];

export const SITUACION_POR_SLUG: Record<string, SituacionAviso> = Object.fromEntries(
  SITUACIONES_AVISO.map((s) => [s.slug, s]),
);

/** Las situaciones de un grupo, en el orden en que se declararon. */
export function situacionesDe(grupo: GrupoAviso): SituacionAviso[] {
  return SITUACIONES_AVISO.filter((s) => s.grupo === grupo);
}
