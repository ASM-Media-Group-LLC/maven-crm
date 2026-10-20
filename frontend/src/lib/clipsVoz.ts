// Audios PREGRABADOS de los anuncios de pausa, con la voz Mario (ElevenLabs,
// modelo Eleven v4), generados una vez y empacados con la app. Así la voz bonita
// suena SIN depender de la clave de ElevenLabs en el servidor ni de internet.
//
// La clave del mapa es el TEXTO EXACTO del anuncio (el que arma lib/pausaCowork):
// si `anunciar()` recibe uno de estos textos, reproduce su audio; si no, sigue al
// servidor (anuncio-tts) y, si tampoco, a la voz del navegador.
//
// Por eso lib/pausaCowork solo rota entre ESTAS frases (las que tienen audio):
// una frase sin clip caería a la voz robótica y se notaría el salto.

import finBano1 from "@/assets/voz/fin-bano-1.mp3";
import finBano2 from "@/assets/voz/fin-bano-2.mp3";
import finBreak1 from "@/assets/voz/fin-break-1.mp3";
import finBreak2 from "@/assets/voz/fin-break-2.mp3";
import diaAgotado1 from "@/assets/voz/dia-agotado-1.mp3";

export const CLIPS_VOZ: Record<string, string> = {
  "Se te acabó el tiempo de baño. Por favor, vuelve a tu puesto.": finBano1,
  "Terminó tu tiempo de baño. Regresa a la sala, por favor.": finBano2,
  "Se te acabó el break. Por favor, vuelve a tu puesto.": finBreak1,
  "Terminó tu break. Regresa a la sala, por favor.": finBreak2,
  "Ya superaste tu tiempo de baño del día. Por favor, vuelve a tu puesto ahora.": diaAgotado1,
};
