// creadora-accesos — la lógica, sin red ni Deno.serve, para probarla con dobles
// (logica.test.ts). index.ts le pasa los puertos de verdad. La base:
// migrations/20261008120000_creadora_accesos.sql.
//
// Los accesos de OnlyFans de cada creadora (Jhon, 08/10/2026): correo, usuario,
// contraseña y si tiene doble verificación. Lo que antes llegaba por el
// Formulario de accesos de Google.
//
// QUIÉN PUEDE QUÉ
//   Equipo: SOLO admin, todo (Jhon, 08/10: «esta parte de accesos de OnlyFans,
//   solo admin»; antes el resto del equipo veía usuario y correo enmascarado).
//   Y además tiene que VER a la creadora (la RLS de creators con su JWT).
//     ver            — correo, usuario, doble verificación y si hay contraseña.
//     ver_clave      — la contraseña. Queda anotado (ver o copiar), con quién y cuándo.
//     guardar        — los cambia.
//     importar_*     — la carga desde la hoja de la Oficina.
//   La creadora (cuenta de creadora atada a ESA ficha, es_mi_ficha):
//     mis_accesos    — lo suyo, sin la contraseña (solo si está y desde cuándo).
//     guardar_mios   — los llena o los cambia. Puede poner una contraseña nueva,
//                      no borrarla ni leerla.
//
// La contraseña viaja en claro SOLO dentro de la edge: se cifra antes de la base
// (ACCESOS_CRED_KEY) y se abre únicamente para ver_clave.

export const ACCIONES = ["ver", "ver_clave", "guardar", "mis_accesos", "guardar_mios", "importar_previa", "importar"] as const;
export type Accion = typeof ACCIONES[number];

export interface Sellado { cipher: string; nonce: string; keyVersion: number }

export interface Fila {
  creator_id: string;
  of_correo: string | null;
  of_usuario: string | null;
  of_clave_cifrada: string | null;
  of_clave_nonce: string | null;
  of_clave_version: number | null;
  doble_verificacion: boolean | null;
  clave_cambiada_en: string | null;
  actualizado_en: string | null;
  actualizado_desde: "equipo" | "creadora" | "importador" | null;
}

/** Lo que se escribe (null = borrar el dato). */
export interface Columnas {
  of_correo?: string | null;
  of_usuario?: string | null;
  of_clave_cifrada?: string | null;
  of_clave_nonce?: string | null;
  of_clave_version?: number | null;
  doble_verificacion?: boolean | null;
}

export type Desde = "equipo" | "creadora" | "importador";
export type AccionEvento = "guardar" | "importar" | "ver_clave" | "copiar_clave";

export interface Evento { accion: AccionEvento; desde: Desde; campos: string[]; en: string; quien: string | null }

export interface CreadoraParaEmparejar {
  id: string;
  nombre: string;
  nombre_artistico: string | null;
  correo: string | null;
  correo_portal: string | null;
  instagram: string | null;
  usuarios_of: string[];
}

export interface Puertos {
  /** La cuenta del token, o null si no es una sesión válida. */
  persona(token: string): Promise<{ id: string; esCreadora: boolean } | null>;
  /** ¿La RLS de creators (con el JWT de quien llama) le devuelve esa creadora? */
  veCreadora(token: string, creatorId: string): Promise<boolean>;
  esAdmin(userId: string): Promise<boolean>;
  esMiFicha(userId: string, creatorId: string): Promise<boolean>;
  leer(creatorId: string): Promise<Fila | null>;
  escribir(creatorId: string, cambios: Columnas, quien: string, desde: Desde): Promise<void>;
  anotar(e: { creator_id: string; user_id: string; accion: AccionEvento; desde: Desde; campos: string[] }): Promise<void>;
  ultimosEventos(creatorId: string, cuantos: number): Promise<Evento[]>;
  cifrar(texto: string): Promise<Sellado | null>;
  descifrar(s: Sellado): Promise<string | null>;
  // El importador:
  /** El documento de la Oficina, leído con el JWT de quien llama (si no lo ve, null). */
  documento(token: string, id: string): Promise<{ storage_key: string; extension: string | null; title: string } | null>;
  bajar(storageKey: string): Promise<Uint8Array>;
  /** Las hojas del libro, cada una como filas de celdas en texto. */
  hojas(bytes: Uint8Array): string[][][];
  /** Los ids de las creadoras que ve quien llama (RLS). */
  creadorasVisibles(token: string): Promise<string[]>;
  datosParaEmparejar(ids: string[]): Promise<CreadoraParaEmparejar[]>;
  leerVarias(ids: string[]): Promise<Fila[]>;
}

export interface Respuesta { status: number; body: Record<string, unknown> }
const r = (status: number, body: Record<string, unknown>): Respuesta => ({ status, body });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const TOPE_CLAVE = 500;
export const TOPE_FILAS = 2000;

// ─── Mostrar ────────────────────────────────────────────────────────────────

/** «s•••@gmail.com», como mask_email de la base (lo que ve en la ficha quien no es admin). */
function paraElEquipo(f: Fila | null) {
  if (!f) return null;
  return {
    of_correo: f.of_correo,
    of_usuario: f.of_usuario,
    doble_verificacion: f.doble_verificacion,
    tiene_clave: !!f.of_clave_cifrada,
    clave_cambiada_en: f.clave_cambiada_en,
    actualizado_en: f.actualizado_en,
    actualizado_desde: f.actualizado_desde,
  };
}

function paraElla(f: Fila | null) {
  return {
    of_correo: f?.of_correo ?? null,
    of_usuario: f?.of_usuario ?? null,
    doble_verificacion: f?.doble_verificacion ?? null,
    tiene_clave: !!f?.of_clave_cifrada,
    clave_cambiada_en: f?.clave_cambiada_en ?? null,
  };
}

// ─── Lo que se puede escribir ───────────────────────────────────────────────

export interface CambiosPedidos {
  of_correo?: string | null;
  of_usuario?: string | null;
  /** Texto: la contraseña nueva. null: borrarla (solo el equipo). */
  clave?: string | null;
  doble_verificacion?: boolean | null;
}

const limpio = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim() : v);

/** Valida lo que llega del navegador. Devuelve los cambios o el código de error. */
export function validarCambios(raw: unknown, puedeBorrarClave: boolean): { cambios: CambiosPedidos } | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "cambios_invalidos" };
  const o = raw as Record<string, unknown>;
  const permitidas = new Set(["of_correo", "of_usuario", "clave", "doble_verificacion"]);
  if (Object.keys(o).some((k) => !permitidas.has(k))) return { error: "campo_desconocido" };
  const c: CambiosPedidos = {};
  if ("of_correo" in o) {
    const v = limpio(o.of_correo);
    if (v === null || v === "") c.of_correo = null;
    else if (typeof v !== "string" || v.length > 320 || !CORREO.test(v)) return { error: "correo_invalido" };
    else c.of_correo = v.toLowerCase();
  }
  if ("of_usuario" in o) {
    const v = limpio(o.of_usuario);
    if (v === null || v === "") c.of_usuario = null;
    else if (typeof v !== "string" || v.length > 200) return { error: "usuario_invalido" };
    else c.of_usuario = v.replace(/^@/, "");
  }
  if ("clave" in o) {
    // La contraseña NO se recorta: un espacio puede ser parte de ella.
    const v = o.clave;
    if (v === null) {
      if (!puedeBorrarClave) return { error: "no_puede_borrar_clave" };
      c.clave = null;
    } else if (typeof v !== "string" || v.length === 0 || v.length > TOPE_CLAVE || /[\u0000-\u001f\u007f]/.test(v)) {
      return { error: "clave_invalida" };
    } else c.clave = v;
  }
  if ("doble_verificacion" in o) {
    const v = o.doble_verificacion;
    if (v !== null && typeof v !== "boolean") return { error: "doble_invalida" };
    c.doble_verificacion = v as boolean | null;
  }
  if (!Object.keys(c).length) return { error: "sin_cambios" };
  return { cambios: c };
}

/** Pasa los cambios pedidos a columnas, cifrando la contraseña. */
async function aColumnas(c: CambiosPedidos, p: Puertos): Promise<{ columnas: Columnas; campos: string[] } | { error: string }> {
  const columnas: Columnas = {};
  const campos: string[] = [];
  if ("of_correo" in c) { columnas.of_correo = c.of_correo ?? null; campos.push("of_correo"); }
  if ("of_usuario" in c) { columnas.of_usuario = c.of_usuario ?? null; campos.push("of_usuario"); }
  if ("doble_verificacion" in c) { columnas.doble_verificacion = c.doble_verificacion ?? null; campos.push("doble_verificacion"); }
  if ("clave" in c) {
    if (c.clave === null) {
      Object.assign(columnas, { of_clave_cifrada: null, of_clave_nonce: null, of_clave_version: null });
    } else {
      const s = await p.cifrar(c.clave!);
      if (!s) return { error: "sin_llave" };
      Object.assign(columnas, { of_clave_cifrada: s.cipher, of_clave_nonce: s.nonce, of_clave_version: s.keyVersion });
    }
    campos.push("clave");
  }
  return { columnas, campos };
}

// ─── La hoja: columnas, filas y emparejamiento ──────────────────────────────

export type Columna = "marca" | "correo" | "nombre" | "instagram" | "whatsapp" | "of_correo" | "of_usuario" | "of_clave" | "doble";

export const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9@._\s/-]/g, " ").replace(/\s+/g, " ").trim();

/** Qué columna es cada encabezado. Primero lo de OnlyFans: «Correo registrado
 *  en OnlyFans» no es el correo de contacto. */
export function columnaDe(encabezado: string): Columna | null {
  const h = normalizar(encabezado);
  if (!h) return null;
  if (/marca temporal|timestamp/.test(h)) return "marca";
  if (/contrasena|clave|password/.test(h)) return "of_clave";
  if (/onlyfans|\bof\b/.test(h) && /correo|email|mail/.test(h)) return "of_correo";
  if (/onlyfans|\bof\b/.test(h) && /usuario|user/.test(h)) return "of_usuario";
  if (/doble|2fa|verificacion|dos pasos/.test(h)) return "doble";
  if (/instagram/.test(h)) return "instagram";
  if (/whatsapp|celular|telefono/.test(h)) return "whatsapp";
  if (/nombre/.test(h)) return "nombre";
  if (/correo|email/.test(h)) return "correo";
  return null;
}

export interface FilaDeHoja {
  fila: number; // 1-based, como la ve la persona en la hoja
  valores: Partial<Record<Columna, string>>;
}

/** Busca el encabezado (en las primeras 10 filas, la que reconoce más columnas,
 *  y al menos 3 incluida la contraseña o el usuario) y devuelve las filas con
 *  algo. Toma la primera hoja del libro que lo tenga. */
export function leerHoja(hojas: string[][][]): { columnas: Partial<Record<Columna, number>>; filas: FilaDeHoja[] } | null {
  for (const matriz of hojas) {
    let mejor: { i: number; columnas: Partial<Record<Columna, number>> } | null = null;
    for (let i = 0; i < Math.min(10, matriz.length); i++) {
      const columnas: Partial<Record<Columna, number>> = {};
      (matriz[i] ?? []).forEach((celda, j) => {
        const c = columnaDe(String(celda ?? ""));
        if (c && columnas[c] === undefined) columnas[c] = j;
      });
      const n = Object.keys(columnas).length;
      if (n >= 3 && (columnas.of_clave !== undefined || columnas.of_usuario !== undefined) && (!mejor || n > Object.keys(mejor.columnas).length)) {
        mejor = { i, columnas };
      }
    }
    if (!mejor) continue;
    const filas: FilaDeHoja[] = [];
    for (let i = mejor.i + 1; i < matriz.length && filas.length < TOPE_FILAS; i++) {
      const valores: Partial<Record<Columna, string>> = {};
      for (const [c, j] of Object.entries(mejor.columnas) as [Columna, number][]) {
        const v = String(matriz[i]?.[j] ?? "");
        const t = c === "of_clave" ? v : v.trim();
        if (t.trim()) valores[c] = t;
      }
      if (Object.keys(valores).some((c) => c !== "marca")) filas.push({ fila: i + 1, valores });
    }
    return { columnas: mejor.columnas, filas };
  }
  return null;
}

/** «Sí», «si», «yes», «x», «true» → true; «no», «false» → false; lo demás, no se sabe. */
export function siONo(v: string | undefined): boolean | null {
  if (!v) return null;
  const t = normalizar(v);
  if (/^(si|s|yes|y|x|true|verdadero|activa|activada|1)$/.test(t)) return true;
  if (/^(no|n|false|falso|0|desactivada|ninguna)$/.test(t)) return false;
  return null;
}

const handle = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().trim()
    .replace(/^https?:\/\/(www\.)?(instagram\.com|onlyfans\.com)\//, "")
    .replace(/^@/, "").replace(/[/?#].*$/, "").trim();

/** Con qué creadora va cada fila. Se prueba en orden: el usuario de OnlyFans,
 *  el correo (el de la ficha o el del portal), el Instagram y el nombre; vale
 *  solo si UNA creadora coincide. */
export function emparejar(fila: FilaDeHoja, creadoras: CreadoraParaEmparejar[]): { id: string; como: string } | null {
  const v = fila.valores;
  const unica = (lista: CreadoraParaEmparejar[]) => (lista.length === 1 ? lista[0].id : null);
  const pruebas: [string, () => CreadoraParaEmparejar[]][] = [
    ["usuario_of", () => (v.of_usuario ? creadoras.filter((c) => c.usuarios_of.some((u) => handle(u) === handle(v.of_usuario))) : [])],
    ["correo", () => {
      const correos = [v.correo, v.of_correo].filter(Boolean).map((x) => x!.toLowerCase().trim());
      return correos.length ? creadoras.filter((c) => [c.correo, c.correo_portal].some((x) => x && correos.includes(x.toLowerCase().trim()))) : [];
    }],
    ["instagram", () => (v.instagram ? creadoras.filter((c) => c.instagram && handle(c.instagram) === handle(v.instagram)) : [])],
    ["nombre", () => {
      const n = v.nombre ? normalizar(v.nombre) : "";
      return n ? creadoras.filter((c) => normalizar(c.nombre) === n || (c.nombre_artistico && normalizar(c.nombre_artistico) === n)) : [];
    }],
  ];
  for (const [como, buscar] of pruebas) {
    const id = unica(buscar());
    if (id) return { id, como };
  }
  return null;
}

/** La marca temporal de Google Forms («6/10/2026 14:28:01» o ISO), en ms; si no se
 *  entiende, el orden de la fila. */
function cuando(f: FilaDeHoja): number {
  const m = f.valores.marca;
  if (m) {
    const d = m.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (d) return Date.UTC(+d[3], +d[2] - 1, +d[1], +(d[4] ?? 0), +(d[5] ?? 0), +(d[6] ?? 0));
    const t = Date.parse(m);
    if (!Number.isNaN(t)) return t;
  }
  return f.fila;
}

// ─── Manejar un pedido ──────────────────────────────────────────────────────

export async function manejar(token: string | null, raw: unknown, p: Puertos): Promise<Respuesta> {
  if (!token) return r(401, { error: "sin_sesion" });
  const yo = await p.persona(token);
  if (!yo) return r(401, { error: "sin_sesion" });
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const accion = body.accion as Accion;
  if (!ACCIONES.includes(accion)) return r(400, { error: "accion_desconocida" });

  // ── La creadora, sobre su propia ficha ──
  if (accion === "mis_accesos" || accion === "guardar_mios") {
    const creatorId = String(body.creator_id ?? "");
    if (!yo.esCreadora || !UUID.test(creatorId) || !(await p.esMiFicha(yo.id, creatorId))) return r(403, { error: "no_es_tuya" });
    if (accion === "mis_accesos") return r(200, { accesos: paraElla(await p.leer(creatorId)) });
    const v = validarCambios(body.cambios, false);
    if ("error" in v) return r(400, { error: v.error });
    const c = await aColumnas(v.cambios, p);
    if ("error" in c) return r(503, { error: c.error });
    await p.escribir(creatorId, c.columnas, yo.id, "creadora");
    await p.anotar({ creator_id: creatorId, user_id: yo.id, accion: "guardar", desde: "creadora", campos: c.campos });
    return r(200, { accesos: paraElla(await p.leer(creatorId)) });
  }

  // ── El equipo: solo admin ──
  if (yo.esCreadora) return r(403, { error: "solo_equipo" });
  if (!(await p.esAdmin(yo.id))) return r(403, { error: "solo_admin" });

  if (accion === "importar_previa" || accion === "importar") {
    return await importar(token, yo.id, accion, body, p);
  }

  const creatorId = String(body.creator_id ?? "");
  if (!UUID.test(creatorId)) return r(400, { error: "creadora_invalida" });
  if (!(await p.veCreadora(token, creatorId))) return r(404, { error: "no_existe" });

  if (accion === "ver") {
    const fila = await p.leer(creatorId);
    return r(200, { accesos: paraElEquipo(fila), eventos: await p.ultimosEventos(creatorId, 10) });
  }

  if (accion === "ver_clave") {
    const fila = await p.leer(creatorId);
    if (!fila?.of_clave_cifrada || !fila.of_clave_nonce || !fila.of_clave_version) return r(404, { error: "sin_clave" });
    const clave = await p.descifrar({ cipher: fila.of_clave_cifrada, nonce: fila.of_clave_nonce, keyVersion: fila.of_clave_version });
    if (clave === null) return r(503, { error: "no_se_pudo_abrir" });
    await p.anotar({ creator_id: creatorId, user_id: yo.id, accion: body.para === "copiar" ? "copiar_clave" : "ver_clave", desde: "equipo", campos: [] });
    return r(200, { clave });
  }

  // guardar
  const v = validarCambios(body.cambios, true);
  if ("error" in v) return r(400, { error: v.error });
  const c = await aColumnas(v.cambios, p);
  if ("error" in c) return r(503, { error: c.error });
  await p.escribir(creatorId, c.columnas, yo.id, "equipo");
  await p.anotar({ creator_id: creatorId, user_id: yo.id, accion: "guardar", desde: "equipo", campos: c.campos });
  return r(200, { accesos: paraElEquipo(await p.leer(creatorId)) });
}

async function importar(token: string, yo: string, accion: "importar_previa" | "importar", body: Record<string, unknown>, p: Puertos): Promise<Respuesta> {
  const docId = String(body.documento_id ?? "");
  if (!UUID.test(docId)) return r(400, { error: "documento_invalido" });
  const doc = await p.documento(token, docId);
  if (!doc) return r(404, { error: "documento_no_existe" });
  if ((doc.extension ?? "").toLowerCase() !== "xlsx") return r(400, { error: "no_es_hoja" });
  const hoja = leerHoja(p.hojas(await p.bajar(doc.storage_key)));
  if (!hoja) return r(422, { error: "sin_columnas" });

  const visibles = await p.creadorasVisibles(token);
  const creadoras = await p.datosParaEmparejar(visibles);
  const nombres = new Map(creadoras.map((c) => [c.id, c.nombre_artistico || c.nombre]));

  if (accion === "importar_previa") {
    const ya = new Map((await p.leerVarias(visibles)).map((f) => [f.creator_id, f]));
    const filas = hoja.filas.map((f) => {
      const m = emparejar(f, creadoras);
      return { fila: f, m };
    });
    // Si varias filas van a la misma creadora (respondió el formulario dos veces),
    // vale la más nueva; las otras se marcan.
    const ganadora = new Map<string, FilaDeHoja>();
    for (const { fila, m } of filas) {
      if (!m) continue;
      const otra = ganadora.get(m.id);
      if (!otra || cuando(fila) >= cuando(otra)) ganadora.set(m.id, fila);
    }
    return r(200, {
      documento: doc.title,
      columnas: Object.keys(hoja.columnas),
      filas: filas.map(({ fila, m }) => {
        const f = m ? ya.get(m.id) : undefined;
        return {
          fila: fila.fila,
          // Para reconocerla: nombre e Instagram. NUNCA correo, usuario ni contraseña.
          nombre: fila.valores.nombre ?? null,
          instagram: fila.valores.instagram ?? null,
          creator_id: m?.id ?? null,
          creadora: m ? nombres.get(m.id) ?? null : null,
          como: m?.como ?? null,
          repetida: !!m && ganadora.get(m.id) !== fila,
          trae: {
            of_correo: !!fila.valores.of_correo,
            of_usuario: !!fila.valores.of_usuario,
            clave: !!fila.valores.of_clave,
            doble: siONo(fila.valores.doble) !== null,
          },
          ya_tiene: {
            of_correo: !!f?.of_correo,
            of_usuario: !!f?.of_usuario,
            clave: !!f?.of_clave_cifrada,
            doble: f?.doble_verificacion !== null && f?.doble_verificacion !== undefined,
          },
        };
      }),
      creadoras: creadoras.map((c) => ({ id: c.id, nombre: c.nombre_artistico || c.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    });
  }

  // importar: las asignaciones que confirmó el admin (fila → creadora).
  if (!Array.isArray(body.asignaciones) || body.asignaciones.length > TOPE_FILAS) return r(400, { error: "asignaciones_invalidas" });
  const pisar = body.pisar === true;
  const porFila = new Map(hoja.filas.map((f) => [f.fila, f]));
  const visiblesSet = new Set(visibles);
  const elegidas = new Map<string, FilaDeHoja>();
  for (const a of body.asignaciones as { fila?: unknown; creator_id?: unknown }[]) {
    const fila = porFila.get(Number(a?.fila));
    const id = String(a?.creator_id ?? "");
    if (!fila || !UUID.test(id) || !visiblesSet.has(id)) return r(400, { error: "asignacion_invalida", fila: a?.fila ?? null });
    const otra = elegidas.get(id);
    if (!otra || cuando(fila) >= cuando(otra)) elegidas.set(id, fila);
  }

  const ya = new Map((await p.leerVarias([...elegidas.keys()])).map((f) => [f.creator_id, f]));
  let guardadas = 0, sinCambios = 0;
  const conteo: Record<string, number> = { of_correo: 0, of_usuario: 0, clave: 0, doble_verificacion: 0 };
  for (const [id, fila] of elegidas) {
    const antes = ya.get(id);
    const pedido: Record<string, unknown> = {};
    const v = fila.valores;
    // Sin «pisar», solo lo que la creadora todavía no tiene: lo que ella cambió
    // desde su portal es más nuevo que el formulario.
    if (v.of_correo && (pisar || !antes?.of_correo) && CORREO.test(v.of_correo.trim())) pedido.of_correo = v.of_correo;
    if (v.of_usuario && (pisar || !antes?.of_usuario)) pedido.of_usuario = v.of_usuario;
    if (v.of_clave && (pisar || !antes?.of_clave_cifrada)) pedido.clave = v.of_clave;
    const doble = siONo(v.doble);
    if (doble !== null && (pisar || antes?.doble_verificacion === null || antes?.doble_verificacion === undefined)) pedido.doble_verificacion = doble;
    if (!Object.keys(pedido).length) { sinCambios++; continue; }
    const val = validarCambios(pedido, false);
    if ("error" in val) { sinCambios++; continue; }
    const c = await aColumnas(val.cambios, p);
    if ("error" in c) return r(503, { error: c.error });
    await p.escribir(id, c.columnas, yo, "importador");
    await p.anotar({ creator_id: id, user_id: yo, accion: "importar", desde: "importador", campos: c.campos });
    for (const k of c.campos) conteo[k] = (conteo[k] ?? 0) + 1;
    guardadas++;
  }
  return r(200, { guardadas, sin_cambios: sinCambios, campos: conteo });
}
