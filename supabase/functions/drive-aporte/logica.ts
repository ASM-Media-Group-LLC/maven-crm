// Lo que decide la carpeta de la creadora por link (Alvaro, 10/11/2026), sin
// red ni base: qué deja hacer cada tipo de link, cómo se llama la carpeta del
// día y en qué orden se muestra lo de adentro. La edge (index.ts) lo usa; el
// banco (logica.test.ts) lo prueba.

/** La subcarpeta donde el equipo le deja cosas a la creadora. */
export const NOMBRE_DEL_EQUIPO = "Del equipo";

export type TipoDeLink = "subir" | "personal" | "invitado" | "ver";

export interface Permisos {
  /** Puede subir archivos (a la carpeta del día). */
  subir: boolean;
  /** Puede ver, abrir y bajar lo de la carpeta. */
  ver: boolean;
  /** Puede sacar links para otros (invitado / ver) y cerrarlos. */
  compartir: boolean;
}

/** Lo que deja cada link. Un tipo desconocido no deja nada. */
export function permisosDe(tipo: string | null | undefined): Permisos {
  switch (tipo) {
    case "personal": return { subir: true, ver: true, compartir: true };
    case "subir":
    case "invitado": return { subir: true, ver: false, compartir: false };
    case "ver": return { subir: false, ver: true, compartir: false };
    default: return { subir: false, ver: false, compartir: false };
  }
}

/** Los únicos links que la creadora puede sacar desde su página. */
export function esTipoParaCompartir(tipo: unknown): tipo is "invitado" | "ver" {
  return tipo === "invitado" || tipo === "ver";
}

/** «2026-11-10»: la carpeta del día, con la fecha de Colombia (la del equipo).
 *  Así se ordena sola y todo lo de una tanda cae junto. */
export function nombreDelDia(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
}

const ES_DIA = /^\d{4}-\d{2}-\d{2}$/;

export interface Hijo {
  id: string;
  nombre: string;
  tipo: string;
  mime: string | null;
  size: number | null;
  estado: string;
  created_at: string;
  hijos: number | null;
}

export interface HijoParaMostrar extends Hijo {
  /** Es la carpeta «Del equipo» (va arriba y se resalta). */
  del_equipo: boolean;
}

/** Arriba «Del equipo»; después los días, el más nuevo primero; después las
 *  otras carpetas (lo que venía de antes) por nombre; y al final los archivos,
 *  lo último que entró primero. */
export function ordenarHijos(hijos: Hijo[]): HijoParaMostrar[] {
  const rango = (h: Hijo) => {
    if (h.tipo !== "carpeta") return 3;
    if (h.nombre.trim().toLowerCase() === NOMBRE_DEL_EQUIPO.toLowerCase()) return 0;
    return ES_DIA.test(h.nombre.trim()) ? 1 : 2;
  };
  return [...hijos]
    .sort((a, b) => {
      const ra = rango(a);
      const rb = rango(b);
      if (ra !== rb) return ra - rb;
      if (ra === 1) return b.nombre.localeCompare(a.nombre);
      if (ra === 2) return a.nombre.localeCompare(b.nombre, "es", { numeric: true, sensitivity: "base" });
      return b.created_at.localeCompare(a.created_at);
    })
    .map((h) => ({ ...h, size: h.size == null ? null : Number(h.size), hijos: h.hijos == null ? null : Number(h.hijos), del_equipo: rango(h) === 0 }));
}

/** El nombre que la creadora le pone a un link para otro (p. ej. «Fotógrafo
 *  Juan»): corto y sin espacios de sobra. */
export function nombreDeLink(n: unknown): string | null {
  const s = typeof n === "string" ? n.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  return s || null;
}
