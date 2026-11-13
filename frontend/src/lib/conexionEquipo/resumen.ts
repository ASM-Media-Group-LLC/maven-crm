import type { TranslationKey } from "@/lib/i18n";

// Lo que dejó cada envío de la plataforma de equipo (integracion_equipo_syncs), leído
// para la pantalla. La forma de `resumen` es la de supabase/functions/public-api/
// equipo-logica.ts (tipo Resumen); `aplicados` y `rechazados_base`, la de
// api_equipo_aplicar. Se lee con tolerancia: un arreglo que falta cuenta como vacío
// (una versión vieja o nueva del resumen no tumba la pantalla), pero la fila tiene
// que existir: un fallo de la consulta se dice como fallo, nunca como «nada».

export type CambioSync = {
  user_id: string;
  correo: string;
  nombre: string | null;
  campo: string;
  antes: string | null;
  despues: string | null;
};
export type RechazoSync = { correo: string | null; campo: string; motivo: string };
export type ResumenSync = {
  recibidas: number;
  cambios: CambioSync[];
  pendientes_de_crear: { correo: string; nombre: string | null; rol: string | null; equipo: string | null }[];
  roles_desconocidos: { rol: string; correos: string[] }[];
  protegidos: { correo: string; nombre: string | null }[];
  no_vienen_en_backstage: { correo: string | null; nombre: string | null; rol: string | null }[];
  en_papelera: { correo: string; nombre: string | null }[];
  rechazados: RechazoSync[];
  freno_de_bajas: { bajas_pedidas: number; tope: number } | null;
};
export type FilaSync = {
  id: string;
  created_at: string;
  ultima_vez?: string | null;
  repeticiones?: number | null;
  ensayo: boolean;
  recibidas: number;
  resumen: unknown;
  aplicados: unknown;
  rechazados_base: unknown;
};
export type Sync = {
  id: string;
  created_at: string;
  ultima_vez: string | null;
  repeticiones: number;
  ensayo: boolean;
  resumen: ResumenSync;
  /** Lo que la base aplicó (o, en ensayo, habría aplicado): user_id|campo. */
  aplicados: Set<string>;
  /** Lo rechazado por la edge y por la base, juntos y con el correo de cada uno. */
  rechazados: RechazoSync[];
};

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);
const numero = (v: unknown, otro = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : otro);

export function leerResumen(v: unknown): ResumenSync {
  const r = esObj(v) ? v : {};
  const freno = esObj(r.freno_de_bajas)
    ? { bajas_pedidas: numero(r.freno_de_bajas.bajas_pedidas), tope: numero(r.freno_de_bajas.tope) }
    : null;
  return {
    recibidas: numero(r.recibidas),
    cambios: lista(r.cambios).filter(esObj).map((c) => ({
      user_id: texto(c.user_id) ?? "",
      correo: texto(c.correo) ?? "",
      nombre: texto(c.nombre),
      campo: texto(c.campo) ?? "",
      antes: texto(c.antes),
      despues: texto(c.despues),
    })),
    pendientes_de_crear: lista(r.pendientes_de_crear).filter(esObj).map((p) => ({
      correo: texto(p.correo) ?? "", nombre: texto(p.nombre), rol: texto(p.rol), equipo: texto(p.equipo),
    })),
    roles_desconocidos: lista(r.roles_desconocidos).filter(esObj).map((g) => ({
      rol: texto(g.rol) ?? "", correos: lista(g.correos).filter((c): c is string => typeof c === "string"),
    })),
    protegidos: lista(r.protegidos).filter(esObj).map((p) => ({ correo: texto(p.correo) ?? "", nombre: texto(p.nombre) })),
    no_vienen_en_backstage: lista(r.no_vienen_en_backstage).filter(esObj).map((p) => ({
      correo: texto(p.correo), nombre: texto(p.nombre), rol: texto(p.rol),
    })),
    en_papelera: lista(r.en_papelera).filter(esObj).map((p) => ({ correo: texto(p.correo) ?? "", nombre: texto(p.nombre) })),
    rechazados: lista(r.rechazados).filter(esObj).map((x) => ({
      correo: texto(x.correo), campo: texto(x.campo) ?? "", motivo: texto(x.motivo) ?? "",
    })),
    freno_de_bajas: freno,
  };
}

/** Una fila de integracion_equipo_syncs, lista para dibujar. */
export function leerSync(f: FilaSync): Sync {
  const resumen = leerResumen(f.resumen);
  // La base contesta por user_id; la pantalla habla por correo (el que trajo el cambio).
  const correoDe = new Map(resumen.cambios.map((c) => [c.user_id, c.correo]));
  const deLaBase: RechazoSync[] = lista(f.rechazados_base).filter(esObj).map((x) => {
    const uid = texto(x.user_id);
    return { correo: uid ? correoDe.get(uid) ?? null : null, campo: texto(x.campo) ?? "", motivo: texto(x.motivo) ?? "" };
  });
  const aplicados = new Set(
    lista(f.aplicados).filter(esObj).map((a) => `${texto(a.user_id) ?? ""}|${texto(a.campo) ?? ""}`),
  );
  return {
    id: f.id,
    created_at: f.created_at,
    ultima_vez: f.ultima_vez ?? null,
    repeticiones: numero(f.repeticiones, 1),
    ensayo: f.ensayo,
    // La columna manda; el resumen la repite.
    resumen: { ...resumen, recibidas: numero(f.recibidas, resumen.recibidas) },
    aplicados,
    rechazados: [...resumen.rechazados, ...deLaBase],
  };
}

/** ¿Este cambio entró (o, en ensayo, entraría)? */
export const seAplica = (s: Sync, c: CambioSync) => s.aplicados.has(`${c.user_id}|${c.campo}`);

export type Conteos = {
  recibidas: number;
  cambios: number;
  aplicados: number;
  rechazados: number;
  pendientes: number;
  roles: number;
  protegidos: number;
};

export function conteosDe(s: Sync): Conteos {
  return {
    recibidas: s.resumen.recibidas,
    cambios: s.resumen.cambios.length,
    aplicados: s.resumen.cambios.filter((c) => seAplica(s, c)).length,
    rechazados: s.rechazados.length,
    pendientes: s.resumen.pendientes_de_crear.length,
    roles: s.resumen.roles_desconocidos.length,
    protegidos: s.resumen.protegidos.length,
  };
}

// ── Palabras ────────────────────────────────────────────────────────────────

const MOTIVOS: Record<string, TranslationKey> = {
  no_es_un_objeto: "conexionEquipo.motivo.no_es_un_objeto",
  campo_desconocido: "conexionEquipo.motivo.campo_desconocido",
  correo_invalido: "conexionEquipo.motivo.correo_invalido",
  correo_repetido: "conexionEquipo.motivo.correo_repetido",
  tipo_invalido: "conexionEquipo.motivo.tipo_invalido",
  texto_muy_largo: "conexionEquipo.motivo.texto_muy_largo",
  nivel_invalido: "conexionEquipo.motivo.nivel_invalido",
  nivel_de_admin: "conexionEquipo.motivo.nivel_de_admin",
  rol_de_admin: "conexionEquipo.motivo.rol_de_admin",
  hora_invalida: "conexionEquipo.motivo.hora_invalida",
  dia_desconocido: "conexionEquipo.motivo.dia_desconocido",
  entrada_igual_salida: "conexionEquipo.motivo.entrada_igual_salida",
  horario_invalido: "conexionEquipo.motivo.horario_invalido",
  jefe_no_esta_en_maven: "conexionEquipo.motivo.jefe_no_esta_en_maven",
  jefe_es_la_misma_persona: "conexionEquipo.motivo.jefe_es_la_misma_persona",
  jefe_en_papelera: "conexionEquipo.motivo.jefe_en_papelera",
  freno_de_bajas: "conexionEquipo.motivo.freno_de_bajas",
  user_id_invalido: "conexionEquipo.motivo.user_id_invalido",
  no_es_de_la_agencia: "conexionEquipo.motivo.no_es_de_la_agencia",
  protegido: "conexionEquipo.motivo.protegido",
  en_papelera: "conexionEquipo.motivo.en_papelera",
  valor_invalido: "conexionEquipo.motivo.valor_invalido",
  rol_desconocido: "conexionEquipo.motivo.rol_desconocido",
  nivel_no_permitido: "conexionEquipo.motivo.nivel_no_permitido",
  equipo_invalido: "conexionEquipo.motivo.equipo_invalido",
  jefe_invalido: "conexionEquipo.motivo.jefe_invalido",
  jefe_no_esta_en_la_agencia: "conexionEquipo.motivo.jefe_no_esta_en_la_agencia",
  error_de_base: "conexionEquipo.motivo.error_de_base",
};

const CAMPOS: Record<string, TranslationKey> = {
  rol: "conexionEquipo.campo.rol",
  nivel: "conexionEquipo.campo.nivel",
  equipo: "conexionEquipo.campo.equipo",
  reporta_a: "conexionEquipo.campo.reporta_a",
  hora_entrada: "conexionEquipo.campo.hora_entrada",
  hora_salida: "conexionEquipo.campo.hora_salida",
  horario_semana: "conexionEquipo.campo.horario_semana",
  papelera: "conexionEquipo.campo.papelera",
  persona: "conexionEquipo.campo.persona",
  correo: "conexionEquipo.campo.correo",
  nombre: "conexionEquipo.campo.nombre",
  activo: "conexionEquipo.campo.activo",
};

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** El porqué de un rechazo, en una frase. Uno que no se conoce va con su código:
 *  es corto, no trae datos, y esconderlo sería peor. */
export function textoDelMotivo(motivo: string, t: T): string {
  return MOTIVOS[motivo] ? t(MOTIVOS[motivo]) : t("conexionEquipo.motivo.otro", { motivo: motivo || "?" });
}

/** El nombre de un campo; uno que no se conoce (un campo de más), tal cual. */
export function textoDelCampo(campo: string, t: T): string {
  return CAMPOS[campo] ? t(CAMPOS[campo]) : campo;
}

/** Un valor como se lee: las horas sin segundos («08:00:00» → «08:00»). */
export function valorLegible(campo: string, v: string | null): string | null {
  if (v && (campo === "hora_entrada" || campo === "hora_salida")) return v.replace(/^(\d{1,2}:\d{2}):00$/, "$1");
  return v;
}

/** create_user pide nombre y (opcional) apellido. Sin nombre, la parte del correo
 *  antes de la arroba, sin puntos ni guiones: «ana.torres@…» → «Ana» «Torres». */
export function partirNombre(nombre: string | null, correo: string): { first_name: string; last_name: string } {
  const base = (nombre ?? "").trim() ||
    correo.split("@")[0].replace(/[._-]+/g, " ").trim().replace(/\b\p{L}/gu, (l) => l.toUpperCase());
  const partes = base.split(/\s+/).filter(Boolean);
  return { first_name: partes[0] ?? correo, last_name: partes.slice(1).join(" ") };
}

/** «hace 5 minutos», «ayer», «hace 3 días», en el idioma que se pida. */
export function haceCuanto(iso: string, locale: string, ahora = Date.now()): string {
  const seg = Math.round((Date.parse(iso) - ahora) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(seg);
  if (abs < 60) return rtf.format(seg, "second");
  if (abs < 3600) return rtf.format(Math.round(seg / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seg / 3600), "hour");
  return rtf.format(Math.round(seg / 86_400), "day");
}

/** La primera letra, para el avatar de una letra. */
export function inicial(nombre: string | null | undefined, otro = "?"): string {
  const l = (nombre ?? "").trim().match(/\p{L}|\p{N}/u);
  return (l?.[0] ?? otro).toUpperCase();
}
