// Avisos con cara dentro de una llamada: alguien SALIÓ, alguien fue
// SILENCIADO, alguien empezó o detuvo una GRABACIÓN.
//
// El sonido de salida ya existía; esto le pone nombre y cara para que no haya
// que contar cuadritos para saber quién fue. La cara es la misma que la
// persona tiene en el resto de Maven (foto → muñequito → iniciales).
//
// Dos fuentes, las dos de nuestro propio servidor de LiveKit (self-hosted en
// Dokploy, nada de LiveKit Cloud):
//   · `ParticipantDisconnected` → salida.
//   · Mensajes de datos `{type:"aviso"}` que manda el SERVIDOR (las edges
//     livekit-moderate y recordings) SIN participante remitente → silenciado
//     y grabación. Que no tengan remitente es la firma de que son del servidor;
//     uno mandado por un cliente se ignora.
import type { Room, Participant } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { avisarPersona } from "@/lib/avisoPersona";

const DURACION_MS = 5_000;

interface PerfilBreve { nombre: string | null; foto: string | null; seed: string | null }

// Cache por usuario para no ir a la base cada vez que alguien sale: en una
// reunión larga la misma gente entra y sale varias veces.
const perfiles = new Map<string, PerfilBreve>();

/** El identity de Maven es `<uuid>` o `<uuid>_<sufijo>`; los invitados sin
 *  cuenta son `guest_<uuid>` y no tienen perfil. */
export function uuidDeIdentity(identity: string): string | null {
  if (identity.startsWith("guest_")) return null;
  const cabeza = identity.split("_")[0];
  return /^[0-9a-f-]{36}$/i.test(cabeza) ? cabeza : null;
}

/** ¿Vale la pena avisar que este participante se fue? */
export function debeAvisarSalida(p: Pick<Participant, "identity">, room: Pick<Room, "state" | "remoteParticipants">): boolean {
  // Si el que se desconectó soy yo, LiveKit vacía la sala y dispara un
  // "salió" por cada persona: eso no es que se fueran ellos.
  if (room.state !== "connected") return false;
  // El supervisor de Cowork mirando o la vista previa no son "alguien que se fue".
  if (/__(monitor|preview)$/.test(p.identity)) return false;
  // La misma persona desde otra pestaña sigue adentro: no se fue.
  const uuid = uuidDeIdentity(p.identity);
  if (uuid) {
    for (const otro of room.remoteParticipants.values()) {
      if (otro.identity !== p.identity && uuidDeIdentity(otro.identity) === uuid) return false;
    }
  }
  return true;
}

export async function perfilBreveDe(uuid: string): Promise<PerfilBreve | null> {
  const enCache = perfiles.get(uuid);
  if (enCache) return enCache;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, avatar_seed")
      .eq("id", uuid)
      .maybeSingle();
    if (!data) return null;
    const perfil = { nombre: data.full_name ?? null, foto: data.avatar_url ?? null, seed: data.avatar_seed ?? null };
    perfiles.set(uuid, perfil);
    return perfil;
  } catch {
    return null;
  }
}

/** Dispara el aviso "X salió de la reunión" con la cara de X. */
export async function avisarSalidaDeLlamada(
  p: Pick<Participant, "identity" | "name">,
  room: Pick<Room, "state" | "remoteParticipants">,
): Promise<boolean> {
  if (!debeAvisarSalida(p, room)) return false;
  const uuid = uuidDeIdentity(p.identity);
  const perfil = uuid ? await perfilBreveDe(uuid) : null;
  const nombre = perfil?.nombre || p.name?.trim() || (uuid ? "Alguien de Maven" : "Un invitado");
  avisarPersona({
    nombre,
    foto: perfil?.foto ?? null,
    seed: perfil?.seed ?? null,
    titulo: `${nombre} salió de la reunión`,
    tono: "neutral",
    duracion: DURACION_MS,
    // Mismo id por persona: si sale y vuelve a salir rápido, se reemplaza.
    id: `salio-${uuid ?? p.identity}`,
  });
  return true;
}

// ── Avisos que manda el servidor ────────────────────────────────────────────

export type ClaseDeAviso = "silenciado" | "silenciados-todos" | "grabando" | "grabacion-detenida";
export interface PersonaDelAviso { uuid: string | null; nombre: string }
export interface AvisoDeSala {
  clase: ClaseDeAviso;
  objetivo?: PersonaDelAviso & { identity: string };
  por: PersonaDelAviso;
}

/** El mismo id que usa el aviso genérico "Alguien silenció tu micrófono" del
 *  hook: cuando llega el del servidor con nombre y cara, lo REEMPLAZA en vez
 *  de apilarse debajo. */
export const ID_AVISO_ME_SILENCIARON = "me-silenciaron";

function esAvisoDeSala(x: unknown): x is AvisoDeSala {
  if (!x || typeof x !== "object") return false;
  const a = x as Record<string, unknown>;
  const por = a.por as Record<string, unknown> | undefined;
  return typeof a.clase === "string" && !!por && typeof por.nombre === "string";
}

/** Muestra un aviso del servidor. `miIdentity` es quién soy en la sala, para
 *  decir "te silenció" en vez de mi nombre, y para no anunciarme a mí mismo
 *  lo que acabo de hacer (mi propio botón ya me lo confirmó). */
export async function mostrarAvisoDeSala(payload: unknown, miIdentity: string): Promise<boolean> {
  if (!esAvisoDeSala(payload)) return false;
  const miUuid = uuidDeIdentity(miIdentity);
  const { clase, por, objetivo } = payload;
  const loHiceYo = !!por.uuid && por.uuid === miUuid;
  const cara = async (persona: PersonaDelAviso) => {
    const perfil = persona.uuid ? await perfilBreveDe(persona.uuid) : null;
    return { nombre: perfil?.nombre || persona.nombre, foto: perfil?.foto ?? null, seed: perfil?.seed ?? null };
  };

  if (clase === "silenciado" && objetivo) {
    const soyYo = objetivo.identity === miIdentity || (!!objetivo.uuid && objetivo.uuid === miUuid);
    if (loHiceYo && !soyYo) return false;
    if (soyYo) {
      const quien = await cara(por);
      avisarPersona({ ...quien, titulo: `${quien.nombre} silenció tu micrófono`, detalle: "Puedes volver a activarlo cuando quieras.", tono: "ojo", duracion: 8_000, id: ID_AVISO_ME_SILENCIARON });
      return true;
    }
    const quien = await cara(objetivo);
    avisarPersona({ ...quien, titulo: `${por.nombre} silenció a ${quien.nombre}`, tono: "neutral", duracion: DURACION_MS, id: `silenciado-${objetivo.uuid ?? objetivo.identity}` });
    return true;
  }

  if (clase === "silenciados-todos") {
    if (loHiceYo) return false;
    const quien = await cara(por);
    avisarPersona({ ...quien, titulo: `${quien.nombre} silenció a todos`, detalle: "Puedes volver a activar tu micrófono cuando quieras.", tono: "ojo", duracion: 8_000, id: ID_AVISO_ME_SILENCIARON });
    return true;
  }

  if (clase === "grabando") {
    if (loHiceYo) return false;
    const quien = await cara(por);
    avisarPersona({ ...quien, titulo: `${quien.nombre} empezó a grabar la reunión`, detalle: "Toda la sala ve el punto rojo mientras dure.", tono: "ojo", duracion: 10_000, id: "grabacion" });
    return true;
  }

  if (clase === "grabacion-detenida") {
    if (loHiceYo) return false;
    const quien = await cara(por);
    avisarPersona({ ...quien, titulo: `${quien.nombre} detuvo la grabación`, tono: "neutral", duracion: DURACION_MS, id: "grabacion" });
    return true;
  }
  return false;
}
