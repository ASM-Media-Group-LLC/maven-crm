// Drive: de qué ESPACIO sale lo que ocupa cada cosa, para avisar ANTES de
// mover algo que cambia de espacio (Jhon, 03/10: «como Google»).
//
// En Maven NO hay un cupo por unidad compartida (lo revisamos: el modelo es
// 20261002130000_drive_unidades.sql). Hay dos bolsas, como en Google:
//   · «personal»: lo que está fuera de las unidades compartidas cuenta en el
//     espacio de su PROPIETARIO (drive_uso: 50 GB salvo que un admin ponga
//     otro; lo importado sin dueño no cuenta en el de nadie);
//   · «agencia»: lo que está dentro de CUALQUIER unidad compartida cuenta en
//     el espacio común de la agencia (drive_uso_agencia; KASH, sin tope).
// La bolsa la dice drive_items.unidad_id (la unidad que contiene la ficha, o
// null), que mantienen los triggers al mover. Mover entre dos unidades no
// cambia nada (las dos gastan el espacio común); mover de Mi unidad a una
// unidad, o al revés, sí.

export type Bolsa = "personal" | "agencia";

export const bolsaDe = (unidadId: string | null | undefined): Bolsa => (unidadId ? "agencia" : "personal");

export interface FichaParaEspacio {
  id: string;
  tipo: "carpeta" | "archivo";
  owner_id: string | null;
  size: number | null;
  unidad_id: string | null;
}

export interface CambioDeEspacio {
  /** A qué bolsa van. */
  hacia: Bolsa;
  /** Las que cambian de bolsa (las demás ya estaban en la de destino). */
  cambian: FichaParaEspacio[];
}

/** Qué cambia de bolsa al mover `fichas` a una carpeta de la unidad
 *  `unidadDestino` (null = fuera de las unidades: Mi unidad o una carpeta
 *  que no es de una unidad). null si nada cambia de bolsa. */
export function cambioDeEspacio(fichas: readonly FichaParaEspacio[], unidadDestino: string | null): CambioDeEspacio | null {
  const hacia = bolsaDe(unidadDestino);
  const cambian = fichas.filter((f) => bolsaDe(f.unidad_id) !== hacia);
  return cambian.length ? { hacia, cambian } : null;
}

/** Si lo que se mueve entra en el espacio de destino. `cupo` null = sin tope. */
export function entraEnElEspacio(usado: number, cupo: number | null, bytes: number): boolean {
  return cupo == null || usado + bytes <= cupo;
}
