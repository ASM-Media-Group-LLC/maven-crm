import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorDelZip, mandarAlNas, pedirZip } from "@/hooks/useDriveVarios";
import {
  bajarDelNas, comoBajar, destinoEnMemoria, nombreDelPermiso, tamanoEstimado, type DestinoDelZip,
} from "@/lib/drive/descargaZip";

// Drive: el panel de DESCARGAS de varios archivos en un .zip, con el avance y
// «Cancelar» (el porqué de cada camino está en lib/drive/descargaZip.ts).

export type EstadoDescarga =
  /** La edge está juntando lo elegido (y lo de adentro de las carpetas). */
  | "preparando"
  /** Bajando: `recibido` de `total`. */
  | "bajando"
  /** Es grande: falta un clic para elegir dónde guardarlo (el navegador solo
   *  deja abrir «Guardar como» justo después de un clic). */
  | "elegir"
  | "lista"
  | "cancelada"
  | "error"
  /** Muy grande para la memoria y sin a dónde mandarlo directo: lo baja el
   *  navegador (su barra de descargas muestra el avance). */
  | "navegador";

export interface DescargaZip {
  clave: string;
  nombre: string;
  archivos: number;
  /** Bytes esperados: los del NAS (Content-Length) o una estimación. */
  total: number;
  totalExacto: boolean;
  recibido: number;
  estado: EstadoDescarga;
  /** Qué falló (el texto del NAS o del navegador). */
  error?: string;
}

export const EN_CURSO: readonly EstadoDescarga[] = ["preparando", "bajando", "elegir"];
/** El error de cuando el navegador bajaba por su cuenta y el NAS contestó una
 *  página de error (el panel lo dice con su texto). */
export const ERROR_DEL_NAS = "nas";

/** Lo que hace falta de la File System Access API (Chrome y Edge). */
interface ArchivoAbierto {
  write(datos: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}
interface ArchivoElegido {
  createWritable(): Promise<ArchivoAbierto>;
  remove?: () => Promise<void>;
}
type GuardarComo = (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<ArchivoElegido>;
function guardarComo(): GuardarComo | null {
  const f = (window as unknown as { showSaveFilePicker?: GuardarComo }).showSaveFilePicker;
  return typeof f === "function" ? f.bind(window) : null;
}

const esCancelacion = (e: unknown) => (e as { name?: string } | null)?.name === "AbortError";

/** Un .zip ya armado en memoria se descarga con su nombre, sin salir de la página. */
function descargarBlob(zip: Blob, nombre: string) {
  const url = URL.createObjectURL(zip);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // El navegador ya tomó la descarga: la memoria se suelta en un rato.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** «Guardar como» y el archivo abierto para escribir, como destino del .zip. */
async function abrirEnDisco(guardar: GuardarComo, nombre: string): Promise<DestinoDelZip> {
  const elegido = await guardar({ suggestedName: nombre, types: [{ description: "ZIP", accept: { "application/zip": [".zip"] } }] });
  const archivo = await elegido.createWritable();
  return {
    escribir: (p) => archivo.write(p),
    terminar: () => archivo.close(),
    descartar: async () => {
      await archivo.abort().catch(() => {});
      // «Guardar como» ya dejó un archivo vacío: se borra si el navegador deja.
      await elegido.remove?.().catch(() => {});
    },
  };
}

export function useDescargasZip() {
  const [descargas, setDescargas] = useState<DescargaZip[]>([]);
  // Por descarga: cómo cortarla y, si espera el clic de «Elegir dónde
  // guardarlo», cómo seguir.
  const vivas = useRef(new Map<string, { corte: AbortController; seguir?: () => void }>());
  const cambiar = useCallback((clave: string, c: Partial<DescargaZip>) =>
    setDescargas((d) => d.map((x) => (x.clave === clave ? { ...x, ...c } : x))), []);

  // Cerrar la pestaña corta lo que se está bajando: el navegador pregunta antes.
  const hayEnCurso = descargas.some((d) => EN_CURSO.includes(d.estado));
  useEffect(() => {
    if (!hayEnCurso) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [hayEnCurso]);

  /** Pide el .zip de lo elegido y lo baja con avance. Si la edge no lo deja
   *  armar (demasiados, muy grande, nada listo), devuelve ese error para que
   *  la página lo diga con su texto; si no, null. */
  const bajar = useCallback(async (ids: readonly string[]): Promise<ErrorDelZip | null> => {
    const clave = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const corte = new AbortController();
    vivas.current.set(clave, { corte });
    setDescargas((d) => [{ clave, nombre: "", archivos: 0, total: 0, totalExacto: false, recibido: 0, estado: "preparando" }, ...d]);
    const terminar = (c: Partial<DescargaZip>) => { vivas.current.delete(clave); cambiar(clave, c); };
    const fallo = (e: unknown) => terminar(esCancelacion(e) || corte.signal.aborted
      ? { estado: "cancelada" }
      : { estado: "error", error: (e as Error)?.message ?? String(e) });

    let permiso;
    try {
      permiso = await pedirZip(ids);
    } catch (e) {
      vivas.current.delete(clave);
      setDescargas((d) => d.filter((x) => x.clave !== clave));
      return e instanceof ErrorDelZip ? e : new ErrorDelZip((e as Error)?.message ?? String(e));
    }
    if (corte.signal.aborted) { terminar({ estado: "cancelada" }); return null; }

    const nombre = nombreDelPermiso(permiso.t);
    const estimado = tamanoEstimado(permiso.bytes, permiso.archivos);
    cambiar(clave, { nombre, archivos: permiso.archivos, total: estimado });
    const disco = guardarComo();
    const como = comoBajar(estimado, !!disco);

    if (como === "navegador") {
      mandarAlNas(permiso.url, permiso.t, () => cambiar(clave, { estado: "error", error: ERROR_DEL_NAS }));
      terminar({ estado: "navegador" });
      return null;
    }

    let destino: DestinoDelZip | null = null;
    if (como === "disco" && disco) {
      try {
        destino = await abrirEnDisco(disco, nombre);
      } catch (e) {
        if (esCancelacion(e)) { terminar({ estado: "cancelada" }); return null; }
        // Sin un clic reciente el navegador no abre «Guardar como» (la edge
        // tardó): se espera el de «Elegir dónde guardarlo» en el panel.
        cambiar(clave, { estado: "elegir" });
        destino = await new Promise<DestinoDelZip | null>((listo) => {
          vivas.current.set(clave, {
            corte,
            seguir: () => { abrirEnDisco(disco, nombre).then(listo, (err) => { fallo(err); listo(null); }); },
          });
          corte.signal.addEventListener("abort", () => listo(null), { once: true });
        });
        if (!destino) {
          if (corte.signal.aborted) terminar({ estado: "cancelada" });
          return null;
        }
      }
    } else {
      destino = destinoEnMemoria((zip) => descargarBlob(zip, nombre));
    }

    cambiar(clave, { estado: "bajando" });
    let ultimo = 0;
    try {
      const recibido = await bajarDelNas({
        url: permiso.url,
        permiso: permiso.t,
        destino,
        senal: corte.signal,
        alSaberTotal: (total) => cambiar(clave, { total, totalExacto: true }),
        // La barra se dibuja de a ratos, no por cada pedazo de 64 KB.
        alAvanzar: (n) => {
          const ahora = performance.now();
          if (ahora - ultimo > 150) { ultimo = ahora; cambiar(clave, { recibido: n }); }
        },
      });
      terminar({ recibido, estado: "lista" });
    } catch (e) {
      fallo(e);
    }
    return null;
  }, [cambiar]);

  const cancelar = useCallback((clave: string) => vivas.current.get(clave)?.corte.abort(), []);
  const elegirDonde = useCallback((clave: string) => vivas.current.get(clave)?.seguir?.(), []);
  const limpiar = useCallback(() => setDescargas((d) => d.filter((x) => EN_CURSO.includes(x.estado))), []);

  return { descargas, bajar, cancelar, elegirDonde, limpiar };
}
