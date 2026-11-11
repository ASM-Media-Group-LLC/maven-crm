// Piezas PURAS del equipo que manda Backstage (POST /public-api/equipo/sync): leer el
// cuerpo y comparar la lista de Backstage con lo que Maven tiene, para decir qué
// cambiaría. Sin base, sin red y sin imports: el test lo verifica, igual que con
// escritura-formato.ts, porque recursos-como-usuario.ts importa valores de aquí.
//
// LAS REGLAS (decisión de Alvaro, 11/11/2026: Backstage manda sobre las personas, el
// rol, el equipo y a quién reporta cada una):
//   · Se busca a cada persona por su correo de trabajo, SOLO entre las de la agencia
//     de la llave (eso ya viene filtrado de la base: api_equipo_estado).
//   · Un admin o un dueño (protegido) no se toca nunca: se reporta en `protegidos`.
//   · activo = false → a la papelera (30 días, igual que «Eliminar» en la app).
//   · Quien no está en Maven NO se crea: va a `pendientes_de_crear`.
//   · Quien está en Maven y no vino en la lista NO se toca: va a
//     `no_vienen_en_backstage`. Faltar no es irse.
//   · Un rol que Maven no tiene no se inventa: va a `roles_desconocidos`.
//   · Nadie sube a un rol de admin ni a nivel admin/dueño por aquí.
//   · Más bajas que el freno en un solo envío: no se aplica ninguna.
//   · Un campo que no viene no se toca; un campo que viene en null se vacía (equipo,
//     jefe y horario; el rol y el nivel no se vacían).
//
// La base vuelve a validar cada cambio antes de aplicarlo (api_equipo_aplicar): lo
// de aquí decide qué pedir, no es la pared.

export type Json = string | number | boolean | null | Json[] | { [clave: string]: Json };

/** Tope de personas por envío. El cuerpo ya topa en 64 KB (unas 250 personas). */
export const TOPE_PERSONAS = 1000;
/** Los niveles que Backstage puede poner. admin y dueño solo se ponen a mano en Maven. */
export const NIVELES_PERMITIDOS = ["manager", "supervisor", "agente"] as const;
const NIVELES_DE_ADMIN = new Set(["admin", "dueno", "owner"]);
const LARGO_MAX_TEXTO = 100;
const LARGO_MAX_EQUIPO = 80;
const LARGO_MAX_CORREO = 254;

export type Campo = "rol" | "nivel" | "equipo" | "reporta_a" | "hora_entrada" | "hora_salida" | "papelera";

export type MotivoDeRechazo =
  | "no_es_un_objeto"
  | "campo_desconocido"
  | "correo_invalido"
  | "correo_repetido"
  | "tipo_invalido"
  | "texto_muy_largo"
  | "nivel_invalido"
  | "nivel_de_admin"
  | "rol_de_admin"
  | "hora_invalida"
  | "jefe_no_esta_en_maven"
  | "jefe_es_la_misma_persona"
  | "jefe_en_papelera"
  | "freno_de_bajas";

/** Algo de un envío que no se aplica, con el porqué. `indice` es la posición en
 *  `personas` (null cuando el motivo es de la base o de todo el envío). */
export type Rechazado = {
  indice: number | null;
  correo: string | null;
  campo: string;
  motivo: MotivoDeRechazo | string;
  valor?: Json;
};

export type PersonaDeBackstage = {
  indice: number;
  correo: string;
  nombre: string | null;
  activo: boolean;
  rol?: string;
  nivel?: (typeof NIVELES_PERMITIDOS)[number];
  equipo?: string | null;
  reporta_a?: string | null;
  hora_entrada?: string | null;
  hora_salida?: string | null;
};

export type PedidoDeSync = {
  personas: PersonaDeBackstage[];
  ensayo: boolean;
  recibidas: number;
  /** Correos que vinieron más de una vez: no se tocan, pero cuentan como «vinieron». */
  repetidos: string[];
  rechazados: Rechazado[];
};

export type ProblemaDelEquipo =
  | { tipo: "sin_cuerpo" }
  | { tipo: "campo_desconocido"; campos: string[] }
  | { tipo: "campo_invalido"; campo: "ensayo" }
  | { tipo: "personas_invalidas" };

const CAMPOS_DEL_CUERPO = ["personas", "ensayo"];
const CAMPOS_DE_PERSONA = ["correo", "nombre", "rol", "equipo", "reporta_a", "nivel", "activo", "hora_entrada", "hora_salida"];
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HORA = /^([01]?[0-9]|2[0-3]):([0-5][0-9])(?::([0-5][0-9]))?$/;

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Para mostrar lo que llegó en un rechazo sin devolver un texto enorme. */
function valorCorto(v: unknown): Json {
  if (v === null || typeof v === "boolean" || typeof v === "number") return v as Json;
  if (typeof v === "string") return v.length > 120 ? v.slice(0, 120) + "…" : v;
  return Array.isArray(v) ? "[lista]" : typeof v === "object" ? "{objeto}" : String(v);
}

/** Minúsculas, sin acentos y con un solo espacio: para comparar nombres de roles y niveles. */
export function clave(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");
}

/** Un correo de trabajo, en minúsculas; null si no tiene forma de correo. */
export function normalizarCorreo(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const c = v.trim().toLowerCase();
  if (!c || c.length > LARGO_MAX_CORREO || !CORREO.test(c)) return null;
  return c;
}

/** "9:00", "09:00" o "09:00:00" → "09:00:00". null si no es una hora de 24 h. */
export function normalizarHora(v: string): string | null {
  const m = v.trim().match(HORA);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}`;
}

/** Lee y valida el cuerpo de POST /equipo/sync. Lo que está mal en TODO el envío es
 *  un problema (400); lo que está mal en una persona va a `rechazados` y el resto de
 *  esa persona (y las demás) sigue. */
export function leerSync(cuerpo: unknown): { ok: true; pedido: PedidoDeSync } | { ok: false; problema: ProblemaDelEquipo } {
  if (!esObjeto(cuerpo)) return { ok: false, problema: { tipo: "sin_cuerpo" } };
  const extra = Object.keys(cuerpo).filter((k) => !CAMPOS_DEL_CUERPO.includes(k)).sort();
  if (extra.length) return { ok: false, problema: { tipo: "campo_desconocido", campos: extra } };
  const ensayo = cuerpo.ensayo ?? false;
  if (typeof ensayo !== "boolean") return { ok: false, problema: { tipo: "campo_invalido", campo: "ensayo" } };
  const lista = cuerpo.personas;
  if (!Array.isArray(lista) || lista.length === 0 || lista.length > TOPE_PERSONAS) {
    return { ok: false, problema: { tipo: "personas_invalidas" } };
  }

  const rechazados: Rechazado[] = [];
  const leidas: PersonaDeBackstage[] = [];
  lista.forEach((item, indice) => {
    const p = leerPersona(item, indice, rechazados);
    if (p) leidas.push(p);
  });

  // Un correo repetido es ambiguo (¿cuál de las dos manda?): no se toca a nadie con él.
  const veces = new Map<string, number>();
  for (const p of leidas) veces.set(p.correo, (veces.get(p.correo) ?? 0) + 1);
  const repetidos = [...veces].filter(([, n]) => n > 1).map(([c]) => c).sort();
  for (const c of repetidos) rechazados.push({ indice: null, correo: c, campo: "correo", motivo: "correo_repetido" });
  const personas = leidas.filter((p) => veces.get(p.correo) === 1);

  return { ok: true, pedido: { personas, ensayo, recibidas: lista.length, repetidos, rechazados } };
}

function leerPersona(item: unknown, indice: number, rechazados: Rechazado[]): PersonaDeBackstage | null {
  if (!esObjeto(item)) {
    rechazados.push({ indice, correo: null, campo: "persona", motivo: "no_es_un_objeto" });
    return null;
  }
  const correo = normalizarCorreo(item.correo);
  if (!correo) {
    rechazados.push({ indice, correo: null, campo: "correo", motivo: "correo_invalido", valor: valorCorto(item.correo) });
    return null;
  }
  const mal = (campo: string, motivo: MotivoDeRechazo, valor: unknown) =>
    rechazados.push({ indice, correo, campo, motivo, valor: valorCorto(valor) });

  for (const k of Object.keys(item).filter((k) => !CAMPOS_DE_PERSONA.includes(k)).sort()) {
    rechazados.push({ indice, correo, campo: k, motivo: "campo_desconocido" });
  }

  const p: PersonaDeBackstage = { indice, correo, nombre: null, activo: true };

  if (item.nombre !== undefined && item.nombre !== null) {
    if (typeof item.nombre !== "string") mal("nombre", "tipo_invalido", item.nombre);
    else p.nombre = item.nombre.trim().slice(0, 200) || null;
  }

  // activo: si no viene, la persona sigue activa. Uno que no es true/false NO manda a
  // nadie a la papelera.
  if (item.activo !== undefined) {
    if (typeof item.activo !== "boolean") mal("activo", "tipo_invalido", item.activo);
    else p.activo = item.activo;
  }

  if (item.rol !== undefined) {
    if (typeof item.rol !== "string" || !item.rol.trim()) mal("rol", "tipo_invalido", item.rol);
    else if (item.rol.length > LARGO_MAX_TEXTO) mal("rol", "texto_muy_largo", item.rol);
    else p.rol = item.rol.trim();
  }

  if (item.nivel !== undefined) {
    const n = typeof item.nivel === "string" ? clave(item.nivel) : null;
    if (n !== null && (NIVELES_PERMITIDOS as readonly string[]).includes(n)) p.nivel = n as PersonaDeBackstage["nivel"];
    else if (n !== null && NIVELES_DE_ADMIN.has(n)) mal("nivel", "nivel_de_admin", item.nivel);
    else mal("nivel", "nivel_invalido", item.nivel);
  }

  if (item.equipo !== undefined) {
    if (item.equipo === null || (typeof item.equipo === "string" && !item.equipo.trim())) p.equipo = null;
    else if (typeof item.equipo !== "string") mal("equipo", "tipo_invalido", item.equipo);
    else if (item.equipo.trim().length > LARGO_MAX_EQUIPO) mal("equipo", "texto_muy_largo", item.equipo);
    else p.equipo = item.equipo.trim().replace(/\s+/g, " ");
  }

  if (item.reporta_a !== undefined) {
    if (item.reporta_a === null || (typeof item.reporta_a === "string" && !item.reporta_a.trim())) p.reporta_a = null;
    else {
      const jefe = normalizarCorreo(item.reporta_a);
      if (jefe) p.reporta_a = jefe;
      else mal("reporta_a", "correo_invalido", item.reporta_a);
    }
  }

  for (const campo of ["hora_entrada", "hora_salida"] as const) {
    const v = item[campo];
    if (v === undefined) continue;
    if (v === null || (typeof v === "string" && !v.trim())) p[campo] = null;
    else {
      const h = typeof v === "string" ? normalizarHora(v) : null;
      if (h) p[campo] = h;
      else mal(campo, "hora_invalida", v);
    }
  }

  return p;
}

// ─── Lo que Maven tiene hoy (api_equipo_estado) ──────────────────────────────

export type RolDeMaven = { nombre: string; es_admin: boolean };

export type PersonaDeMaven = {
  id: string;
  correo: string | null;
  nombre: string | null;
  rol: string | null;
  nivel: string | null;
  hora_entrada: string | null;
  hora_salida: string | null;
  equipo: string | null;
  reporta_a: string | null;
  en_papelera: boolean;
  protegido: boolean;
};

export type EstadoDeMaven = {
  aplicar: boolean;
  max_bajas: number;
  mapa_roles: Record<string, string>;
  roles: RolDeMaven[];
  personas: PersonaDeMaven[];
};

const textoONulo = (v: unknown): v is string | null => v === null || typeof v === "string";

/** Lo que devuelve api_equipo_estado; null si llegó con otra forma (un contrato roto
 *  entre la base y la edge: 503, nunca «no hay nadie»). */
export function leerEstado(v: unknown): EstadoDeMaven | null {
  if (!esObjeto(v)) return null;
  if (typeof v.aplicar !== "boolean" || typeof v.max_bajas !== "number" || !esObjeto(v.mapa_roles)) return null;
  if (!Array.isArray(v.roles) || !Array.isArray(v.personas)) return null;
  const roles: RolDeMaven[] = [];
  for (const r of v.roles) {
    if (!esObjeto(r) || typeof r.nombre !== "string" || typeof r.es_admin !== "boolean") return null;
    roles.push({ nombre: r.nombre, es_admin: r.es_admin });
  }
  const personas: PersonaDeMaven[] = [];
  for (const p of v.personas) {
    if (!esObjeto(p) || typeof p.id !== "string") return null;
    if (![p.correo, p.nombre, p.rol, p.nivel, p.hora_entrada, p.hora_salida, p.equipo, p.reporta_a].every(textoONulo)) return null;
    if (typeof p.en_papelera !== "boolean" || typeof p.protegido !== "boolean") return null;
    personas.push({
      id: p.id,
      correo: p.correo === null ? null : (p.correo as string).toLowerCase(),
      nombre: p.nombre as string | null,
      rol: p.rol as string | null,
      nivel: p.nivel as string | null,
      hora_entrada: p.hora_entrada === null ? null : normalizarHora(p.hora_entrada as string) ?? (p.hora_entrada as string),
      hora_salida: p.hora_salida === null ? null : normalizarHora(p.hora_salida as string) ?? (p.hora_salida as string),
      equipo: p.equipo as string | null,
      reporta_a: p.reporta_a as string | null,
      en_papelera: p.en_papelera,
      protegido: p.protegido,
    });
  }
  const mapa: Record<string, string> = {};
  for (const [k, val] of Object.entries(v.mapa_roles)) if (typeof val === "string") mapa[k] = val;
  return { aplicar: v.aplicar, max_bajas: v.max_bajas, mapa_roles: mapa, roles, personas };
}

/** El rol de Maven que corresponde a un nombre de Backstage: primero el mapa de la
 *  agencia (integracion_equipo.mapa_roles), después el nombre exacto, después el mismo
 *  nombre sin mayúsculas ni acentos. Si no hay uno solo, no se adivina. */
export function resolverRol(nombre: string, estado: Pick<EstadoDeMaven, "mapa_roles" | "roles">): RolDeMaven | null {
  const k = clave(nombre);
  for (const [desde, hacia] of Object.entries(estado.mapa_roles)) {
    if (clave(desde) === k) return estado.roles.find((r) => r.nombre === hacia) ?? null;
  }
  const exacto = estado.roles.find((r) => r.nombre === nombre.trim());
  if (exacto) return exacto;
  const parecidos = estado.roles.filter((r) => clave(r.nombre) === k);
  return parecidos.length === 1 ? parecidos[0] : null;
}

// ─── La comparación ──────────────────────────────────────────────────────────

/** Un cambio, como lo ve Backstage (antes y después legibles: el jefe por su correo). */
export type Cambio = {
  user_id: string;
  correo: string;
  nombre: string | null;
  campo: Campo;
  antes: string | null;
  despues: string | null;
};

/** Lo que se le pide a la base: el valor que se guarda (el jefe por su id). */
export type CambioParaLaBase = { user_id: string; campo: Campo; valor: string | null };

export type Resumen = {
  recibidas: number;
  cambios: Cambio[];
  pendientes_de_crear: { correo: string; nombre: string | null; rol: string | null; equipo: string | null }[];
  roles_desconocidos: { rol: string; correos: string[] }[];
  protegidos: { user_id: string; correo: string; nombre: string | null; motivo: "admin_o_dueno" }[];
  no_vienen_en_backstage: { user_id: string; correo: string | null; nombre: string | null; rol: string | null }[];
  en_papelera: { user_id: string; correo: string; nombre: string | null }[];
  rechazados: Rechazado[];
  freno_de_bajas: { bajas_pedidas: number; tope: number } | null;
};

/** Orden por código, sin depender del idioma del servidor: dos envíos iguales tienen
 *  que dar exactamente el mismo resumen (la huella de la bitácora). */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const porCorreo = <T extends { correo: string | null }>(a: T, b: T) => cmp(a.correo ?? "", b.correo ?? "");
const ORDEN_DE_CAMPO: Campo[] = ["rol", "nivel", "equipo", "reporta_a", "hora_entrada", "hora_salida", "papelera"];

/** Compara la lista de Backstage con Maven. Puro: no decide si se aplica (eso lo dice
 *  la base, con el interruptor) y devuelve todo ordenado, para que dos envíos iguales
 *  den el mismo resumen (la bitácora los cuenta como repetición). */
export function calcularCambios(estado: EstadoDeMaven, pedido: PedidoDeSync): { resumen: Resumen; paraLaBase: CambioParaLaBase[] } {
  const maven = new Map<string, PersonaDeMaven>();
  for (const p of estado.personas) if (p.correo) maven.set(p.correo, p);
  const correoDeId = new Map(estado.personas.map((p) => [p.id, p.correo]));

  const cambios: (Cambio & { valor: string | null })[] = [];
  const pendientes: Resumen["pendientes_de_crear"] = [];
  const desconocidos = new Map<string, { rol: string; correos: Set<string> }>();
  const protegidos: Resumen["protegidos"] = [];
  const enPapelera: Resumen["en_papelera"] = [];
  const rechazados: Rechazado[] = [...pedido.rechazados];
  const vinieron = new Set<string>(pedido.repetidos);

  for (const b of pedido.personas) {
    vinieron.add(b.correo);
    const m = maven.get(b.correo);
    if (!m) {
      // Una persona inactiva que Maven no tiene: no hay nada que hacer.
      if (b.activo) pendientes.push({ correo: b.correo, nombre: b.nombre, rol: b.rol ?? null, equipo: b.equipo ?? null });
      continue;
    }
    if (m.protegido) {
      protegidos.push({ user_id: m.id, correo: b.correo, nombre: m.nombre, motivo: "admin_o_dueno" });
      continue;
    }
    if (m.en_papelera) {
      // Volver de la papelera lo hace una persona en Maven (Papelera → Restaurar).
      if (b.activo) enPapelera.push({ user_id: m.id, correo: b.correo, nombre: m.nombre });
      continue;
    }
    const cambio = (campo: Campo, antes: string | null, despues: string | null, valor: string | null) =>
      cambios.push({ user_id: m.id, correo: b.correo, nombre: m.nombre, campo, antes, despues, valor });

    if (!b.activo) {
      // Se va: lo demás de esta persona ya no importa.
      cambio("papelera", null, "papelera", null);
      continue;
    }

    if (b.rol !== undefined) {
      const r = resolverRol(b.rol, estado);
      if (!r) {
        // Agrupados sin mayúsculas ni acentos: «Closer» y «closer» son el mismo rol que falta.
        const k = clave(b.rol);
        const g = desconocidos.get(k) ?? { rol: b.rol, correos: new Set<string>() };
        if (b.rol < g.rol) g.rol = b.rol;
        g.correos.add(b.correo);
        desconocidos.set(k, g);
      } else if (r.es_admin) {
        rechazados.push({ indice: b.indice, correo: b.correo, campo: "rol", motivo: "rol_de_admin", valor: b.rol });
      } else if (r.nombre !== m.rol) {
        cambio("rol", m.rol, r.nombre, r.nombre);
      }
    }

    if (b.nivel !== undefined && b.nivel !== m.nivel) cambio("nivel", m.nivel, b.nivel, b.nivel);

    if (b.equipo !== undefined && b.equipo !== m.equipo) cambio("equipo", m.equipo, b.equipo, b.equipo);

    if (b.reporta_a !== undefined) {
      const antes = m.reporta_a === null ? null : correoDeId.get(m.reporta_a) ?? m.reporta_a;
      if (b.reporta_a === null) {
        if (m.reporta_a !== null) cambio("reporta_a", antes, null, null);
      } else {
        const jefe = maven.get(b.reporta_a);
        if (!jefe) {
          rechazados.push({ indice: b.indice, correo: b.correo, campo: "reporta_a", motivo: "jefe_no_esta_en_maven", valor: b.reporta_a });
        } else if (jefe.id === m.id) {
          rechazados.push({ indice: b.indice, correo: b.correo, campo: "reporta_a", motivo: "jefe_es_la_misma_persona", valor: b.reporta_a });
        } else if (jefe.en_papelera) {
          rechazados.push({ indice: b.indice, correo: b.correo, campo: "reporta_a", motivo: "jefe_en_papelera", valor: b.reporta_a });
        } else if (jefe.id !== m.reporta_a) {
          cambio("reporta_a", antes, b.reporta_a, jefe.id);
        }
      }
    }

    for (const campo of ["hora_entrada", "hora_salida"] as const) {
      const v = b[campo];
      if (v !== undefined && v !== m[campo]) cambio(campo, m[campo], v, v);
    }
  }

  // El freno: más bajas que el tope en un solo envío no se aplica ninguna. Mejor diez
  // envíos que un equipo vaciado por un error de Backstage.
  const bajas = cambios.filter((c) => c.campo === "papelera");
  let freno: Resumen["freno_de_bajas"] = null;
  let quedan = cambios;
  if (bajas.length > estado.max_bajas) {
    freno = { bajas_pedidas: bajas.length, tope: estado.max_bajas };
    quedan = cambios.filter((c) => c.campo !== "papelera");
    for (const c of bajas) {
      rechazados.push({ indice: null, correo: c.correo, campo: "papelera", motivo: "freno_de_bajas" });
    }
  }

  quedan.sort((a, b) => porCorreo(a, b) || ORDEN_DE_CAMPO.indexOf(a.campo) - ORDEN_DE_CAMPO.indexOf(b.campo));

  const noVienen = estado.personas
    .filter((p) => !p.protegido && !p.en_papelera && !(p.correo && vinieron.has(p.correo)))
    .map((p) => ({ user_id: p.id, correo: p.correo, nombre: p.nombre, rol: p.rol }))
    .sort((a, b) => porCorreo(a, b) || cmp(a.user_id, b.user_id));

  rechazados.sort((a, b) =>
    cmp(a.correo ?? "", b.correo ?? "") || (a.indice ?? -1) - (b.indice ?? -1) ||
    cmp(a.campo, b.campo) || cmp(String(a.motivo), String(b.motivo))
  );

  return {
    resumen: {
      recibidas: pedido.recibidas,
      cambios: quedan.map(({ valor: _valor, ...c }) => c),
      pendientes_de_crear: pendientes.sort(porCorreo),
      roles_desconocidos: [...desconocidos]
        .sort(([a], [b]) => cmp(a, b))
        .map(([, g]) => ({ rol: g.rol, correos: [...g.correos].sort() })),
      protegidos: protegidos.sort(porCorreo),
      no_vienen_en_backstage: noVienen,
      en_papelera: enPapelera.sort(porCorreo),
      rechazados,
      freno_de_bajas: freno,
    },
    paraLaBase: quedan.map((c) => ({ user_id: c.user_id, campo: c.campo, valor: c.valor })),
  };
}

// ─── Lo que contesta la base (api_equipo_aplicar) y la respuesta ─────────────

export type ResultadoDeLaBase = {
  ensayo: boolean;
  aplicar: boolean;
  sync_id: string;
  aplicados: { user_id: string; campo: string }[];
  rechazados: { user_id: string | null; campo: string | null; motivo: string }[];
};

/** null si la base devolvió otra forma (un contrato roto: 503). */
export function leerResultadoDeLaBase(v: unknown): ResultadoDeLaBase | null {
  if (!esObjeto(v)) return null;
  if (typeof v.ensayo !== "boolean" || typeof v.aplicar !== "boolean" || typeof v.sync_id !== "string") return null;
  if (!Array.isArray(v.aplicados) || !Array.isArray(v.rechazados)) return null;
  const aplicados: ResultadoDeLaBase["aplicados"] = [];
  for (const a of v.aplicados) {
    if (!esObjeto(a) || typeof a.user_id !== "string" || typeof a.campo !== "string") return null;
    aplicados.push({ user_id: a.user_id, campo: a.campo });
  }
  const rechazados: ResultadoDeLaBase["rechazados"] = [];
  for (const r of v.rechazados) {
    if (!esObjeto(r) || typeof r.motivo !== "string" || !textoONulo(r.user_id ?? null) || !textoONulo(r.campo ?? null)) return null;
    rechazados.push({ user_id: (r.user_id as string | null) ?? null, campo: (r.campo as string | null) ?? null, motivo: r.motivo });
  }
  return { ensayo: v.ensayo, aplicar: v.aplicar, sync_id: v.sync_id, aplicados, rechazados };
}

/** La respuesta a Backstage: el resumen, con cada cambio marcado como aplicado o no, y
 *  lo que la base rechazó sumado a `rechazados`. */
export function armarRespuesta(resumen: Resumen, base: ResultadoDeLaBase) {
  const hecho = new Set(base.aplicados.map((a) => `${a.user_id}|${a.campo}`));
  const correoDe = new Map(resumen.cambios.map((c) => [c.user_id, c.correo]));
  const deLaBase: Rechazado[] = base.rechazados.map((r) => ({
    indice: null,
    correo: r.user_id ? correoDe.get(r.user_id) ?? null : null,
    campo: r.campo ?? "",
    motivo: r.motivo,
  }));
  const rechazadoPorLaBase = new Set(base.rechazados.map((r) => `${r.user_id}|${r.campo}`));
  return {
    object: "equipo_sync",
    ensayo: base.ensayo,
    aplicar_activado: base.aplicar,
    sync_id: base.sync_id,
    recibidas: resumen.recibidas,
    cambios: resumen.cambios.map((c) => ({
      ...c,
      aplicado: !base.ensayo && hecho.has(`${c.user_id}|${c.campo}`),
      // En ensayo: si la base lo habría aplicado al prender el interruptor.
      se_aplicaria: !rechazadoPorLaBase.has(`${c.user_id}|${c.campo}`),
    })),
    pendientes_de_crear: resumen.pendientes_de_crear,
    roles_desconocidos: resumen.roles_desconocidos,
    protegidos: resumen.protegidos,
    no_vienen_en_backstage: resumen.no_vienen_en_backstage,
    en_papelera: resumen.en_papelera,
    rechazados: [...resumen.rechazados, ...deLaBase],
    freno_de_bajas: resumen.freno_de_bajas,
  };
}
