import { ErrorDePlataforma, type ClienteDelDueno, type EventoDelHistorial, type PanelDelDueno, type Persona, type PlataformaDatos, type PlanYPagos, type ResumenDeMiEmpresa, type RolDePersona, type Yo } from "./tipos";

// LA PLATAFORMA CONTRA EL EDIFICIO (maven-agencias, ezeigddgkaemxpshghmu).
//
// ⚠️ TODAVÍA NO SE USA. Se enciende el día del cliente (tanda 6), con un cliente
// de Supabase PROPIO del edificio — NUNCA el de Kash (`@/integrations/supabase/client`,
// base lsagslbkliprespbyhts, que no se toca). Por eso aquí no se importa ese
// cliente: quien llame pasa el suyo.
//
// Cada método llama a las funciones de
// infra/edificio/migraciones/20261119211000_arbol_funciones.sql. Lo que todavía
// no tiene función (cuentas, correos, Stripe) va por la edge del edificio y está
// marcado TODO: hoy tira `no_disponible` en vez de inventar.

type Respuesta<T> = { data: T | null; error: { message?: string; code?: string } | null };

/** Lo mínimo de un SupabaseClient que se usa aquí (así no se ata al de Kash). */
export interface ClienteDelEdificio {
  rpc<T = unknown>(fn: string, args?: Record<string, unknown>): PromiseLike<Respuesta<T>>;
  from(tabla: string): {
    select(cols: string): {
      eq(col: string, v: unknown): { order(col: string, o: { ascending: boolean }): PromiseLike<Respuesta<unknown[]>> };
    };
  };
  functions: { invoke<T = unknown>(fn: string, o: { body: Record<string, unknown> }): Promise<Respuesta<T>> };
}

async function rpc<T>(c: ClienteDelEdificio, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await c.rpc<T>(fn, args);
  // PostgREST: `null` con error es un FALLO, no «vacío» (CLAUDE.md).
  if (error) throw new Error(error.message || fn);
  return data as T;
}

async function edge<T>(c: ClienteDelEdificio, accion: string, body: Record<string, unknown>): Promise<T> {
  // TODO(vagón 5): edge «plataforma» del edificio (crea cuentas, manda correos con Resend
  // desde noreply@envios.maven-ai.me, Stripe). Hasta que exista, no se finge nada.
  const { data, error } = await c.functions.invoke<{ ok: boolean; data?: T; error?: string }>("plataforma", { body: { accion, ...body } });
  if (error) throw new Error(error.message || accion);
  if (!data?.ok) throw new Error(data?.error || "no_disponible");
  return data.data as T;
}

const noDisponible = (que: string): never => { throw new ErrorDePlataforma("no_disponible", que); };

type ResumenCrudo = {
  organizacion: ResumenDeMiEmpresa["organizacion"];
  paquete: number; ocupadas: number; en_vivo: number;
  argos: ResumenDeMiEmpresa["argos"]; necesita_de_ti: number;
  agencias: { id: string; nota_argos_hoy: number | null }[];
};

const ROL_DE_NIVEL: Record<string, RolDePersona> = { admin: "admin", supervisor: "supervisor" };

export function crearPlataformaSupabase(c: ClienteDelEdificio): PlataformaDatos {
  const resumen = (org: string) => rpc<ResumenCrudo>(c, "resumen_organizacion", { _org: org });
  // El cliente normal tiene UNA agencia (tenant): ahí vive su gente.
  const tenantDe = async (org: string) => {
    const r = await resumen(org);
    const t = r.agencias[0]?.id;
    if (!t) throw new ErrorDePlataforma("no_disponible", "cliente_sin_agencia");
    return t;
  };

  return {
    async quienSoy() {
      // TODO(vagón 4): una función `quien_soy_en_la_plataforma()` (plataforma_admins.nivel /
      // organizacion_admins). Mientras, se deduce de la marca de la organización.
      const marca = await rpc<{ organizacion_id: string } | null>(c, "marca_de_mi_organizacion");
      if (marca?.organizacion_id) return { user_id: "", nombre: "", correo: "", tipo: "admin_cliente", organizacion_id: marca.organizacion_id } satisfies Yo;
      return noDisponible("quien_soy");
    },

    async organizacionesDelDueno() {
      const r = await rpc<{ clientes: (Omit<ClienteDelDueno, "admin_principal"> & { admin_principal?: ClienteDelDueno["admin_principal"] })[]; externas: PanelDelDueno["externas"]; ve_precios: boolean }>(c, "organizaciones_del_dueno");
      return { ...r, clientes: r.clientes.map((x) => ({ ...x, admin_principal: x.admin_principal ?? null })) };
    },

    async crearOrganizacion(n) {
      const id = await rpc<string>(c, "crear_organizacion", {
        _nombre: n.nombre, _tipo: "normal", _plan: n.plan, _marca: n.marca, _es_demo: n.es_demo,
      });
      // La cuenta del admin y su silla las arma la edge (no manda correo: el cliente nace en preparación).
      await edge(c, "crear_admin_cliente", { organizacion_id: id, ...n.admin });
      return id;
    },

    async marcarComoDemo(org, esDemo) {
      // TODO(vagón 4): `marcar_demo(_org, _es_demo)` en el edificio (es_demo solo lo cambia la plataforma).
      await edge(c, "marcar_demo", { organizacion_id: org, es_demo: esDemo });
    },

    async pendientesDe(org) {
      const [r, lideres, plan] = await Promise.all([
        resumen(org),
        rpc<{ user_id: string; nombre: string; correo: string; correo_madre: boolean; ultimo_ingreso: string | null }[]>(c, "lideres_de_organizacion", { _org: org }),
        rpc<PlanYPagos & { cobro: Record<string, unknown> | null }>(c, "plan_de_organizacion", { _org: org }),
      ]);
      const lider = lideres.find((l) => l.correo_madre) ?? lideres[0] ?? null;
      const cobro = (plan.cobro ?? {}) as { stripe_customer_id?: string; primer_cobro_at?: string; activada_at?: string };
      return {
        estado: r.organizacion.estado,
        lider: lider ? { user_id: lider.user_id, nombre: lider.nombre, correo: lider.correo, entro_at: lider.ultimo_ingreso } : null,
        marca: !!(r.organizacion.marca?.nombre && r.organizacion.marca?.logo_url),
        plan: r.paquete > 0,
        tarjeta: !!cobro.stripe_customer_id || !!r.organizacion.plan?.sin_tarjeta,
        sin_tarjeta: !!r.organizacion.plan?.sin_tarjeta,
        activada_at: r.organizacion.estado === "preparacion" ? null : cobro.activada_at ?? null,
        primer_cobro_at: cobro.primer_cobro_at ?? null,
      };
    },

    async activarOrganizacion(org) {
      await rpc(c, "activar_organizacion", { _org: org });
      // Al activar, la edge manda la invitación del admin («Crear mi contraseña», 7 días).
      return edge<{ invitado: string }>(c, "invitar_admin_cliente", { organizacion_id: org });
    },

    async recargarArgosManual(org, usd) {
      await rpc(c, "argos_acreditar", { _org: org, _tenant: null, _tipo: "recarga", _usd: usd, _referencia: null, _detalle: { manual: true } });
      return (await resumen(org)).argos;
    },

    async cambiarMarca(org, marca) {
      // TODO(vagón 6): subir el logo al bucket de marcas del edificio y guardar organizaciones.marca.
      await edge(c, "cambiar_marca", { organizacion_id: org, marca });
    },

    async enviarLinkDeTarjeta(org) {
      // TODO(vagón 7): Stripe Checkout en modo «setup» con el correo del admin principal.
      return edge<{ correo: string }>(c, "link_de_tarjeta", { organizacion_id: org });
    },

    async resumenDeMiEmpresa(org) {
      const r = await resumen(org);
      const notas = r.agencias.map((a) => a.nota_argos_hoy).filter((n): n is number => typeof n === "number");
      return {
        organizacion: r.organizacion, tenant_id: r.agencias[0]?.id ?? "", paquete: r.paquete, ocupadas: r.ocupadas,
        en_vivo: r.en_vivo, nota_argos_hoy: notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : null,
        argos: r.argos, necesita_de_ti: r.necesita_de_ti,
        // TODO(vagón 7): el estado del cobro sale del webhook de Stripe (organizaciones.cobro.estado).
        estado_cobro: "al_dia",
      };
    },

    async personas(org) {
      const tenant = await tenantDe(org);
      const filas = await rpc<{ user_id: string; nombre: string; correo: string; nivel: string | null; es_dueno: boolean; en_vivo: boolean; desde: string }[]>(c, "personas_de_agencia", { _tenant: tenant });
      return filas.map((f): Persona => ({
        user_id: f.user_id, nombre: f.nombre, correo: f.correo,
        rol: f.es_dueno ? "admin" : ROL_DE_NIVEL[f.nivel ?? ""] ?? "empleado",
        // TODO(vagón 5): «invitada» = sin enlace de acceso usado; última actividad y nota por persona.
        estado: "activa", en_vivo: f.en_vivo, ultima_actividad: null, nota_argos: null, desde: f.desde,
      }));
    },

    async agregarPersona(org, nueva) { return edge<Persona>(c, "agregar_persona", { organizacion_id: org, ...nueva }); },
    async cambiarRol(org, user, rol) { await edge(c, "cambiar_rol", { organizacion_id: org, user_id: user, rol }); },
    async quitarPersona(org, user) { await edge(c, "quitar_persona", { organizacion_id: org, user_id: user }); },
    async reenviarInvitacion(org, user) { await edge(c, "reenviar_invitacion", { organizacion_id: org, user_id: user }); },

    async historial(org) {
      const { data, error } = await c.from("organizacion_bitacora")
        .select("id, created_at, actor_nombre, actor_tipo, accion, detalle")
        .eq("organizacion_id", org)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message || "historial");
      return ((data ?? []) as (Omit<EventoDelHistorial, "at"> & { created_at: string })[]).map(({ created_at, ...e }) => ({ ...e, at: created_at }));
    },

    async planYPagos(org) {
      const r = await rpc<{ plan: PlanYPagos["plan"]; ve_precios: boolean; cobro: Record<string, unknown> | null }>(c, "plan_de_organizacion", { _org: org });
      // TODO(vagón 7): facturas, tarjeta y próximo cobro salen de Stripe (edge), no de la base.
      return { plan: r.plan, ve_precios: r.ve_precios, cobro: null };
    },

    async iniciarRecarga(org) {
      // TODO(vagón 7): Stripe Checkout (USD 25 → USD 50); el webhook acredita con argos_acreditar.
      return edge<{ url: string }>(c, "recarga_argos_checkout", { organizacion_id: org });
    },

    async equipoMaven() { return edge(c, "equipo_maven", {}); },
    async agregarAdminPlataforma(nombre, correo) { return edge(c, "agregar_admin_plataforma", { nombre, correo }); },
    async quitarAdminPlataforma(user) { await edge(c, "quitar_admin_plataforma", { user_id: user }); },
    async reenviarInvitacionAdmin(user) { await edge(c, "reenviar_invitacion_admin", { user_id: user }); },
    async todasLasPersonas() { return noDisponible("todas_las_personas"); },
  };
}
