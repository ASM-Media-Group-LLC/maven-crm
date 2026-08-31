// Cómo se arma una dirección de casilla del equipo.
//
// ⚠️ ESTO ES SOLO PARA PREVISUALIZAR. La dirección final la decide el backend
// (`_shared/mail-provision.ts`), que además resuelve colisiones —si
// `juan.perez` ya existe, crea `juan.perez1`—. Acá eso no se puede saber.
//
// Vive en `lib/` y no dentro de un modal porque lo usan DOS pantallas: el alta
// de usuario y el cambio de correo. La copia suelta dentro de `AddUserModal`
// funcionaba, pero tener la misma regla escrita en dos archivos es exactamente
// lo que costó un bug entero en el audio de Cowork: dos nombres para la misma
// cosa, que se separaron sin que nadie lo notara.

/** Dominio de las casillas del equipo. */
export const DOMINIO_CASILLA = "maven-ai.me";

/** Saca tildes y todo lo que no sea letra o número. `José Pérez` → `joseperez`.
 *  Una dirección con caracteres acentuados funciona mal en medio mundo. */
function soloLetrasYNumeros(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/** Dirección sugerida a partir del nombre: `José Pérez` → `jose.perez@…`.
 *  `null` si no hay de dónde sacarla. */
export function sugerirDireccion(nombre: string, apellido: string): string | null {
  const n = soloLetrasYNumeros(nombre);
  const a = soloLetrasYNumeros(apellido);
  if (!n && !a) return null;
  return `${[n, a].filter(Boolean).join(".")}@${DOMINIO_CASILLA}`;
}

/** ¿Esta persona ya tiene casilla del equipo? */
export function yaTieneCasillaDelEquipo(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase().endsWith(`@${DOMINIO_CASILLA}`);
}

/**
 * Dirección sugerida para MIGRAR a alguien que ya tiene correo.
 *
 * Conserva el usuario y solo cambia el dominio:
 * `daniel.duque@unlok.me` → `daniel.duque@maven-ai.me`. Es lo correcto y además
 * lo menos sorprendente para la persona, que sigue teniendo la dirección de
 * siempre.
 *
 * Derivarla del NOMBRE daría cualquier cosa cuando alguien tiene varios
 * nombres: "Daniel Felipe Duque Cortes" produce `daniel.felipeduquecortes`,
 * cuando su dirección de toda la vida es `daniel.duque`. Por eso el correo
 * actual manda sobre el nombre, y el nombre es solo el respaldo.
 *
 * Devuelve `null` si ya está en el dominio del equipo: no hay nada que migrar.
 */
export function sugerirParaMigrar(
  emailActual: string | null | undefined,
  nombre?: string,
  apellido?: string,
): string | null {
  const actual = (emailActual ?? "").trim().toLowerCase();
  if (yaTieneCasillaDelEquipo(actual)) return null;

  // Se conserva el usuario tal cual, solo saneado. Acá NO sirve
  // `soloLetrasYNumeros`, porque saca los PUNTOS — y el punto es parte del
  // formato (`nombre.apellido`): sin él quedaría `danielduque`.
  const usuario = (actual.split("@")[0] ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/\.{2,}/g, ".");

  if (usuario) return `${usuario}@${DOMINIO_CASILLA}`;

  // Sin correo previo utilizable, se cae al nombre.
  return sugerirDireccion(nombre ?? "", apellido ?? "");
}
