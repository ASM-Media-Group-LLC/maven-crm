// Las reglas de la edge `drive` que no dependen de la red ni de la base:
// separadas para poder probarlas sin levantar el servidor.

/** Tope por archivo. Por partes de 32 MB, son 640 partes. */
export const MAX_ARCHIVO = 20 * 1024 * 1024 * 1024;
/** Cada parte es UN pedido HTTP, y tiene que entrar en la ventana del proxy:
 *  el Traefik de Dokploy (la puerta al NAS, 28/09) corta a los ~60 s. 32 MB a
 *  5 Mbps de subida son 51 s. Tiene que ser menor que MAX_POR_PEDIDO del NAS
 *  (95 MB). */
export const TAMANO_PARTE = 32 * 1024 * 1024;

export class HttpError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** Nombre de archivo sano: sin barras (serían carpetas), sin caracteres de
 *  control, y con largo razonable. Lo mismo exige la base. */
export function nombreValido(n: unknown): string {
  const s = typeof n === "string" ? n.trim() : "";
  if (!s || s.length > 255 || /[/\\\u0000-\u001f]/.test(s)) throw new HttpError("Nombre de archivo inválido");
  return s;
}

export function planDeSubida(size: number) {
  if (!Number.isFinite(size) || size <= 0) throw new HttpError("El archivo está vacío");
  if (size > MAX_ARCHIVO) throw new HttpError("El archivo pasa el tope de 20 GB");
  return size <= TAMANO_PARTE ? { partes: 0 } : { partes: Math.ceil(size / TAMANO_PARTE) };
}


// ── El índice diario ────────────────────────────────────────────────────────
// En el disco los archivos no tienen nombre ni carpeta (<agencia>/<id>): el
// árbol vive solo en la base. Sin copia de seguridad (decisión de Jhon), si se
// perdiera la base los archivos seguirían ahí pero nadie sabría cuál es cuál.
// El índice que la mini guarda cada noche en el mismo NAS es esa llave.

export interface FilaDeIndice {
  agencia_id: string;
  agencia: string;
  ruta: string;
  tipo: string;
  nombre: string;
  dueno: string;
  correo_dueno: string;
  tamano: number | null;
  sha256: string;
  estado: string;
  en_papelera: boolean;
  /** Dónde está en el disco: /Volumes/NASx/maven-drive/<esto>. */
  archivo_en_disco: string;
  creado: string;
  modificado: string;
  abierto_por_ultima_vez: string;
}

export interface ItemParaIndice {
  id: string;
  tenant_id: string;
  owner_id: string | null;
  parent_id: string | null;
  tipo: string;
  nombre: string;
  size: number | null;
  sha256: string | null;
  storage_key: string | null;
  estado: string;
  trashed_at: string | null;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
}

/** Arma las filas del índice con la ruta legible de cada cosa
 *  («Contabilidad/2026/Balance.pdf»). Una madre que no está (no debería
 *  pasar) se marca como «(sin carpeta)» en vez de cortar la ruta en silencio;
 *  un ciclo (lo impide un trigger) no cuelga el armado. */
export function armarIndice(
  items: ItemParaIndice[],
  agencias: Map<string, string>,
  nombres: Map<string, string>,
  correos: Map<string, string>,
): FilaDeIndice[] {
  const porId = new Map(items.map((i) => [i.id, i]));
  const rutas = new Map<string, string>();
  const rutaDe = (i: ItemParaIndice): string => {
    const hecha = rutas.get(i.id);
    if (hecha !== undefined) return hecha;
    const partes: string[] = [];
    const vistos = new Set<string>();
    let actual: ItemParaIndice | undefined = i;
    while (actual && !vistos.has(actual.id) && partes.length < 60) {
      vistos.add(actual.id);
      partes.unshift(actual.nombre);
      if (!actual.parent_id) break;
      const madre = porId.get(actual.parent_id);
      if (!madre) { partes.unshift("(sin carpeta)"); break; }
      actual = madre;
    }
    const r = partes.join("/");
    rutas.set(i.id, r);
    return r;
  };
  return items
    .map((i) => ({
      agencia_id: i.tenant_id,
      agencia: agencias.get(i.tenant_id) ?? "",
      ruta: rutaDe(i),
      tipo: i.tipo,
      nombre: i.nombre,
      dueno: (i.owner_id && nombres.get(i.owner_id)) || "",
      correo_dueno: (i.owner_id && correos.get(i.owner_id)) || "",
      tamano: i.size,
      sha256: i.sha256 ?? "",
      estado: i.estado,
      en_papelera: !!i.trashed_at,
      archivo_en_disco: i.storage_key ?? "",
      creado: i.created_at,
      modificado: i.updated_at,
      abierto_por_ultima_vez: i.last_opened_at ?? "",
    }))
    .sort((a, b) => a.agencia_id.localeCompare(b.agencia_id) || a.ruta.localeCompare(b.ruta, "es"));
}

// ── Cupo y lugar ────────────────────────────────────────────────────────────

const GB = 1024 * 1024 * 1024;
export const legible = (b: number) =>
  b >= GB ? `${(b / GB).toFixed(b >= 10 * GB ? 0 : 1)} GB` : `${Math.max(1, Math.round(b / (1024 * 1024)))} MB`;

/** ¿Le alcanza el cupo? Cuenta la papelera y lo que se está subiendo (ya
 *  ocupan o reservaron su lugar en el NAS). */
export function chequearCupo(usado: number, cupo: number, size: number) {
  if (usado + size > cupo) {
    throw new HttpError(
      `No te alcanza el espacio: usas ${legible(usado)} de ${legible(cupo)} y este archivo pesa ${legible(size)}. ` +
        "Vacía la papelera o pídele a un admin más espacio.",
      413,
    );
  }
}

/** Lo mismo que exige el NAS (MARGEN_LIBRE de infra/nas-drive/server.mjs): el
 *  archivo tiene que entrar en ALGÚN disco dejando 5% libre. Por partes, dos
 *  veces el archivo (partes + archivo final conviven al juntarlas). */
export function hayLugarEnElNas(raices: { ok: boolean; libre?: number; total?: number }[], size: number, porPartes: boolean) {
  const necesita = porPartes ? size * 2 : size;
  return raices.some((r) => r.ok && typeof r.libre === "number" && typeof r.total === "number" && r.libre - necesita >= r.total * 0.05);
}
