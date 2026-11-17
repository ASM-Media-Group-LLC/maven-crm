import type { ConexionSala, Latido } from "@/lib/coworkTiempoRegla";

// EL LATIDO DEL SUPERVISOR SALE DE DOS LLAMADAS (Luis, 17/11/2026: estaba en la
// Sala 1 con cámara y pantalla y Argos lo reportaba «fuera de Cowork»).
//
// El supervisor del Hub puede estar en dos llamadas a la vez: el Hub y la sala
// a la que entró. Antes el latido salía SOLO del Hub: si el Hub se caía o se
// colgaba mientras trabajaba dentro de una sala, el latido se apagaba y el vigía
// lo daba por ido, aunque siguiera adentro con todo prendido.
//
// Ahora cuenta lo que tenga prendido en CUALQUIERA de las dos.

export interface MedioDeLlamada {
  camOn: boolean;
  screenShareOn: boolean;
  conexionSala: ConexionSala | null;
}

/** De mejor a peor: si una de las dos llamadas está conectada, está adentro. */
const ORDEN: readonly ConexionSala[] = ["conectada", "reconectando", "desconectada", "reemplazada"];

export function juntarMedios(
  hub: MedioDeLlamada | null,
  sala: MedioDeLlamada | null,
): Pick<Latido, "camOn" | "screenShareOn" | "conexionSala"> {
  const conexiones = [hub?.conexionSala, sala?.conexionSala].filter(
    (c): c is ConexionSala => !!c,
  );
  const conexionSala = conexiones.length
    ? conexiones.reduce((a, b) => (ORDEN.indexOf(a) <= ORDEN.indexOf(b) ? a : b))
    : null;
  return {
    camOn: !!hub?.camOn || !!sala?.camOn,
    screenShareOn: !!hub?.screenShareOn || !!sala?.screenShareOn,
    conexionSala,
  };
}
