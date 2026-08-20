import { normalizeRoomCode } from "@/lib/coworkRoomCode";

// Lo que la gente pega en "Entrar con un link o un código" puede ser cualquiera
// de estas formas, y todas tienen que funcionar sin que el usuario piense:
//   · https://maven.asmtech.ai/call/meet_ab12cd34ef56?name=Reunión
//   · /call/meet_ab12cd34ef56
//   · meet_ab12cd34ef56
//   · ABC234  /  abc-234  /  " abc 234 "
//
// Devolvemos `livekitRoom` o `code` según lo que se reconozca; la reunión se
// resuelve después contra la edge (que es la que decide si existe y está activa).
export interface ParsedJoinInput {
  code?: string;
  livekitRoom?: string;
}

export function parseJoinInput(raw: string): ParsedJoinInput {
  const value = (raw ?? "").trim();
  if (!value) return {};

  // Un link de llamada: /call/<sala>. Nos quedamos con la sala.
  const callMatch = value.match(/\/call\/([^/?#]+)/i);
  if (callMatch?.[1]) return { livekitRoom: decodeURIComponent(callMatch[1]) };

  // Un link que lleva el código como query param.
  const codeParam = value.match(/[?&]code=([^&#]+)/i);
  if (codeParam?.[1]) {
    const code = normalizeRoomCode(decodeURIComponent(codeParam[1]));
    return code ? { code } : {};
  }

  // El nombre de sala pelado.
  if (/^meet_[a-z0-9]+$/i.test(value)) return { livekitRoom: value };

  const code = normalizeRoomCode(value);
  return code ? { code } : {};
}
