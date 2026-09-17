/** Lector del BODYSTRUCTURE de IMAP: el índice del correo, para bajar UNA parte.
 *
 *  ¿Por qué existe? Para descargar un adjunto, Maven se traía el correo ENTERO
 *  y lo cortaba a 20 MB. Un correo de RRHH con 24 hojas de vida pesa ~17 MB de
 *  archivos, que en MIME viajan en base64 (~1,37×) y dan ~23 MB de mensaje
 *  crudo: se pasaba del tope y NINGUNO de los 24 se podía bajar, ni siquiera
 *  uno de 37 KB (reporte de Andrea, 16/09/2026). Con el BODYSTRUCTURE sabemos
 *  qué número de parte le toca a cada adjunto y le pedimos al servidor solo
 *  esa: bajar un archivo de 37 KB cuesta 37 KB, pese lo que pese el correo.
 *
 *  El BODYSTRUCTURE es una lista entre paréntesis, anidada. Un ejemplo con un
 *  texto y un PDF adjunto:
 *
 *    (("TEXT" "PLAIN" ("CHARSET" "utf-8") NIL NIL "7BIT" 120 4)
 *     ("APPLICATION" "PDF" ("NAME" "cv.pdf") NIL NIL "BASE64" 27000 NIL
 *      ("ATTACHMENT" ("FILENAME" "cv.pdf")) NIL NIL)
 *     "MIXED" ("BOUNDARY" "xxx") NIL NIL)
 *
 *  Las hojas se numeran 1, 2, 3… y las de un multipart anidado heredan el
 *  prefijo: 2.1, 2.2. Un mensaje que NO es multipart tiene una sola parte, la 1.
 */

export interface ParteDelCuerpo {
  /** El número que se le pasa a `BODY.PEEK[...]`: "2", "2.1"… */
  seccion: string;
  tipo: string;
  subtipo: string;
  /** base64, quoted-printable, 7bit… Hace falta para decodificar. */
  codificacion: string;
  /** Lo que ocupa YA codificado en el correo, que es lo que viaja. */
  bytes: number;
  nombre: string | null;
  esAdjunto: boolean;
}

type Nodo = string | null | Nodo[];

/** El BODYSTRUCTURE puede traer literales (`{12}` + 12 bytes) cuando un nombre
 *  de archivo tiene acentos o comillas. Si no se contemplan, el tokenizador se
 *  come el resto de la lista y el parseo sale mudo en vez de fallar. */
function tokenizar(texto: string): Nodo {
  let i = 0;

  function saltarEspacios() {
    while (i < texto.length && /\s/.test(texto[i])) i++;
  }

  function leerCadena(): string {
    i++; // la comilla de apertura
    let s = "";
    while (i < texto.length && texto[i] !== '"') {
      if (texto[i] === "\\") i++; // \" y \\ van literales
      s += texto[i++];
    }
    i++; // la comilla de cierre
    return s;
  }

  function leerLiteral(): string {
    const m = /^\{(\d+)\}\r?\n/.exec(texto.slice(i));
    if (!m) return "";
    i += m[0].length;
    const n = Number(m[1]);
    const s = texto.slice(i, i + n);
    i += n;
    return s;
  }

  function leerAtomo(): string {
    let s = "";
    while (i < texto.length && !/[\s()]/.test(texto[i])) s += texto[i++];
    return s;
  }

  function leerLista(): Nodo[] {
    i++; // el "("
    const lista: Nodo[] = [];
    for (;;) {
      saltarEspacios();
      if (i >= texto.length) break;
      if (texto[i] === ")") { i++; break; }
      lista.push(leerValor());
    }
    return lista;
  }

  function leerValor(): Nodo {
    saltarEspacios();
    const c = texto[i];
    if (c === "(") return leerLista();
    if (c === '"') return leerCadena();
    if (c === "{") return leerLiteral();
    const atomo = leerAtomo();
    return atomo.toUpperCase() === "NIL" ? null : atomo;
  }

  saltarEspacios();
  return leerValor();
}

const esLista = (n: Nodo): n is Nodo[] => Array.isArray(n);
const esTexto = (n: Nodo): n is string => typeof n === "string";

/** Los parámetros vienen como lista plana de pares: ("NAME" "cv.pdf" "X" "1"). */
function buscarParametro(params: Nodo, clave: string): string | null {
  if (!esLista(params)) return null;
  for (let i = 0; i + 1 < params.length; i += 2) {
    const k = params[i];
    if (esTexto(k) && k.toUpperCase() === clave) {
      const v = params[i + 1];
      return esTexto(v) ? v : null;
    }
  }
  return null;
}

/** Una parte simple: (tipo subtipo params id descripción codificación tamaño …).
 *  Lo que viene DESPUÉS del tamaño cambia según el tipo, y de ahí sale dónde
 *  empiezan las extensiones — que es donde vive el Content-Disposition. */
function leerHoja(nodo: Nodo[], seccion: string): ParteDelCuerpo {
  const tipo = esTexto(nodo[0]) ? nodo[0].toUpperCase() : "APPLICATION";
  const subtipo = esTexto(nodo[1]) ? nodo[1].toUpperCase() : "OCTET-STREAM";
  const params = nodo[2];
  const codificacion = esTexto(nodo[5]) ? nodo[5].toLowerCase() : "7bit";
  const bytes = esTexto(nodo[6]) ? Number(nodo[6]) || 0 : 0;

  // TEXT trae además el número de líneas; MESSAGE/RFC822 trae sobre, cuerpo y
  // líneas. En el resto, las extensiones arrancan justo después del tamaño.
  let inicioExt = 7;
  if (tipo === "TEXT") inicioExt = 8;
  else if (tipo === "MESSAGE" && subtipo === "RFC822") inicioExt = 10;

  // Extensiones: md5, disposition, language, location.
  const disposicion = nodo[inicioExt + 1];
  let tipoDisposicion: string | null = null;
  let nombrePorDisposicion: string | null = null;
  if (esLista(disposicion)) {
    const d = disposicion[0];
    tipoDisposicion = esTexto(d) ? d.toUpperCase() : null;
    nombrePorDisposicion = buscarParametro(disposicion[1], "FILENAME");
  }

  const nombre = nombrePorDisposicion ?? buscarParametro(params, "NAME");

  // El mismo criterio que usa `extraerAdjunto` sobre el MIME crudo, para que
  // las dos listas de adjuntos salgan en el mismo orden y con los mismos
  // elementos. Si no coincidieran, el índice de la UI apuntaría a otro archivo.
  const esAdjunto = tipoDisposicion === "ATTACHMENT" ||
    (!!nombre && tipo !== "TEXT");

  return { seccion, tipo, subtipo, codificacion, bytes, nombre, esAdjunto };
}

function recorrer(nodo: Nodo, prefijo: string, salida: ParteDelCuerpo[]): void {
  if (!esLista(nodo)) return;

  // Multipart: empieza con sublistas (las partes) y después viene el subtipo.
  if (esLista(nodo[0])) {
    let n = 0;
    for (const hijo of nodo) {
      if (!esLista(hijo)) break; // llegó el subtipo: se acabaron las partes
      n++;
      recorrer(hijo, prefijo ? `${prefijo}.${n}` : String(n), salida);
    }
    return;
  }

  // Parte simple. Sin prefijo es un mensaje de una sola parte: es la 1.
  salida.push(leerHoja(nodo, prefijo || "1"));
}

/** Devuelve las hojas del mensaje, en el orden en que aparecen. */
export function parsearBodyStructure(texto: string): ParteDelCuerpo[] {
  try {
    const salida: ParteDelCuerpo[] = [];
    recorrer(tokenizar(texto), "", salida);
    return salida;
  } catch {
    // Un BODYSTRUCTURE raro no puede tumbar la descarga: quien llama se queda
    // sin atajo y vuelve a bajar el mensaje entero, como antes.
    return [];
  }
}

/** Qué parte corresponde al adjunto `indice` de la metadata guardada.
 *
 *  ⚠️ NO se confía solo en el orden. La metadata la arma `mailparser` en
 *  mail-sync y esta lista sale del BODYSTRUCTURE: son dos enumeradores
 *  distintos y un desacuerdo silencioso entregaría OTRO archivo, que es peor
 *  que fallar. Por eso manda el nombre, con el tamaño para desempatar, y el
 *  orden queda solo como último recurso. */
export function parteDelAdjunto(
  partes: ParteDelCuerpo[],
  indice: number,
  pista?: { nombre?: string | null; bytes?: number | null },
): ParteDelCuerpo | null {
  const adjuntos = partes.filter((p) => p.esAdjunto);
  if (!adjuntos.length) return null;

  const nombre = pista?.nombre?.trim();
  if (nombre) {
    const porNombre = adjuntos.filter((p) => p.nombre === nombre);
    if (porNombre.length === 1) return porNombre[0];
    if (porNombre.length > 1) {
      // Repetidos: el tamaño desempata. Ojo que `bytes` acá es lo CODIFICADO
      // (base64 infla ~4/3), así que se compara con tolerancia amplia.
      const esperado = pista?.bytes ?? 0;
      if (esperado > 0) {
        const cerca = porNombre.find(
          (p) => Math.abs(p.bytes - esperado * (4 / 3)) < esperado * 0.2 + 1024,
        );
        if (cerca) return cerca;
      }
      return porNombre[Math.min(indice, porNombre.length - 1)];
    }
  }

  return adjuntos[indice] ?? null;
}
