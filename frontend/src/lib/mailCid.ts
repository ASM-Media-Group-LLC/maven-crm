// Las imágenes PEGADAS dentro de un correo.
//
// Una imagen incrustada no viaja como URL: viaja como una parte MIME del
// propio mensaje, con un `Content-ID`, y el HTML la referencia con
// `src="cid:ese-id"`. Es lo correcto y es lo que manda Maven (ver
// `mailInline.ts`).
//
// ⚠️ PERO NINGÚN NAVEGADOR SABE PEDIR UN `cid:`. No es un esquema que exista
// del lado del cliente: dentro de un `<img>` es tan inalcanzable como una
// dirección inventada. El lector tiene que RESOLVERLO él — buscar la parte que
// lleva ese Content-ID y cambiar el `src` por los bytes de verdad.
//
// Sin esto, la imagen que mandaste perfecta se ve como un ícono roto al
// releerla, sin un solo error en la consola ni nada que explique por qué.

/** Un `Content-ID` comparable: sin los picos y sin espacios.
 *
 *  Los picos son parte de la cabecera (`Content-ID: <x@y>`), no del
 *  identificador, y el `src` los escribe sin ellos. Comparar sin normalizar
 *  hace que NUNCA emparejen. */
export function normalizarCid(cid: string): string {
  return (cid ?? "").trim().replace(/^<|>$/g, "").trim();
}

const SRC_CID = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])cid:([^"']+)\2/gi;

/** Los `cid:` que el HTML referencia, sin repetir. */
export function cidsDelHtml(html: string | null | undefined): string[] {
  if (!html) return [];
  const vistos = new Set<string>();
  for (const m of html.matchAll(SRC_CID)) {
    const cid = normalizarCid(decodeURIComponent(m[3]));
    if (cid) vistos.add(cid);
  }
  return [...vistos];
}

export interface AdjuntoConCid {
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentId: string | null;
}

/** Qué adjuntos hay que bajar para que el cuerpo se vea entero.
 *
 *  Devuelve la POSICIÓN de cada uno, porque así es como se pide un adjunto
 *  (`download_attachment` va por índice). Solo los que el HTML nombra: un
 *  correo con una imagen pegada y un PDF de 40 MB adjunto no tiene por qué
 *  bajar el PDF para mostrar la imagen. */
export function adjuntosIncrustados(
  html: string | null | undefined,
  adjuntos: AdjuntoConCid[] | null | undefined,
): { index: number; cid: string }[] {
  const pedidos = cidsDelHtml(html);
  if (!pedidos.length || !adjuntos?.length) return [];

  const salida: { index: number; cid: string }[] = [];
  for (const cid of pedidos) {
    // Exacto primero. El Content-ID es sensible a mayúsculas según RFC 2392,
    // pero en la práctica hay clientes que lo cambian de caja por el camino, y
    // una imagen rota por una mayúscula no le sirve a nadie.
    let i = adjuntos.findIndex((a) => normalizarCid(a.contentId ?? "") === cid);
    if (i < 0) {
      const bajo = cid.toLowerCase();
      i = adjuntos.findIndex((a) => normalizarCid(a.contentId ?? "").toLowerCase() === bajo);
    }
    if (i >= 0) salida.push({ index: i, cid });
  }
  return salida;
}

/** Cuánto pesa, como mucho, todo lo que se va a meter dentro del documento.
 *
 *  ⚠️ El cuerpo se pinta con `srcDoc`, o sea que cada imagen resuelta se
 *  convierte en texto adentro de una cadena. Un correo con veinte capturas de
 *  pantalla armaría una cadena de decenas de MB y dejaría la pestaña clavada
 *  mientras el navegador la parsea. Pasado el tope, las que sobran se quedan
 *  como estaban: se ve una imagen rota, que es mucho mejor que un Correo que
 *  no responde. */
export const TOPE_INCRUSTADO_BYTES = 12 * 1024 * 1024;

/** Cambia cada `src="cid:…"` por los bytes de verdad, en `data:`.
 *
 *  `data:` ya está permitido por el CSP del lector (ver `MailBody`), así que
 *  esto no abre ningún permiso nuevo: la imagen sigue sin poder salir a
 *  internet ni avisarle a nadie que abriste el correo. */
export function incrustarCids(
  html: string,
  porCid: Map<string, { contentType: string; contentBase64: string }>,
  /** Para el LECTOR (srcDoc). El compositor pasa `Infinity`: una imagen que
   *  quedara como `cid:` en un borrador retomado se perdería al re-guardarlo. */
  tope: number = TOPE_INCRUSTADO_BYTES,
): string {
  if (!porCid.size) return html;
  let usados = 0;
  return html.replace(SRC_CID, (entero, antes: string, comilla: string, crudo: string) => {
    const bytes = porCid.get(normalizarCid(decodeURIComponent(crudo)));
    if (!bytes) return entero;
    // base64 → bytes reales: 4 caracteres por cada 3.
    const peso = Math.ceil((bytes.contentBase64.length * 3) / 4);
    if (usados + peso > tope) return entero;
    usados += peso;
    const tipo = /^image\//i.test(bytes.contentType) ? bytes.contentType : "image/png";
    return `${antes}${comilla}data:${tipo};base64,${bytes.contentBase64}${comilla}`;
  });
}
