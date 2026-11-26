import { ErrorDePlataforma, type AdminDePlataforma, type ClienteDelDueno, type EventoDelHistorial, type FichaDelCliente, type Invitacion, type PanelDelDueno, type Persona, type PlataformaDatos, type PlanYPagos, type ResumenDeMiEmpresa, type RolDePersona, type Yo } from "./tipos";

// LA PLATAFORMA CONTRA EL EDIFICIO (maven-agencias, ezeigddgkaemxpshghmu).
//
// Se usa cuando la pestaña está conectada al EDIFICIO (la puerta la mandó allá:
// destinoDeEstaPestana() === "edificio") y quien entra es de la plataforma o admin de un
// cliente (ver index.ts → modoPlataforma). El cliente de Supabase lo pasa quien llama
// (contexto.tsx): en una pestaña del edificio, `@/integrations/supabase/client` YA es el
// del edificio; en una de Kash este archivo nunca se carga en modo real.
//
// Cada método llama a las funciones de infra/edificio/migraciones/ (arbol_funciones y
// quien_soy). Lo que todavía no tiene función (crear cuentas, correos, Stripe) va por
// la edge «plataforma» del edificio, que aún no existe: hoy tira `no_disponible`
// («Disponible cuando…» en la pantalla) en vez de inventar.

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
  // La edge «plataforma» del edificio (supabase/functions/plataforma): la cuenta del Dueño,
  // su invitación y «Crear mi contraseña». Las acciones que todavía no tiene (agregar
  // personas, Stripe…) contestan «accion_desconocida» → «no disponible», nunca un éxito falso.
  const { data, error } = await c.functions.invoke<{ ok: boolean; data?: T; error?: string; detalle?: string }>("plataforma", { body: { accion, ...body } });
  if (error) throw new ErrorDePlataforma("no_disponible", accion);
  if (!data?.ok) {
    if (!data?.error || data.error === "accion_desconocida") throw new ErrorDePlataforma("no_disponible", accion);
    // «faltan_pendientes: setup_sin_pagar, …»: la pantalla lee la clave y el detalle.
    throw new Error(data.detalle && !data.detalle.startsWith(data.error) ? `${data.error}: ${data.detalle}` : data.detalle || data.error);
  }
  return data.data as T;
}

const noDisponible = (que: string): never => { throw new ErrorDePlataforma("no_disponible", que); };

type ResumenCrudo = {
  organizacion: ResumenDeMiEmpresa["organizacion"];
  paquete: number; ocupadas: number; en_vivo: number;
  argos: ResumenDeMiEmpresa["argos"]; necesita_de_ti: number;
  agencias: { id: string; nota_argos_hoy: number | null }[];
};

/** El resumen de Kash tal como lo guarda refrescar-externas, con lo que falte en cero / null. */
function resumenExterno(r: Partial<PanelDelDueno["externas"][number]["resumen"]> | null | undefined): PanelDelDueno["externas"][number]["resumen"] {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const o = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const x = (r ?? {}) as Record<string, unknown>;
  return {
    ...(x as object),
    personas: n(x.personas), en_vivo: n(x.en_vivo), nota_argos_hoy: o(x.nota_argos_hoy),
    argos_gastado_mes_usd: n(x.argos_gastado_mes_usd), argos_saldo_usd: o(x.argos_saldo_usd), necesita_de_ti: n(x.necesita_de_ti),
  } as PanelDelDueno["externas"][number]["resumen"];
}

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
      // infra/edificio/migraciones/20261120120000_quien_soy.sql
      const r = await rpc<{ user_id: string; nombre: string; correo: string; tipo: Yo["tipo"] | null; organizacion_id: string | null } | null>(c, "quien_soy_en_la_plataforma");
      // Ni plataforma ni admin de un cliente: esta casa no es la suya (vuelve a /dashboard).
      if (!r?.tipo) throw new ErrorDePlataforma("sin_permiso", "fuera_de_la_plataforma");
      return {
        user_id: r.user_id, nombre: r.nombre, correo: r.correo, tipo: r.tipo,
        ...(r.organizacion_id ? { organizacion_id: r.organizacion_id } : {}),
      } satisfies Yo;
    },

    async organizacionesDelDueno() {
      const r = await rpc<{ clientes: (Omit<ClienteDelDueno, "admin_principal"> & { admin_principal?: ClienteDelDueno["admin_principal"] })[]; externas: PanelDelDueno["externas"]; ve_precios: boolean }>(c, "organizaciones_del_dueno");
      // Kash (organizaciones_externas) llega con lo que mandó kash-resumen: lo que falte va
      // en cero/null, nunca inventado.
      return {
        ve_precios: !!r.ve_precios,
        clientes: (r.clientes ?? []).map((x) => ({ ...x, admin_principal: x.admin_principal ?? null })),
        externas: (r.externas ?? []).map((e) => ({ ...e, resumen: resumenExterno(e.resumen) })),
      };
    },

    async crearOrganizacion(n) {
      // La edge crea la organización (con la sesión de quien llama: los candados son de la
      // base) y la cuenta del Dueño, sin correo: el cliente nace en preparación. Si la cuenta
      // del Dueño falla, el cliente queda creado y la ficha ofrece ponerlo otra vez.
      const r = await edge<{ organizacion_id: string }>(c, "crear_cliente", {
        nombre: n.nombre, idioma: n.idioma, es_demo: n.es_demo, dueno_nombre: n.dueno.nombre, dueno_correo: n.dueno.correo,
      });
      return r.organizacion_id;
    },

    async fichaDe(org) {
      // infra/edificio/migraciones/20261125120500_nuevo_cliente.sql
      const [f, lideres] = await Promise.all([
        rpc<Omit<FichaDelCliente, "dueno">>(c, "ficha_de_organizacion", { _org: org }),
        rpc<{ user_id: string; nombre: string; correo: string; correo_madre: boolean; ultimo_ingreso: string | null }[]>(c, "lideres_de_organizacion", { _org: org }),
      ]);
      const d = lideres.find((l) => l.correo_madre) ?? null;
      return {
        ...f,
        ficha: f.ficha ?? {},
        faltan: f.faltan ?? [],
        dueno: d ? { user_id: d.user_id, nombre: d.nombre, correo: d.correo, entro_at: d.ultimo_ingreso } : null,
      };
    },

    async guardarFicha(org, cambios) { await rpc(c, "guardar_ficha", { _org: org, _cambios: cambios }); },
    async ponerDueno(org, nombre, correo) { await edge(c, "poner_dueno", { organizacion_id: org, dueno_nombre: nombre, dueno_correo: correo }); },
    async reenviarInvitacionDueno(org) { return edge<Invitacion>(c, "reenviar_invitacion", { organizacion_id: org }); },
    async pausarOrganizacion(org, motivo) { await rpc(c, "pausar_organizacion", { _org: org, _motivo: motivo }); },
    async reactivarOrganizacion(org) { await rpc(c, "reactivar_organizacion", { _org: org }); },
    async extenderPrueba(org, dias) { await rpc(c, "extender_prueba", { _org: org, _dias: dias }); },

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
      // Activar (candados de la base) + invitar al Dueño en un solo paso de la edge.
      return edge<Invitacion>(c, "activar_e_invitar", { organizacion_id: org });
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

    // La lista se lee directo (equipo_de_maven); agregar / quitar / reenviar van por la edge.
    async equipoMaven() { return rpc<AdminDePlataforma[]>(c, "equipo_de_maven"); },
    async agregarAdminPlataforma(nombre, correo) { return edge(c, "agregar_admin_plataforma", { nombre, correo }); },
    async quitarAdminPlataforma(user) { await edge(c, "quitar_admin_plataforma", { user_id: user }); },
    async reenviarInvitacionAdmin(user) { await edge(c, "reenviar_invitacion_admin", { user_id: user }); },
    async todasLasPersonas() { return noDisponible("todas_las_personas"); },
  };
}
