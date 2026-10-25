// Audios PREGRABADOS de los anuncios, con la voz Mario (ElevenLabs, modelo
// Eleven v4), generados una vez y empacados con la app. Así la voz bonita suena
// SIN depender de la clave de ElevenLabs en el servidor ni de internet.
//
// La clave del mapa es el TEXTO EXACTO del anuncio: si `anunciar()` recibe uno de
// estos textos, reproduce su audio; si no, sigue al servidor (anuncio-tts) y, si
// tampoco, a la voz del navegador.
//
// Pausas: las arma lib/pausaCowork. Avisar: el `vozEs` de cada situación de
// lib/coworkAvisos (el botón del supervisor). Una frase sin clip caería a la voz
// robótica y se notaría el salto; por eso hay una guarda que lo caza en los tests.

import finBano1 from "@/assets/voz/fin-bano-1.mp3";
import finBano2 from "@/assets/voz/fin-bano-2.mp3";
import finBreak1 from "@/assets/voz/fin-break-1.mp3";
import finBreak2 from "@/assets/voz/fin-break-2.mp3";
import diaAgotado1 from "@/assets/voz/dia-agotado-1.mp3";

import vozFocoDistraccion from "@/assets/voz/foco-distraccion.mp3";
import vozFocoCelular from "@/assets/voz/foco-celular.mp3";
import vozFocoPestanas from "@/assets/voz/foco-pestanas.mp3";
import vozFocoInactivo from "@/assets/voz/foco-inactivo.mp3";
import vozFocoCharla from "@/assets/voz/foco-charla.mp3";
import vozRespLento from "@/assets/voz/resp-lento.mp3";
import vozRespEspera from "@/assets/voz/resp-espera.mp3";
import vozRespSinContestar from "@/assets/voz/resp-sin-contestar.mp3";
import vozRespSaludo from "@/assets/voz/resp-saludo.mp3";
import vozVentasCerrar from "@/assets/voz/ventas-cerrar.mp3";
import vozVentasOfrecer from "@/assets/voz/ventas-ofrecer.mp3";
import vozVentasInsistir from "@/assets/voz/ventas-insistir.mp3";
import vozVentasPrecio from "@/assets/voz/ventas-precio.mp3";
import vozVentasOportunidad from "@/assets/voz/ventas-oportunidad.mp3";
import vozTratoCalidez from "@/assets/voz/trato-calidez.mp3";
import vozTratoSeco from "@/assets/voz/trato-seco.mp3";
import vozTratoOrtografia from "@/assets/voz/trato-ortografia.mp3";
import vozTratoPersonaje from "@/assets/voz/trato-personaje.mp3";
import vozCamaraEncender from "@/assets/voz/camara-encender.mp3";
import vozCamaraEncuadre from "@/assets/voz/camara-encuadre.mp3";
import vozPantallaCompartir from "@/assets/voz/pantalla-compartir.mp3";
import vozPantallaAjena from "@/assets/voz/pantalla-ajena.mp3";
import vozPausaVolver from "@/assets/voz/pausa-volver.mp3";
import vozPausaAvisar from "@/assets/voz/pausa-avisar.mp3";
import vozGeneralLlamame from "@/assets/voz/general-llamame.mp3";
import vozGeneralBuenTrabajo from "@/assets/voz/general-buen-trabajo.mp3";

export const CLIPS_VOZ: Record<string, string> = {
  // ── Fin de pausa (lib/pausaCowork) ──
  "Se te acabó el tiempo de baño. Por favor, vuelve a tu puesto.": finBano1,
  "Terminó tu tiempo de baño. Regresa a la sala, por favor.": finBano2,
  "Se te acabó el break. Por favor, vuelve a tu puesto.": finBreak1,
  "Terminó tu break. Regresa a la sala, por favor.": finBreak2,
  "Ya superaste tu tiempo de baño del día. Por favor, vuelve a tu puesto ahora.": diaAgotado1,
  // ── Situaciones del botón Avisar (lib/coworkAvisos) ──
  "Te estás distrayendo, vuelve al chat.": vozFocoDistraccion,
  "Guarda el celular y concéntrate en la conversación.": vozFocoCelular,
  "Vuelve a la conversación y cierra lo demás.": vozFocoPestanas,
  "Llevas rato inactivo, ponte al día.": vozFocoInactivo,
  "Llevas mucho en una charla fuera del trabajo.": vozFocoCharla,
  "Estás respondiendo muy lento, agiliza.": vozRespLento,
  "Tienes chats esperando, atiéndelos.": vozRespEspera,
  "Hay un mensaje sin contestar, respóndelo.": vozRespSinContestar,
  "Saluda y arranca más rápido.": vozRespSaludo,
  "Es momento de cerrar la venta, ve al cierre.": vozVentasCerrar,
  "Ofrece el contenido, no te quedes solo en charla.": vozVentasOfrecer,
  "Insiste con amabilidad, no sueltes la venta.": vozVentasInsistir,
  "Presenta el precio con seguridad.": vozVentasPrecio,
  "Estás dejando pasar una oportunidad, aprovéchala.": vozVentasOportunidad,
  "Trata al cliente con más calidez.": vozTratoCalidez,
  "Estás muy seco, conversa un poco más.": vozTratoSeco,
  "Cuida la ortografía y la redacción.": vozTratoOrtografia,
  "Mantén el personaje y el tono acordado.": vozTratoPersonaje,
  "Enciende la cámara, por favor.": vozCamaraEncender,
  "Acomódate en el encuadre de la cámara.": vozCamaraEncuadre,
  "Comparte tu pantalla, por favor.": vozPantallaCompartir,
  "Tienes algo abierto que no es trabajo, ciérralo.": vozPantallaAjena,
  "Se acabó tu pausa, vuelve a tu puesto.": vozPausaVolver,
  "Avisa antes de ausentarte, por favor.": vozPausaAvisar,
  "Escríbeme o llámame cuando puedas.": vozGeneralLlamame,
  "Buen trabajo, sigue así.": vozGeneralBuenTrabajo,
};
