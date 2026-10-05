import type { ReactNode } from "react";

/** Mete un pedazo de JSX (un <code>, un @handle en negrita) dentro de una frase
 *  traducida, en el lugar de su marca: `t("scouter.task.from")` sin parámetros
 *  devuelve "desde @{handle}" con la marca intacta, y acá se reemplaza por el
 *  elemento. Así la frase es UNA clave entera y cada idioma pone la pieza donde
 *  le toca, en vez de partir la oración en dos claves sueltas. */
export function textoConPieza(texto: string, marca: string, pieza: ReactNode): ReactNode {
  const i = texto.indexOf(marca);
  if (i < 0) return texto;
  return (
    <>
      {texto.slice(0, i)}
      {pieza}
      {texto.slice(i + marca.length)}
    </>
  );
}
