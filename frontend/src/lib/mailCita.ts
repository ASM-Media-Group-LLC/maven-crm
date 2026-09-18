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
