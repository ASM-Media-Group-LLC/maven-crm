// Cómo se ve el correo que SALE de Maven: el HTML para los clientes de
// correo y su alternativa en texto plano.
//
// Vive aparte del componente a propósito: son funciones puras, son las que
// deciden lo que le llega al destinatario (que no se ve mirando la pantalla)
// y así se pueden testear sin arrastrar React ni el cliente de Supabase.
// Ver mailHtml.test.ts — cada test de ahí es un defecto que YA pasó.

export function escapar(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escapa para contexto de ATRIBUTO (incluye comillas). El de arriba sirve
 *  para texto; usar ese dentro de un href deja cerrar el atributo e inyectar
 *  otros (`href="x" onmouseover="..."`). */
export function escaparAtributo(t: string): string {
  return escapar(t).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function agregarEstilo(el: Element, css: string): void {
  const previo = el.getAttribute("style");
  el.setAttribute("style", previo ? `${previo};${css}` : css);
}

/** El HTML del editor, vestido para clientes de correo.
 *
 *  Se trabaja sobre el DOM PARSEADO, no con reemplazos de texto sobre el
 *  string. Con `replaceAll("<p>", ...)` pasaban cuatro cosas mal a la vez:
 *  el `<p>` que TipTap mete dentro de cada `<li>` recibía margen y las
 *  listas salían a doble espacio; `<ol start="3">` no matcheaba y esa lista
 *  viajaba sin estilos; un `<` dentro de un href (que el serializador NO
 *  escapa) hacía matchear `"<a "` adentro del atributo e inyectaba estilos
 *  en medio de la URL; y no había forma de tratar distinto un `<p>` vacío.
 *
 *  Los estilos van INLINE porque las hojas de estilo no viajan en un correo:
 *  Gmail y Outlook las descartan. */
export function htmlParaCorreo(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const body = doc.body;

  body.querySelectorAll("p").forEach((el) => {
    if (el.closest("li")) {
      // Dentro de una lista el párrafo es el contenido del ítem: con margen
      // propio cada viñeta quedaba separada 10px de la siguiente.
      agregarEstilo(el, "margin:0");
      return;
    }
    const vacio = !el.textContent?.trim() && !el.querySelector("img,br");
    if (vacio) {
      // Un <p></p> no tiene alto en los webmail: la persona ve un renglón
      // en blanco al escribir y el destinatario no ve nada. El &nbsp; le
      // devuelve la altura de línea.
      el.innerHTML = "&nbsp;";
    }
    agregarEstilo(el, "margin:0 0 10px");
  });

  body.querySelectorAll("blockquote").forEach((el) =>
    agregarEstilo(el, "margin:8px 0;padding:2px 0 2px 12px;border-left:3px solid #d4d4d8;color:#52525b"),
  );
  body.querySelectorAll("a").forEach((el) => agregarEstilo(el, "color:#4f46e5"));
  body.querySelectorAll("ul,ol").forEach((el) =>
    agregarEstilo(el, "margin:0 0 10px;padding-left:24px"),
  );
  // <s> es un tag viejo que el motor de Word y varios webmail no estilan: sin
  // esto un "esto ya no aplica" tachado llega sin tachar, o sea al revés.
  body.querySelectorAll("s,strike,del").forEach((el) =>
    agregarEstilo(el, "text-decoration:line-through"),
  );
  body.querySelectorAll("u").forEach((el) => agregarEstilo(el, "text-decoration:underline"));

  // background explícito: hay clientes (Outlook.com y Apple Mail en oscuro)
  // que pintan el fondo oscuro y dejarían texto gris sobre negro.
  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;` +
    `line-height:1.6;color:#1f2937;background-color:#ffffff">${body.innerHTML}</div>`
  );
}

/** Versión en texto plano, armada del DOM y no con getText().
 *
 *  `editor.getText({ blockSeparator })` mete el separador entre TODOS los
 *  bloques — incluidos los `<p>` que viven dentro de cada `<li>` — así que
 *  una lista salía con un renglón en blanco entre ítems, la cita quedaba
 *  indistinguible de lo escrito (sin "> ") y los links perdían la URL.
 *
 *  Tres cosas que parecen detalle y no lo son:
 *  · cada línea lleva SU prefijo. Un `<p>` con saltos internos (los `<br>`
 *    de una cita) empujado como un solo string dejaba el "> " únicamente en
 *    el primer renglón y el resto del correo citado se mezclaba con lo
 *    recién escrito;
 *  · las sublistas se recorren recursivamente. TipTap las anida DENTRO del
 *    `<li>` padre, así que leer `li.textContent` devolvía "PadreHijoAHijoB"
 *    todo pegado;
 *  · `<ol start="N">` respeta el número. El HTML sí lo conservaba, y las dos
 *    mitades del mismo mensaje se contradecían. */
export function textoParaCorreo(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const body = doc.body;

  // <br> → salto real, y los links quedan como "texto (url)" para no perder
  // la dirección en clientes de solo texto.
  body.querySelectorAll("br").forEach((br) => br.replaceWith(doc.createTextNode("\n")));
  body.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href") ?? "";
    const texto = a.textContent ?? "";
    a.replaceWith(
      doc.createTextNode(href && href !== texto ? `${texto} (${href})` : texto),
    );
  });

  const lineas: string[] = [];

  /** Empuja un texto que puede traer saltos, prefijando CADA línea. */
  const empujar = (prefijo: string, texto: string, marca = "") => {
    const sangria = " ".repeat(marca.length);
    texto.split("\n").forEach((cruda, i) => {
      const linea = cruda.trim();
      const p = prefijo + (i === 0 ? marca : sangria);
      lineas.push(linea ? p + linea : prefijo.trimEnd());
    });
  };

  const esLista = (el: Element) => ["ul", "ol"].includes(el.tagName.toLowerCase());

  const recorrer = (nodo: Element, prefijo: string) => {
    for (const hijo of Array.from(nodo.children)) {
      const tag = hijo.tagName.toLowerCase();

      if (tag === "blockquote") {
        recorrer(hijo, `${prefijo}> `);
        lineas.push(prefijo.trimEnd());
        continue;
      }

      if (tag === "ul" || tag === "ol") {
        let n = Number(hijo.getAttribute("start")) || 1;
        for (const li of Array.from(hijo.children)) {
          if (li.tagName.toLowerCase() !== "li") continue;
          const marca = tag === "ol" ? `${n++}. ` : "- ";
          // El contenido propio del ítem lleva la marca; las sublistas se
          // recorren aparte, sangradas bajo él.
          const propios = Array.from(li.children).filter((c) => !esLista(c));
          const texto = propios.map((c) => c.textContent ?? "").join("\n").trim();
          if (texto) empujar(prefijo, texto, marca);
          for (const sub of Array.from(li.children).filter(esLista)) {
            recorrer(li, prefijo + " ".repeat(marca.length));
            break; // recorrer(li) ya barre todas las sublistas del ítem
          }
        }
        lineas.push(prefijo.trimEnd());
        continue;
      }

      if (tag === "p") {
        empujar(prefijo, (hijo.textContent ?? "").trim());
        continue;
      }

      recorrer(hijo, prefijo);
    }
  };
  recorrer(body, "");

  return lineas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
