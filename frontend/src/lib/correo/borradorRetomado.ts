// Retomar un borrador de la carpeta Borradores CON lo que tenía adjunto.
//
// Keila (08/10): «los adjuntos de un borrador no se guardan». El borrador se
// subía sin ellos y al abrirlo con «Editar borrador» no estaban. Ahora se
// guarda con sus partes (ver `save_draft` en mail-fetch), y al retomarlo hay
// que repartirlas de vuelta:
//   · las imágenes PEGADAS (el HTML las nombra con `src="cid:…"`) vuelven
//     adentro del cuerpo, en `data:`, que es lo que come el editor;
//   · el resto vuelve a la lista de adjuntos del compositor.
//
// Suelto, sin React, para poder probarlo.

import { cidsDelHtml, incrustarCids, normalizarCid } from "@/lib/mailCid";

export interface AdjuntoDelCompositor {
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentBase64: string;
}

export interface MetaDelAdjunto {
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentId: string | null;
}

/** `bajados[i]` es el adjunto `metas[i]` ya traído del servidor. */
export function repartirBorradorRetomado(
  html: string | null,
  metas: MetaDelAdjunto[],
  bajados: AdjuntoDelCompositor[],
): { html: string | null; adjuntos: AdjuntoDelCompositor[] } {
  const delHtml = cidsDelHtml(html);
  const porCid = new Map<string, { contentType: string; contentBase64: string }>();
  const adjuntos: AdjuntoDelCompositor[] = [];

  metas.forEach((meta, i) => {
    const bajado = bajados[i];
    if (!bajado) return;
    // Sin distinguir caja: hay clientes que la cambian entre la cabecera y el
    // HTML (ver `adjuntosIncrustados`).
    const cid = normalizarCid(meta.contentId ?? "").toLowerCase();
    const comoLoNombra = cid ? delHtml.filter((c) => c.toLowerCase() === cid) : [];
    // Solo es «imagen pegada» si el cuerpo la nombra: un archivo con
    // Content-ID que el HTML no usa (hay clientes que se lo ponen a todo)
    // tiene que seguir siendo un adjunto, o desaparecería.
    if (comoLoNombra.length === 0) {
      adjuntos.push(bajado);
      return;
    }
    for (const c of comoLoNombra) {
      porCid.set(c, { contentType: bajado.contentType, contentBase64: bajado.contentBase64 });
    }
  });

  return {
    // Sin tope: una imagen que quedara como `cid:` se perdería al re-guardar.
    html: html && porCid.size ? incrustarCids(html, porCid, Infinity) : html,
    adjuntos,
  };
}
