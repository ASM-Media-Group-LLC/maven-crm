// Imágenes pegadas dentro del cuerpo de un correo.
//
// Cuando alguien pega una captura, el editor la mete como `data:` — el archivo
// entero codificado adentro del HTML. Mandarlo así funciona en Gmail y en poco
// más: Outlook, muchos clientes de escritorio y varios filtros antispam tratan
// las imágenes `data:` como sospechosas y las borran, y el correo llega con un
// hueco. La forma correcta desde siempre es `cid:`: la imagen viaja como una
// parte MIME aparte y el HTML la referencia por su Content-ID.
//
// Esto hace esa traducción, y vive suelto —sin React ni Deno— para poder
// probarlo: si se rompe, los correos salen con imágenes rotas y eso no se nota
// hasta que alguien del otro lado lo dice.

export interface ImagenEmbebida {
  /** El `cid` sin los `<>`, tal como queda en `src="cid:…"`. */
  contentId: string;
  filename: string;
  contentType: string;
  contentBase64: string;
}

export interface CuerpoConImagenes {
  html: string;
  imagenes: ImagenEmbebida[];
}

/** Los tipos que aceptamos pegar. Deliberadamente corto: un `data:` con un
 *  tipo raro adentro de un correo es más probable que sea un intento de colar
 *  algo que una imagen que alguien quiso pegar. */
const TIPOS = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** Saca las imágenes `data:` del HTML y las devuelve aparte, dejando el cuerpo
 *  con `src="cid:…"`.
 *
 *  ⚠️ Cada imagen IDÉNTICA se manda una sola vez. Pegar la misma captura tres
 *  veces —o responder a un hilo que ya la traía— duplicaría el peso del correo
 *  tantas veces como aparezca. Se reconocen por su base64. */
export function extraerImagenesEmbebidas(html: string): CuerpoConImagenes {
  const imagenes: ImagenEmbebida[] = [];
  const yaVistas = new Map<string, string>(); // base64 → contentId

  const salida = html.replace(
    /src\s*=\s*"data:([a-z]+\/[a-z0-9.+-]+);base64,([^"]+)"/gi,
    (entero, tipoCrudo: string, b64crudo: string) => {
      const tipo = tipoCrudo.toLowerCase();
      // Un tipo que no está en la lista se deja como estaba: romperlo a la
      // mitad sería peor que dejarlo pasar.
      if (!TIPOS.has(tipo)) return entero;

      // El HTML puede traer saltos de línea adentro del base64.
      const b64 = b64crudo.replace(/\s+/g, "");
      if (!b64) return entero;

      const yaEsta = yaVistas.get(b64);
      if (yaEsta) return `src="cid:${yaEsta}"`;

      const contentId = `img${imagenes.length + 1}.${crypto.randomUUID().slice(0, 8)}@maven-ai.me`;
      yaVistas.set(b64, contentId);
      imagenes.push({
        contentId,
        filename: `imagen-${imagenes.length + 1}.${EXTENSION[tipo] ?? "bin"}`,
        contentType: tipo,
        contentBase64: b64,
      });
      return `src="cid:${contentId}"`;
    },
  );

  return { html: salida, imagenes };
}

/** Cuánto pesa de verdad una imagen que viaja en base64.
 *
 *  Se usa para cobrarle al mismo tope de 20 MB que a los adjuntos: una captura
 *  pegada ocupa lo mismo en el correo que una adjuntada, y dejarla fuera del
 *  conteo sería una puerta para pasarse del límite sin darse cuenta. */
export function pesoDeBase64(b64: string): number {
  const limpio = b64.replace(/[^A-Za-z0-9+/=]/g, "");
  const relleno = limpio.match(/=+$/)?.[0].length ?? 0;
  return Math.max(0, Math.floor((limpio.length * 3) / 4) - relleno);
}
