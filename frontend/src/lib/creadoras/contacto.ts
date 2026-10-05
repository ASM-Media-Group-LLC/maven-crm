// EL CORREO Y EL TELÉFONO DE UNA CREADORA LLEGAN ENMASCARADOS a quien no es
// admin: v_creators los pasa por mask_email/mask_phone («a•••@gmail.com»,
// «••••••4567»). Un formulario que guarda lo que muestra escribiría la
// máscara encima del dato real (Jhon, 06/10, al agregar el correo a la ficha).
// Aparte de los formularios para poder probarlo sin dibujarlos.

const PUNTO = "•";

export const estaEnmascarado = (v: string | null | undefined): boolean => !!v && v.includes(PUNTO);

/** Lo que va en la casilla al empezar a editar: el dato, o vacío si llegó
 *  enmascarado (para cambiarlo se escribe uno nuevo). */
export const valorParaEditar = (v: string | null | undefined): string => (estaEnmascarado(v) ? "" : v ?? "");

/** Lo que hay que guardar, o `undefined` si el campo no se toca: no cambió,
 *  o llegó enmascarado y no se escribió nada. Nunca devuelve una máscara. */
export function cambioDeContacto(original: string | null | undefined, escrito: string): string | null | undefined {
  const nuevo = escrito.trim();
  if (estaEnmascarado(nuevo)) return undefined;
  if (estaEnmascarado(original)) return nuevo || undefined;
  if (nuevo === (original ?? "").trim()) return undefined;
  return nuevo || null;
}

export const correoValido = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
