// Plegar lo CITADO de un correo, como el «•••» de Gmail.
//
// Con los hilos andando, la cita es texto repetido: la conversación entera ya
// está apilada arriba. Y en una cadena de cinco respuestas, cada mensaje
// arrastra a los cuatro anteriores — leer el último obliga a pasar por todo lo
// que ya leíste, con sangría creciente. Es lo que Jhon puso al lado de Gmail.
//
// ⚠️ NO SE PARTE LA CADENA DE TEXTO POR UN ÍNDICE. Cortar HTML por posición
// deja etiquetas sin cerrar de un lado y huérfanas del otro, y lo que se ve
// después no se parece a lo que mandaron. Se parsea de verdad con `DOMParser`
// —que NO ejecuta scripts ni pide recursos, es solo un árbol— y se mueve el
// nodo entero con todo lo que le sigue.

/** Cómo marca cada cliente el arranque de lo citado.
 *
 *  Están los tres que conviven en la empresa (Gmail, Outlook y Zoho) más el
 *  `blockquote` genérico, que es lo que manda Maven. */
const MARCAS = [
  ".gmail_quote_container",
  ".gmail_quote",
  "#divRplyFwdMsg",          // Outlook escritorio
  "#appendonsend",           // Outlook web
  ".zmail_extra",            // Zoho
  "#Zm-_Id_-Sgn",
  "blockquote[type=cite]",
  "blockquote",
];

export interface CuerpoPartido {
  /** Lo que escribió quien manda: lo único que se muestra de entrada. */
  propio: string;
  /** Lo citado, o `null` si no había nada que plegar. */
  citado: string | null;
}

/** Un nodo vacío no vale como marca de cita. */
function tieneAlgo(el: Element): boolean {
  return (el.textContent ?? "").trim().length > 0;
}

/**
 * Parte el cuerpo en lo propio y lo citado.
 *
 * ⚠️ Si la marca es lo PRIMERO del correo, no se pliega nada. Un reenvío suele
 * ser exactamente eso —una cita y nada más—, y plegarlo dejaría un correo que
 * al abrirlo se ve vacío, con un «•••» donde debería estar todo el contenido.
 * Un correo que parece vacío se lee como correo perdido.
 */
export function partirCitado(html: string | null | undefined): CuerpoPartido {
  if (!html || typeof DOMParser === "undefined") return { propio: html ?? "", citado: null };

  const doc = new DOMParser().parseFromString(`<div id="raiz">${html}</div>`, "text/html");
  const raiz = doc.getElementById("raiz");
  if (!raiz) return { propio: html, citado: null };

  let marca: Element | null = null;
  for (const sel of MARCAS) {
    const cand = raiz.querySelector(sel);
    if (cand && tieneAlgo(cand)) { marca = cand; break; }
  }
  if (!marca) return { propio: html, citado: null };

  // ⚠️ NO SE SUBE HASTA EL HIJO DE LA RAÍZ. La primera versión lo hacía y era
  // inútil justo en el caso más común: en las respuestas que manda Maven, la
  // cita va ANIDADA dentro de un div envolvente que lleva también el párrafo
  // que uno escribió. Subir hasta ese envolvente se llevaba las dos cosas, el
  // resultado quedaba vacío y la función devolvía el correo sin plegar.
  //
  // Lo correcto es cortar el árbol EN ESE PUNTO: se mueve el marcador con sus
  // hermanos siguientes, y después, subiendo, lo que va después de cada padre.
  // Los padres se quedan donde están, con lo que tengan más arriba.
  const cadena: Element[] = [];
  for (let n: Element | null = marca; n && n !== raiz; n = n.parentElement) cadena.push(n);

  const citado = doc.createElement("div");
  for (const n of cadena) {
    // Del marcador se mueve ÉL; de cada padre, solo lo que le sigue.
    let cursor: ChildNode | null = n === marca ? n : n.nextSibling;
    while (cursor) {
      const siguiente: ChildNode | null = cursor.nextSibling;
      citado.appendChild(cursor);
      cursor = siguiente;
    }
  }

  const propio = raiz.innerHTML;
  // Antes de la cita no quedó nada escrito: es un reenvío o una respuesta en
  // blanco. Mostrarla entera es lo correcto.
  if (!(raiz.textContent ?? "").trim() && !raiz.querySelector("img")) {
    return { propio: html, citado: null };
  }
  return { propio, citado: citado.innerHTML };
}

/** Lo mismo para los correos que solo traen texto plano.
 *
 *  Acá la marca es la sangría con `>` de toda la vida, precedida por la línea
 *  de «El … escribió:». Se corta en la PRIMERA línea citada y no se vuelve:
 *  una respuesta intercalada entre citas se muestra entera, que es lo seguro. */
export function partirCitadoTexto(texto: string | null | undefined): {
  propio: string;
  citado: string | null;
} {
  if (!texto) return { propio: texto ?? "", citado: null };
  const lineas = texto.split("\n");
  let corte = -1;
  for (let i = 0; i < lineas.length; i++) {
    if (/^\s*>/.test(lineas[i])) {
      // La línea de encabezado («El 18 de septiembre…, X escribió:») va justo
      // arriba y es parte de la cita, no del mensaje.
      corte = i > 0 && /escribió:|wrote:|escribio:\s*$/i.test(lineas[i - 1]) ? i - 1 : i;
      break;
    }
  }
  if (corte <= 0) return { propio: texto, citado: null };
  const propio = lineas.slice(0, corte).join("\n").trimEnd();
  if (!propio.trim()) return { propio: texto, citado: null };
  return { propio, citado: lineas.slice(corte).join("\n") };
}


/** Dónde arranca lo citado DENTRO DE UNA SOLA LÍNEA.
 *
 *  El `snippet` que guarda el sincronizador es el cuerpo con los espacios
 *  aplastados: no tiene saltos de línea, así que el corte por sangría no
 *  sirve. Estas son las marcas tal como quedan pegadas en un renglón. */
const MARCAS_EN_LINEA: RegExp[] = [
  /(^|\s)>\s/,                                        // la sangría de toda la vida
  // ⚠️ `.` y NO `[^:]`: la línea del encabezado lleva la HORA adentro
  // («…de 2026, 15:53, Jhon Lopez escribió:»), así que prohibir los dos
  // puntos hacía que nunca emparejara. Se acota con el perezoso `{0,90}?`.
  /\bEl \d{1,2} de [a-záéíóú]+ de \d{4}.{0,90}?escribi/i,
  /\bEl [a-záéíóú]{3,10},? \d{1,2} [a-záéíóú]{3,12}.{0,90}?escribi/i,
  /\bOn .{0,100}?\bwrote:/i,
  /-{2,}\s*(Mensaje original|Mensaje reenviado|Original Message|Forwarded message)/i,
];

/** ¿Queda algo que LEER? Un resto de solo signos («>», «--») no es texto. */
function diceAlgo(s: string): boolean {
  return /[\p{L}\p{N}]/u.test(s);
}

/** El resumen de un correo SIN la cita que arrastra.
 *
 *  ⚠️ Es lo que separa «llegó» de «llegó > El 18 de septiembre de 2026, 15:53,
 *  Jhon Lopez escribió:…». En una conversación apilada, todos los renglones
 *  plegados empiezan igual —con la cita del anterior— y la tira deja de decir
 *  quién dijo qué. Gmail muestra solo lo que escribió cada uno.
 *
 *  Si al sacar la cita no queda nada, se devuelve el resumen entero: un
 *  renglón vacío es peor que uno con la cita. */
export function resumenSinCita(resumen: string | null | undefined): string {
  const s = (resumen ?? "").trim();
  if (!s) return "";
  let corte = -1;
  for (const re of MARCAS_EN_LINEA) {
    const m = re.exec(s);
    if (m && (corte < 0 || m.index < corte)) corte = m.index;
  }
  if (corte < 0) return s;
  const propio = s.slice(0, corte).trim();
  // ⚠️ `propio || s` no alcanzaba: un resto de «>» es una cadena no vacía y
  // pasaba como resumen. Un renglón que dice «>» es igual de inútil que uno
  // vacío, y encima parece un error.
  return diceAlgo(propio) ? propio : s;
}
