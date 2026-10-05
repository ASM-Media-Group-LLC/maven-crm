// SUBIR UN ARCHIVO AL NAS, POR PARTES, AGUANTANDO CORTES.
//
// La usa el portal de creadoras: videos de cientos de MB desde un celular, donde
// el internet se corta, el teléfono cambia de wifi a datos o se queda sin señal
// un rato. Cada parte se manda con su permiso firmado (lo da la edge) y:
//   · si falla por la red o el servidor (sin respuesta, 5xx, 408, 429), se
//     reintenta sola, esperando cada vez un poco más;
//   · si el teléfono está sin internet, espera a que vuelva (sin gastar intentos);
//   · si el NAS dice que no (400, 403, 413…), no insiste: eso no se arregla solo;
//   · reintentar una parte es seguro: el NAS la escribe entera o no la escribe.
// Al final, «completar» junta las partes y el NAS devuelve el RECIBO firmado que
// la edge pide para dar el archivo por subido.
//
// Sin React ni Supabase adentro: se prueba con un `enviar` falso
// (test/portal/subidaPorPartes.test.ts).

export interface PlanDeSubida {
  /** Uno chico va entero. */
  url?: string;
  tamano_parte?: number;
  partes?: string[];
  completar?: string;
}

export interface RespuestaHttp {
  status: number;
  cuerpo: unknown;
}

/** Manda un pedido y avisa cuántos bytes salieron. status 0 = sin respuesta (la red). */
export type Enviar = (
  url: string,
  metodo: "PUT" | "POST",
  cuerpo: Blob | null,
  onProgreso: (enviados: number) => void,
  signal: AbortSignal,
) => Promise<RespuestaHttp>;

export class SubidaCancelada extends Error {
  constructor() {
    super("subida_cancelada");
    this.name = "SubidaCancelada";
  }
}

export class SubidaFallida extends Error {
  constructor(public codigo: "nas_rechazo" | "sin_red" | "sin_recibo", public status = 0) {
    super(codigo);
    this.name = "SubidaFallida";
  }
}

export interface Opciones {
  onProgreso?: (enviados: number) => void;
  /** Reintentando (n = cuál), o esperando que vuelva el internet. */
  onEstado?: (e: { reintento: number } | { sinInternet: true } | { subiendo: true }) => void;
  signal?: AbortSignal;
  /** Intentos por parte (además del primero). */
  reintentos?: number;
  enviar?: Enviar;
  esperar?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** ¿Hay internet ahora? Y una promesa que se cumple cuando vuelve. */
  enLinea?: () => boolean;
  cuandoVuelva?: (signal: AbortSignal) => Promise<void>;
}

const ESPERAS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];
const reintentable = (s: number) => s === 0 || s === 408 || s === 429 || s >= 500;

const esperarDeVerdad = (ms: number, signal: AbortSignal) =>
  new Promise<void>((ok, mal) => {
    const t = setTimeout(ok, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); mal(new SubidaCancelada()); }, { once: true });
  });

const cuandoVuelvaDeVerdad = (signal: AbortSignal) =>
  new Promise<void>((ok, mal) => {
    const listo = () => { window.removeEventListener("online", listo); ok(); };
    window.addEventListener("online", listo);
    signal.addEventListener("abort", () => { window.removeEventListener("online", listo); mal(new SubidaCancelada()); }, { once: true });
  });

/** El envío de verdad: XHR, que es lo que da el progreso de subida. */
export const enviarConXhr: Enviar = (url, metodo, cuerpo, onProgreso, signal) =>
  new Promise((ok, mal) => {
    if (signal.aborted) return mal(new SubidaCancelada());
    const xhr = new XMLHttpRequest();
    xhr.open(metodo, url);
    xhr.upload.onprogress = (e) => onProgreso(e.loaded);
    xhr.onload = () => {
      let c: unknown = null;
      try { c = JSON.parse(xhr.responseText); } catch { c = null; }
      ok({ status: xhr.status, cuerpo: c });
    };
    xhr.onerror = () => ok({ status: 0, cuerpo: null });
    xhr.ontimeout = () => ok({ status: 0, cuerpo: null });
    xhr.onabort = () => mal(new SubidaCancelada());
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(cuerpo);
  });

export async function subirPorPartes(archivo: Blob, plan: PlanDeSubida, o: Opciones = {}): Promise<string> {
  const signal = o.signal ?? new AbortController().signal;
  const enviar = o.enviar ?? enviarConXhr;
  const esperar = o.esperar ?? esperarDeVerdad;
  const enLinea = o.enLinea ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const cuandoVuelva = o.cuandoVuelva ?? cuandoVuelvaDeVerdad;
  const reintentos = o.reintentos ?? ESPERAS.length;
  let listos = 0; // bytes de las partes ya guardadas

  // Un pedido, con sus reintentos. Devuelve la respuesta buena (2xx).
  const conReintentos = async (url: string, metodo: "PUT" | "POST", cuerpo: Blob | null): Promise<RespuestaHttp> => {
    for (let intento = 0; ; intento++) {
      if (signal.aborted) throw new SubidaCancelada();
      if (!enLinea()) {
        o.onEstado?.({ sinInternet: true });
        await cuandoVuelva(signal);
        o.onEstado?.({ subiendo: true });
      }
      const res = await enviar(url, metodo, cuerpo, (n) => o.onProgreso?.(listos + n), signal);
      if (res.status >= 200 && res.status < 300) return res;
      if (!reintentable(res.status)) throw new SubidaFallida("nas_rechazo", res.status);
      if (intento >= reintentos) throw new SubidaFallida("sin_red", res.status);
      o.onEstado?.({ reintento: intento + 1 });
      await esperar(ESPERAS[Math.min(intento, ESPERAS.length - 1)], signal);
    }
  };
  const reciboDe = (res: RespuestaHttp) => {
    const r = (res.cuerpo as { recibo?: unknown } | null)?.recibo;
    if (typeof r !== "string" || !r) throw new SubidaFallida("sin_recibo", res.status);
    return r;
  };

  if (plan.url) {
    const res = await conReintentos(plan.url, "PUT", archivo);
    o.onProgreso?.(archivo.size);
    return reciboDe(res);
  }
  const tam = plan.tamano_parte ?? 0;
  const partes = plan.partes ?? [];
  if (!tam || !partes.length || !plan.completar) throw new SubidaFallida("nas_rechazo");
  // Las partes van de a una: el teléfono sube por un solo caño, y así el
  // progreso es honesto y un corte se reintenta desde la parte que faltaba.
  for (let i = 0; i < partes.length; i++) {
    const trozo = archivo.slice(i * tam, Math.min(archivo.size, (i + 1) * tam));
    await conReintentos(partes[i], "PUT", trozo);
    listos += trozo.size;
    o.onProgreso?.(listos);
  }
  return reciboDe(await conReintentos(plan.completar, "POST", null));
}
