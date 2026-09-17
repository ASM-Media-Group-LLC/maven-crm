// OFICINA · de qué está hecho el historial de versiones.
//
// Vive aparte de `index.ts` y sin una sola llamada a Deno ni a la red para que
// se pueda probar: la derivación de abajo tiene una trampa que un test atrapa
// y una lectura distraída no.

export interface FilaDeVersion {
  /** El número de la versión cuyo ARCHIVO guarda esta fila. */
  version: number;
  storage_key: string;
  /** ⚠️ Quien hizo la versión SIGUIENTE. Ver el comentario grande de abajo. */
  saved_by: string | null;
  /** ⚠️ Cuándo nació la versión SIGUIENTE. Ídem. */
  created_at: string;
}

export interface DocumentoParaHistorial {
  id: string;
  owner_id: string;
  extension: string;
  /** La versión vigente. */
  version: number;
  storage_key: string | null;
  created_at: string;
}

export interface EntradaDeHistorial {
  version: number;
  /** La misma forma que usa el editor en vivo: `<id>-v<N>`. */
  key: string;
  /** ISO. Cuándo NACIÓ esta versión. */
  created: string;
  /** Quién la hizo. Null si no se puede saber. */
  autorId: string | null;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LA FILA DE `document_versions` HABLA DE DOS VERSIONES A LA VEZ
 *
 * La fila se escribe en el momento de un guardado, ANTES de mover el puntero:
 *
 *     insert into document_versions (version, storage_key, saved_by)
 *     values (doc.version, doc.storage_key, quien_guardó)   -- la que se va
 *     ...
 *     update documents set version = doc.version + 1        -- la que llega
 *
 * O sea que en la fila con `version = N`:
 *
 *     version / storage_key  →  describen la versión N        (la que se archiva)
 *     saved_by  / created_at →  describen la versión N + 1    (la que se crea)
 *
 * Leer `saved_by` como "quien hizo la versión N" corre el autor un lugar y le
 * atribuye a cada persona el trabajo de la anterior. Es el tipo de error que
 * nadie nota: los nombres son todos plausibles.
 *
 * Y NO sirve `documents.updated_at` para la versión vigente: esa columna se
 * toca también al renombrar o al cambiar quién lo ve, sin que suba la versión.
 * En prod hay un documento en v3 cuya fila v2 es de las 07:08 y cuyo
 * `updated_at` es de las 07:50 — no hubo una v4 a las 07:50, hubo un cambio de
 * visibilidad. La fecha buena es siempre la de la FILA.
 * ────────────────────────────────────────────────────────────────────────── */

/** Todas las versiones, de la más vieja a la más nueva. */
export function armarHistorial(
  doc: DocumentoParaHistorial,
  filas: FilaDeVersion[],
): EntradaDeHistorial[] {
  const porVersion = new Map(filas.map((f) => [f.version, f]));
  const salida: EntradaDeHistorial[] = [];

  for (let n = 1; n <= doc.version; n++) {
    // La v1 no tiene fila anterior: nació con el documento, y la hizo quien lo
    // creó. De la v2 en adelante, quien la hizo firmó la fila de la v(n-1).
    const anterior = n === 1 ? null : porVersion.get(n - 1);
    salida.push({
      version: n,
      key: `${doc.id}-v${n}`,
      created: n === 1 ? doc.created_at : (anterior?.created_at ?? doc.created_at),
      autorId: n === 1 ? doc.owner_id : (anterior?.saved_by ?? null),
    });
  }
  return salida;
}

/** La llave en R2 del archivo de una versión.
 *
 *  La versión vigente NO tiene fila —solo la tienen las ya reemplazadas—, así
 *  que sale del documento. */
export function archivoDeLaVersion(
  doc: DocumentoParaHistorial,
  filas: FilaDeVersion[],
  version: number,
): string | null {
  if (version === doc.version) return doc.storage_key;
  return filas.find((f) => f.version === version)?.storage_key ?? null;
}
