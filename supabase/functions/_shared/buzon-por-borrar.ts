// El buzón de Zoho de una cuenta dada de baja se borra AL PURGARLA, a los 30
// días, y no al suspenderla.
//
// POR QUÉ (decisión de Jhon, 05/10/2026): «eliminar» en Maven suspende; la
// cuenta queda 30 días en la papelera y se puede recuperar. Pero el buzón se
// borraba en el momento de la suspensión, y eso es irreversible: recuperar a
// alguien a los dos días le devolvía la cuenta SIN su correo. Ahora el buzón
// sigue vivo mientras la cuenta esté en la papelera y se borra recién cuando
// la cuenta se purga.
//
// CÓMO: la purga (la manual de admin-user-actions y la automática del cron
// app_purgar_cuentas_vencidas) anota el buzón en la cola `buzones_por_borrar`
// ANTES de destruir nada —app_purge_user_refs se lleva mail_credentials, que
// es de donde sale la dirección—. Después alguien que sí puede hablar con
// Zoho procesa la cola:
//   · la purga manual, en el acto, su propia fila;
//   · la edge `buzones-por-borrar`, que despierta un cron todos los días,
//     todo lo pendiente (incluido lo que la manual no pudo).
// Las dos pasan por `procesarBuzon`, que es la única puerta al borrado.
//
// Antes de borrar se vuelve a mirar TODO, porque entre que se encola y que se
// procesa pueden pasar días: que la cuenta no se haya recuperado, que pasaron
// los 30 días, que nadie más use esa dirección, que no sea el Superadministrador
// de Zoho. Toda salida deja su motivo: un best-effort que no cuenta por qué no
// borró fue lo que escondió nueve bajas seguidas con la casilla viva.

import {
  deleteMailbox,
  esCasillaIntocable,
  listAccounts,
  type ZohoAccount,
  type ZohoResult,
  zohoConfigured,
} from "./zoho.ts";

/** Días que una cuenta eliminada queda recuperable, como en Google Workspace.
 *  El cron de la purga usa el mismo número (app_purgar_cuentas_vencidas(30, …)). */
export const DIAS_DE_PAPELERA = 30;

const DIA_MS = 86_400_000;

/** Fallos SEGUIDOS de Zoho antes de dejar de reintentar (queda `fallido`, para
 *  mirarlo a mano). Con el cron diario son diez días. Esperar el plazo no cuenta. */
export const TOPE_DE_INTENTOS = 10;

export type EstadoBuzon = "pendiente" | "borrado" | "no_se_borra" | "fallido";

/** Una fila de public.buzones_por_borrar. */
export interface BuzonEnCola {
  id: string;
  user_id: string;
  direccion: string;
  /** profiles.deleted_at cuando se encoló. */
  eliminada_el: string;
  /** eliminada_el + días de papelera. Es lo que mira el cron para despertar. */
  borrar_desde: string;
  intentos: number;
  estado: EstadoBuzon;
  motivo: string | null;
}

/** Lo que la base sabe de la cuenta y de la dirección en el momento de borrar
 *  (app_buzon_por_borrar_contexto). */
export interface ContextoDeLaCuenta {
  /** false = la cuenta ya se purgó: no se puede recuperar. */
  perfil_existe: boolean;
  /** null con el perfil vivo = la recuperaron. */
  deleted_at: string | null;
  /** Otra cuenta de Maven entra con esa dirección (se reusó). */
  otra_cuenta_con_esa_direccion: boolean;
  /** Otra cuenta de Maven tiene esa casilla vinculada y activa. */
  credencial_activa_de_otra: boolean;
}

export interface Decision {
  estado: "borrado" | "no_se_borra" | "pendiente";
  /** Por qué. Solo es null cuando se borró. */
  motivo: string | null;
  /** Pendiente porque todavía no toca (no es una falla, no gasta intentos). */
  esperar?: boolean;
}

/** Lo único de Zoho que hace falta. Inyectable para los tests. */
export interface Zoho {
  configurado(): boolean;
  listarCuentas(): Promise<ZohoResult<ZohoAccount[]>>;
  borrar(direccion: string): Promise<ZohoResult>;
}

export const zohoDeVerdad: Zoho = {
  configurado: zohoConfigured,
  listarCuentas: () => listAccounts(),
  borrar: deleteMailbox,
};

/** Desde cuándo se puede borrar el buzón de una cuenta eliminada en esa fecha. */
export function fechaDeBorrado(eliminadaEl: string | Date): Date {
  return new Date(new Date(eliminadaEl).getTime() + DIAS_DE_PAPELERA * DIA_MS);
}

const soloFecha = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Decide si se borra el buzón y, si corresponde, lo borra. No escribe nada en
 * la base: devuelve qué pasó y por qué. Nunca tira excepción.
 *
 * `contexto` null = no se pudo leer el estado de la cuenta: no se borra a
 * ciegas, se reintenta.
 */
export async function decidirYBorrar(
  entrada: Pick<BuzonEnCola, "direccion" | "eliminada_el" | "borrar_desde">,
  contexto: ContextoDeLaCuenta | null,
  zoho: Zoho,
  ahora: Date,
): Promise<Decision> {
  const direccion = entrada.direccion.trim();

  // 1. El Superadministrador de Zoho no se toca. Ni aunque todo lo demás diga que sí.
  if (esCasillaIntocable(direccion)) {
    return {
      estado: "no_se_borra",
      motivo: `${direccion} es el Superadministrador de Zoho: nunca se borra`,
    };
  }

  if (!contexto) {
    return { estado: "pendiente", motivo: "no se pudo leer el estado de la cuenta" };
  }

  // 2. La recuperaron: el buzón es suyo otra vez.
  if (contexto.perfil_existe && !contexto.deleted_at) {
    return { estado: "no_se_borra", motivo: "la cuenta se recuperó: el buzón no se toca" };
  }

  // 3. Que hayan pasado los 30 días. Si el perfil sigue (la purga falló, o la
  // cuenta se recuperó y se volvió a eliminar), manda la baja ACTUAL; si ya no
  // está, la que se anotó al encolar. Y nunca antes de lo que dice la cola.
  const baja = contexto.perfil_existe ? contexto.deleted_at! : entrada.eliminada_el;
  const desde = new Date(Math.max(fechaDeBorrado(baja).getTime(), new Date(entrada.borrar_desde).getTime()));
  if (Number.isNaN(desde.getTime())) {
    return { estado: "pendiente", motivo: "la fecha de baja no es válida" };
  }
  if (ahora.getTime() < desde.getTime()) {
    return {
      estado: "pendiente",
      motivo: `todavía no se cumplen los ${DIAS_DE_PAPELERA} días de papelera: se borra desde el ${soloFecha(desde)}`,
      esperar: true,
    };
  }

  // 4. Que la dirección no sea hoy de otra persona (se reusó después de la baja).
  if (contexto.otra_cuenta_con_esa_direccion) {
    return {
      estado: "no_se_borra",
      motivo: `${direccion} es ahora el acceso de otra cuenta de Maven`,
    };
  }
  if (contexto.credencial_activa_de_otra) {
    return {
      estado: "no_se_borra",
      motivo: `otra cuenta de Maven tiene ${direccion} vinculada como su casilla`,
    };
  }

  // 5. Zoho.
  if (!zoho.configurado()) {
    return { estado: "pendiente", motivo: "Zoho no está configurado en este entorno" };
  }
  try {
    // Confirmar que la dirección es una casilla REAL de la organización antes
    // de borrar por email. La lista viene paginada (listAccounts): con la
    // primera página sola, casi nunca la encontraba.
    const cuentas = await zoho.listarCuentas();
    if (!cuentas.ok) {
      return {
        estado: "pendiente",
        motivo: `no se pudo listar la organización: ${cuentas.error ?? "error desconocido"}`,
      };
    }
    const existe = (cuentas.data ?? []).some(
      (a) => (a.primaryEmailAddress ?? "").trim().toLowerCase() === direccion.toLowerCase(),
    );
    if (!existe) {
      return {
        estado: "no_se_borra",
        motivo: `${direccion} no figura entre las ${cuentas.data?.length ?? 0} casillas de la organización`,
      };
    }
    const del = await zoho.borrar(direccion);
    if (!del.ok) {
      return { estado: "pendiente", motivo: `Zoho rechazó el borrado: ${del.error ?? "error desconocido"}` };
    }
    return { estado: "borrado", motivo: null };
  } catch (e) {
    return { estado: "pendiente", motivo: `la baja de casilla explotó: ${(e as Error).message}` };
  }
}

/** Lo que hace falta de la base. Inyectable para los tests. */
export interface DatosBuzones {
  /** null si no se pudo leer. */
  contexto(userId: string, direccion: string): Promise<ContextoDeLaCuenta | null>;
  /** Pendientes con borrar_desde <= ahora, las más viejas primero. null si falló. */
  pendientes(ahora: Date, tope: number): Promise<BuzonEnCola[] | null>;
  uno(id: string): Promise<BuzonEnCola | null>;
  /** Deja el resultado en la cola y en el evento 'purgada' de cuenta_eventos.
   *  `cuenta` = false si fue una espera (plazo sin cumplir), no un intento fallido. */
  anotar(id: string, estado: EstadoBuzon, motivo: string | null, cuenta: boolean): Promise<boolean>;
}

export interface ResultadoBuzon {
  id: string;
  direccion: string;
  estado: EstadoBuzon;
  motivo: string | null;
}

/** Procesa UNA fila de la cola: decide, borra si corresponde y lo anota. */
export async function procesarBuzon(
  entrada: BuzonEnCola,
  datos: DatosBuzones,
  zoho: Zoho,
  ahora: Date,
): Promise<ResultadoBuzon> {
  // Ya resuelta (p. ej. una purga que encontró la fila borrada de antes): no se
  // vuelve a tocar. Solo lo pendiente pasa por Zoho.
  if (entrada.estado !== "pendiente") {
    return { id: entrada.id, direccion: entrada.direccion, estado: entrada.estado, motivo: entrada.motivo };
  }

  const contexto = await datos.contexto(entrada.user_id, entrada.direccion).catch(() => null);
  const d = await decidirYBorrar(entrada, contexto, zoho, ahora);

  let estado: EstadoBuzon = d.estado;
  if (d.estado === "pendiente" && !d.esperar && entrada.intentos + 1 >= TOPE_DE_INTENTOS) {
    estado = "fallido";
  }

  const anotado = await datos.anotar(entrada.id, estado, d.motivo, !d.esperar).catch(() => false);
  const linea = `[buzones-por-borrar] ${entrada.direccion}: ${estado}${d.motivo ? ` — ${d.motivo}` : ""}`;
  if (estado === "borrado" || d.esperar) console.log(linea);
  else if (estado === "no_se_borra") console.warn(linea);
  else console.error(linea);
  if (!anotado) {
    // El borrado (si lo hubo) ya pasó y es irreversible: que quede al menos en los logs.
    console.error(`[buzones-por-borrar] no pude anotar el resultado de ${entrada.id} (${entrada.direccion}: ${estado})`);
  }

  return { id: entrada.id, direccion: entrada.direccion, estado, motivo: d.motivo };
}

/** Una sola lista de la organización por corrida: son las mismas 70 casillas
 *  para todas las filas, y cada lista completa son varias llamadas a Zoho. */
function conUnaListaPorCorrida(zoho: Zoho): Zoho {
  let lista: Promise<ZohoResult<ZohoAccount[]>> | null = null;
  return {
    configurado: () => zoho.configurado(),
    listarCuentas: () => (lista ??= zoho.listarCuentas()),
    borrar: (d) => zoho.borrar(d),
  };
}

export interface ResumenCola {
  ok: boolean;
  error?: string;
  procesadas: number;
  resultados: ResultadoBuzon[];
}

/** Lo que hace el cron: todo lo pendiente cuyo plazo ya venció, de a `tope`. */
export async function procesarCola(
  datos: DatosBuzones,
  zoho: Zoho,
  ahora: Date,
  tope = 25,
): Promise<ResumenCola> {
  const lista = await datos.pendientes(ahora, tope).catch(() => null);
  if (!lista) return { ok: false, error: "no se pudo leer la cola", procesadas: 0, resultados: [] };

  const z = conUnaListaPorCorrida(zoho);
  const resultados: ResultadoBuzon[] = [];
  for (const entrada of lista) {
    resultados.push(await procesarBuzon(entrada, datos, z, ahora));
  }
  return { ok: true, procesadas: resultados.length, resultados };
}

// ─── La base de verdad ───────────────────────────────────────────────────────

const COLUMNAS = "id, user_id, direccion, eliminada_el, borrar_desde, intentos, estado, motivo";

/** DatosBuzones sobre supabase-js con service_role. */
// deno-lint-ignore no-explicit-any
export function datosDeSupabase(admin: any): DatosBuzones {
  return {
    async contexto(userId, direccion) {
      const { data, error } = await admin.rpc("app_buzon_por_borrar_contexto", {
        p_user_id: userId,
        p_direccion: direccion,
      });
      if (error || !data) {
        console.error("[buzones-por-borrar] contexto:", error?.message ?? "sin datos");
        return null;
      }
      return data as ContextoDeLaCuenta;
    },
    async pendientes(ahora, tope) {
      const { data, error } = await admin
        .from("buzones_por_borrar")
        .select(COLUMNAS)
        .eq("estado", "pendiente")
        .lte("borrar_desde", ahora.toISOString())
        .order("borrar_desde", { ascending: true })
        .limit(tope);
      if (error) {
        console.error("[buzones-por-borrar] no pude leer la cola:", error.message);
        return null;
      }
      return (data ?? []) as BuzonEnCola[];
    },
    async uno(id) {
      const { data, error } = await admin.from("buzones_por_borrar").select(COLUMNAS).eq("id", id).maybeSingle();
      if (error) console.error("[buzones-por-borrar] no pude leer la fila:", error.message);
      return (data ?? null) as BuzonEnCola | null;
    },
    async anotar(id, estado, motivo, cuenta) {
      const { error } = await admin.rpc("app_buzon_por_borrar_resultado", {
        p_id: id,
        p_estado: estado,
        p_motivo: motivo,
        p_cuenta: cuenta,
      });
      if (error) console.error("[buzones-por-borrar] no pude anotar:", error.message);
      return !error;
    },
  };
}
