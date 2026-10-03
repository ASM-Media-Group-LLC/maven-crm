// Drive: bajar varios archivos en un .zip CON AVANCE y que se pueda cancelar
// (Jhon, 03/10: «se selecciona y se baja un .zip sin indicación de avance»).
//
// El .zip lo arma el NAS MIENTRAS baja (infra/nas-drive/zip.mjs: STORE, sin
// comprimir). Antes el permiso iba a un iframe escondido y el navegador lo
// bajaba por su cuenta: la página no sabía cuánto iba ni podía cortarlo.
// Ahora la página lo pide con fetch y lee la respuesta de a pedazos: sabe
// cuánto llegó y, de antemano, el total: el NAS manda Content-Length (con
// STORE y los tamaños conocidos, el largo del .zip se calcula antes de mandar
// un byte); un NAS que todavía no lo manda deja una estimación con lo que contó
// la edge (los archivos más sus cabeceras).
//
// Dónde se guarda lo que llega (comoBajar):
//   · «memoria»: hasta 1 GB (500 MB fuera de Chrome/Edge). Se junta en Blobs
//     de 32 MB (el navegador los puede pasar a disco) y al terminar se
//     descarga solo, como en Google.
//   · «disco»: más grande, en Chrome/Edge (File System Access): la persona
//     elige dónde guardarlo y cada pedazo va directo al archivo.
//   · «navegador»: más grande en Safari/Firefox: como antes, lo baja el
//     navegador y el avance se ve en su barra de descargas (con el total, si
//     el NAS manda Content-Length).

/** Hasta cuánto se junta en memoria, según haya o no a dónde mandarlo directo. */
export const EN_MEMORIA_CON_DISCO = 1024 ** 3;
export const EN_MEMORIA_SIN_DISCO = 500 * 1024 ** 2;
/** De a cuánto se juntan los pedazos en un Blob. */
export const TANDA_EN_MEMORIA = 32 * 1024 ** 2;

export type ComoBajar = "memoria" | "disco" | "navegador";

export function comoBajar(total: number, hayDisco: boolean): ComoBajar {
  if (total <= (hayDisco ? EN_MEMORIA_CON_DISCO : EN_MEMORIA_SIN_DISCO)) return "memoria";
  return hayDisco ? "disco" : "navegador";
}

/** Lo que pesa el .zip si el NAS no dice el total: los archivos más, por cada
 *  uno, sus cabeceras (local, descriptor y directorio central, con un nombre
 *  de ~60 bytes) y el cierre. Alcanza para una barra; el exacto lo da
 *  Content-Length. */
export function tamanoEstimado(bytes: number, archivos: number): number {
  return Math.max(0, bytes) + Math.max(0, archivos) * 230 + 98;
}

/** Cuánto va, de 0 a 1. Con un total estimado no llega a 1 antes de terminar
 *  (la barra no se queda «llena» esperando). */
export function fraccion(recibido: number, total: number, exacto: boolean): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(exacto ? 1 : 0.99, recibido / total));
}

/** El nombre del .zip, del permiso que firmó la edge (`<datos>.<firma>`, los
 *  datos en base64url: { op: "zip", n: "Contabilidad-2026-10-03.zip", … }).
 *  Los datos no son secretos (lo que protege es la firma). Si no se puede
 *  leer, «Maven.zip». */
export function nombreDelPermiso(permiso: string): string {
  try {
    const datos = permiso.split(".")[0] ?? "";
    const b64 = datos.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const texto = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const n = (JSON.parse(texto) as { n?: unknown }).n;
    if (typeof n === "string" && /\.zip$/i.test(n) && n.length <= 200 && !/[/\\]/.test(n)) return n;
  } catch { /* un permiso raro: el nombre de siempre */ }
  return "Maven.zip";
}

/** A dónde van los pedazos: la memoria o un archivo elegido. */
export interface DestinoDelZip {
  escribir(pedazo: Uint8Array): void | Promise<void>;
  terminar(): void | Promise<void>;
  descartar(): void | Promise<void>;
}

/** En memoria, de a Blobs de TANDA_EN_MEMORIA; al terminar, `guardar` recibe
 *  el .zip entero. */
export function destinoEnMemoria(guardar: (zip: Blob) => void, tanda = TANDA_EN_MEMORIA): DestinoDelZip {
  const partes: Blob[] = [];
  let juntos: Uint8Array[] = [];
  let enTanda = 0;
  const cerrarTanda = () => {
    if (juntos.length) partes.push(new Blob(juntos as BlobPart[]));
    juntos = [];
    enTanda = 0;
  };
  return {
    escribir(pedazo) {
      juntos.push(pedazo);
      enTanda += pedazo.length;
      if (enTanda >= tanda) cerrarTanda();
    },
    terminar() {
      cerrarTanda();
      guardar(new Blob(partes, { type: "application/zip" }));
      partes.length = 0;
    },
    descartar() {
      juntos = [];
      partes.length = 0;
    },
  };
}

export class ErrorDelNas extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

/**
 * Pide el .zip al NAS (POST con el permiso como formulario, igual que el
 * iframe de antes: es un pedido «simple», sin pregunta previa de CORS) y lo
 * pasa al destino de a pedazos. `alAvanzar` recibe los bytes que llegaron;
 * `alSaberTotal`, el Content-Length si el NAS lo manda. Si llega menos de lo
 * anunciado (el NAS cortó), es un error: un .zip a medias no se guarda.
 */
export async function bajarDelNas(args: {
  url: string;
  permiso: string;
  destino: DestinoDelZip;
  senal: AbortSignal;
  alSaberTotal?: (bytes: number) => void;
  alAvanzar?: (recibido: number) => void;
  pedir?: typeof fetch;
}): Promise<number> {
  const { url, permiso, destino, senal, alSaberTotal, alAvanzar, pedir = fetch } = args;
  let recibido = 0;
  try {
    const r = await pedir(url, { method: "POST", body: new URLSearchParams({ t: permiso }), signal: senal });
    if (!r.ok || !r.body) {
      const j = await r.json().catch(() => null) as { error?: string } | null;
      throw new ErrorDelNas(j?.error ?? `el NAS contestó ${r.status}`, r.status);
    }
    const largo = Number(r.headers.get("content-length"));
    const exacto = Number.isFinite(largo) && largo > 0;
    if (exacto) alSaberTotal?.(largo);
    const lector = r.body.getReader();
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      recibido += value.length;
      await destino.escribir(value);
      alAvanzar?.(recibido);
    }
    if (exacto && recibido !== largo) throw new ErrorDelNas("la descarga se cortó a mitad");
    await destino.terminar();
    return recibido;
  } catch (e) {
    await Promise.resolve(destino.descartar()).catch(() => {});
    throw e;
  }
}
